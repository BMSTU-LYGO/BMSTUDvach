import { reactive } from 'vue'

/**
 * Single source of truth for the route-aware 3D scene.
 *
 * Views mutate it (board hover, new reply, story count, route mode);
 * the persistent NetworkCanvas reads and animates it. Keeping this outside
 * the component tree is what lets one WebGL scene serve every route.
 */

export type SceneMode = 'home' | 'board' | 'thread' | 'platinum' | 'error'

export type SceneEvent =
  /** Expanding signal ring at the node for a board slug. */
  | { type: 'pulse'; target: string }
  /** A new reply arrived in the open thread: packet flies to the core. */
  | { type: 'reply' }
  /** 404 screen: signal the lost node and try to find the way back. */
  | { type: 'rescue' }
  /** Signal Dock took focus: the core brightens slightly. */
  | { type: 'composer-focus' }
  /** Signal Dock released focus. */
  | { type: 'composer-blur' }
  /** Report probe opened on a post: a local danger node lights up. */
  | { type: 'report-open' }
  /** Report delivered: the pulse travels back into the post. */
  | { type: 'report-submit' }
  /** Thread launched from a board: the cluster answers. */
  | { type: 'thread-launch'; target: string }
  /** Route transition started: warp overlay is up, camera is travelling. */
  | { type: 'transition-start'; from: SceneMode; to: SceneMode }
  /** Route transition finished: the new mode has settled. */
  | { type: 'transition-end'; from: SceneMode; to: SceneMode }
  /** Archive Space: a fragment took focus (null = focus released). */
  | { type: 'archive-focus'; target: number | null }
  /** Archive Space: a fragment was opened, the story is coming. */
  | { type: 'archive-open'; target: number }
  /** Archive Space: the archive was cleared, there is nothing left to see. */
  | { type: 'archive-clear' }

/**
 * Compact board descriptor the 3D constellation map works with: the API
 * `Board` carries far more than the scene needs (ids, timestamps, rules).
 */
export interface BoardSummary {
  slug: string
  /** `thread_count` of the API board — drives node size/glow. */
  threadCount: number
  /** `order` of the API board — drives the tier the node sits on. */
  order: number
  name?: string
  description?: string
}

/**
 * Compact story descriptor the Archive Space works with: the API
 * `PlatinumStory` carries body text and metadata the scene has no use for.
 */
export interface ArchiveStoryRef {
  id: number
  title: string
  /** Publication year (null = undated story). */
  year: number | null
  /** Archive ring the fragment belongs to (0 = innermost). */
  ringIndex: number
  /** API `source_type` (null = unknown). */
  sourceType: string | null
}

interface SceneState {
  mode: SceneMode
  boardSlug: string | null
  threadId: number | null
  /** Board node highlighted by card hover/focus (null = none). */
  highlightedBoard: string | null
  /** Boards currently shown in the network (home/board routes). */
  boards: BoardSummary[]
  /** Published platinum stories — drives archive fragments. */
  storyCount: number
  /** Stories currently placed in the archive space (one fragment each). */
  archiveStories: ArchiveStoryRef[]
  /** Story the camera focuses on (null = free orbit). */
  focusedStory: number | null
  /** Story the user opened (null = nothing opened). */
  selectedStory: number | null
}

export const sceneState = reactive<SceneState>({
  mode: 'home',
  boardSlug: null,
  threadId: null,
  highlightedBoard: null,
  boards: [],
  storyCount: 0,
  archiveStories: [],
  focusedStory: null,
  selectedStory: null,
})

export function setSceneMode(
  mode: SceneMode,
  opts: { boardSlug?: string | null; threadId?: number | null } = {},
) {
  sceneState.mode = mode
  sceneState.boardSlug =
    mode === 'board' ? opts.boardSlug ?? null : null
  sceneState.threadId =
    mode === 'thread' ? opts.threadId ?? null : null
  if (mode !== 'home' && mode !== 'board') {
    sceneState.highlightedBoard = null
  }
}

export function syncBoards(boards: BoardSummary[]) {
  // Copy: callers reuse their (reactive) arrays, we must not alias them.
  sceneState.boards = boards.map((b) => ({ ...b }))
}

/** Board currently shown in the network, by slug (undefined = not loaded). */
export function getBoardBySlug(slug: string): BoardSummary | undefined {
  return sceneState.boards.find((b) => b.slug === slug)
}

export function highlightBoard(slug: string | null) {
  sceneState.highlightedBoard = slug
}

export function setStoryCount(count: number) {
  sceneState.storyCount = count
  // An empty archive is a clean slate: the fragments and every focus or
  // selection that pointed into them go away with it.
  if (count === 0) {
    sceneState.archiveStories = []
    sceneState.focusedStory = null
    sceneState.selectedStory = null
  }
}

/**
 * Replace the stories placed in the archive space. The list is copied
 * (element by element) so the scene never aliases the caller's reactive
 * API arrays. Focus and selection that point at a story which is no longer
 * in the set are dropped.
 */
export function setArchiveStories(refs: ArchiveStoryRef[]) {
  // Copy: callers reuse their (reactive) arrays, we must not alias them.
  sceneState.archiveStories = refs.map((r) => ({ ...r }))
  const ids = new Set(sceneState.archiveStories.map((r) => r.id))
  if (sceneState.focusedStory !== null && !ids.has(sceneState.focusedStory)) {
    sceneState.focusedStory = null
  }
  if (sceneState.selectedStory !== null && !ids.has(sceneState.selectedStory)) {
    sceneState.selectedStory = null
  }
}

/** Story the archive space focuses on (null = free orbit). */
export function focusStory(id: number | null) {
  sceneState.focusedStory = id
}

/** Story the user opened in the archive space (null = nothing opened). */
export function selectStory(id: number | null) {
  sceneState.selectedStory = id
}

/** Story currently placed in the archive space, by id (undefined = unknown). */
export function getArchiveStory(id: number): ArchiveStoryRef | undefined {
  return sceneState.archiveStories.find((s) => s.id === id)
}

const listeners = new Set<(ev: SceneEvent) => void>()

/** Subscribe to one-shot scene events. Returns an unsubscribe function. */
export function onSceneEvent(fn: (ev: SceneEvent) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitSceneEvent(ev: SceneEvent) {
  for (const fn of Array.from(listeners)) {
    try {
      fn(ev)
    } catch (err) {
      // One broken listener must not kill the whole event bus.
      console.error('scene event listener failed:', err)
    }
  }
}

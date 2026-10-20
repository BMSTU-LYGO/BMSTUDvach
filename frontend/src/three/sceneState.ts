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
}

export const sceneState = reactive<SceneState>({
  mode: 'home',
  boardSlug: null,
  threadId: null,
  highlightedBoard: null,
  boards: [],
  storyCount: 0,
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

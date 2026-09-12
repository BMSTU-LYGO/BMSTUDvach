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

interface SceneState {
  mode: SceneMode
  boardSlug: string | null
  threadId: number | null
  /** Board node highlighted by card hover/focus (null = none). */
  highlightedBoard: string | null
  /** Board slugs currently shown in the network (home/board routes). */
  boards: string[]
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

export function syncBoards(slugs: string[]) {
  sceneState.boards = slugs.slice()
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

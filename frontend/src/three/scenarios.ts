import type { SceneMode } from './sceneState'
import type { WarpKind } from './warps'
import type { TransitionEasing } from './transitionDirector'

export type { SceneMode, WarpKind, TransitionEasing }

/**
 * Route transition registry.
 *
 * A transition is not a mask slapped on the page — it is one camera journey
 * between two scene modes. Every registered route pair maps to a scenario
 * that describes the whole trip: which warp overlay plays, which camera
 * preset the journey ends at, and which element stays continuous across the
 * cut (shared-element continuity).
 *
 * `warpKindFor` remains the low-level helper used directly by the legacy
 * path; `scenarioFor` is the richer lookup on top of this registry.
 */

export type SharedElementStrategy =
  /** home↔board: the shared board node becomes the camera anchor. */
  | 'board-node-anchor'
  /** board→thread: a packet flies from the board node into the core. */
  | 'thread-packet-envoy'
  /** home/board↔platinum: the topology itself morphs into the archive. */
  | 'archive-morph'
  /** any→error: the camera dives into the core, the lost node materializes. */
  | 'dive-to-lost'
  /** No continuity element — plain fallback trip. */
  | 'none'

export interface TransitionScenario {
  id: string
  /** Origin mode, or '*' for any mode. */
  from: SceneMode | '*'
  /** Destination mode, or '*' for any mode. */
  to: SceneMode | '*'
  kind: WarpKind
  durationMs: number
  easing: TransitionEasing
  /** Camera preset the journey settles into. */
  cameraPreset: SceneMode
  sharedElement: SharedElementStrategy
}

const SCENARIO_DURATION_MS = 650

/** Fallback trip for any (from, to) pair without a dedicated scenario. */
const SOFT_VEIL: TransitionScenario = {
  id: 'soft-veil',
  from: '*',
  to: '*',
  kind: 'soft',
  durationMs: SCENARIO_DURATION_MS,
  easing: 'easeInOutCubic',
  // No specific destination: callers should prefer their own target mode.
  cameraPreset: 'home',
  sharedElement: 'none',
}

export const scenarios: TransitionScenario[] = [
  // home ↔ board — a signal front travels out to the chosen board node.
  {
    id: 'signal-travel',
    from: 'home',
    to: 'board',
    kind: 'signal',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'board',
    sharedElement: 'board-node-anchor',
  },
  {
    id: 'signal-return',
    from: 'board',
    to: 'home',
    kind: 'signal',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'home',
    sharedElement: 'board-node-anchor',
  },
  // board ↔ thread — the camera sinks through the depth tunnel.
  {
    id: 'depth-tunnel',
    from: 'board',
    to: 'thread',
    kind: 'tunnel',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'thread',
    sharedElement: 'thread-packet-envoy',
  },
  {
    id: 'depth-tunnel-reverse',
    from: 'thread',
    to: 'board',
    kind: 'tunnel',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'board',
    sharedElement: 'thread-packet-envoy',
  },
  // any → platinum — the network folds into the archive rings.
  {
    id: 'archive-morph',
    from: 'home',
    to: 'platinum',
    kind: 'fracture',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'platinum',
    sharedElement: 'archive-morph',
  },
  {
    id: 'archive-morph-from-board',
    from: 'board',
    to: 'platinum',
    kind: 'fracture',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'platinum',
    sharedElement: 'archive-morph',
  },
  {
    id: 'archive-morph-from-thread',
    from: 'thread',
    to: 'platinum',
    kind: 'fracture',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'platinum',
    sharedElement: 'archive-morph',
  },
  // platinum → back into the live network.
  {
    id: 'archive-unmorph-to-home',
    from: 'platinum',
    to: 'home',
    kind: 'fracture',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'home',
    sharedElement: 'archive-morph',
  },
  {
    id: 'archive-unmorph-to-board',
    from: 'platinum',
    to: 'board',
    kind: 'fracture',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'board',
    sharedElement: 'archive-morph',
  },
  {
    id: 'archive-unmorph-to-thread',
    from: 'platinum',
    to: 'thread',
    kind: 'fracture',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'thread',
    sharedElement: 'archive-morph',
  },
  // any → error — dive into the core, the lost node materializes there.
  // Core dive: the camera falls into the backbone, the lost node materialises.
  {
    id: 'core-dive',
    from: 'home',
    to: 'error',
    kind: 'dive',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'error',
    sharedElement: 'dive-to-lost',
  },
  {
    id: 'core-dive-from-board',
    from: 'board',
    to: 'error',
    kind: 'dive',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'error',
    sharedElement: 'dive-to-lost',
  },
  {
    id: 'core-dive-from-thread',
    from: 'thread',
    to: 'error',
    kind: 'dive',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'error',
    sharedElement: 'dive-to-lost',
  },
  {
    id: 'core-dive-from-platinum',
    from: 'platinum',
    to: 'error',
    kind: 'dive',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'error',
    sharedElement: 'dive-to-lost',
  },
  // error → home — the rescue signal leads back to the constellation.
  {
    id: 'rescue-signal',
    from: 'error',
    to: 'home',
    kind: 'signal',
    durationMs: SCENARIO_DURATION_MS,
    easing: 'easeInOutCubic',
    cameraPreset: 'home',
    sharedElement: 'none',
  },
  SOFT_VEIL,
]

/**
 * Look up the scenario for a route pair: exact match first, then any
 * wildcard entry, then the soft-veil fallback.
 */
export function scenarioFor(from: SceneMode, to: SceneMode): TransitionScenario {
  const exact = scenarios.find((s) => s.from === from && s.to === to)
  if (exact) return exact

  const partial = scenarios.find(
    (s) => (s.from === '*' || s.from === from) && (s.to === '*' || s.to === to),
  )
  return partial ?? SOFT_VEIL
}

export const FALLBACK_SCENARIO = SOFT_VEIL

import type { NetworkController } from '@/three/network'
import type { SceneMode } from './sceneState'
import { emitSceneEvent, sceneState } from './sceneState'
import { prefersReducedMotion } from '@/composables/useGsap'
import { playWarp } from './warps'
import { scenarioFor, type SharedElementStrategy } from './scenarios'

export const TRANSITION_DURATION_MS = 650

export type TransitionEasing = 'easeInOutCubic'

export interface CameraTravelRequest {
  preset: SceneMode
  durationMs: number
  easing: TransitionEasing
  /** Shared element for this trip — see `NetworkController.travelTo`. */
  sharedSlug?: string | null
}

export interface NetworkWithTravel extends NetworkController {
  travelTo(request: CameraTravelRequest): void
  morphTo(target: SceneMode, durationMs: number): void
}

export interface TransitionContext {
  network?: NetworkWithTravel | null
}

/** Per-call extras for `playTransition` — mostly shared-element plumbing. */
export interface TransitionRequest {
  /**
   * Board the trip is about. Read from `sceneState` when the caller does not
   * pass it: for board→home / board→thread that is the board we are leaving
   * (where the envoy packet flies from), for home→board callers pass the
   * destination node.
   */
  boardSlug?: string | null
  /** Thread the trip enters, when the route carries one. */
  threadId?: number | null
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

let ctx: TransitionContext = {}
let endTimer: ReturnType<typeof setTimeout> | null = null

export function initTransitionDirector(next: TransitionContext = {}): void {
  ctx = next
  if (endTimer !== null) {
    clearTimeout(endTimer)
    endTimer = null
  }
}

export function setTransitionNetwork(net: NetworkController | null): void {
  ctx = { ...ctx, network: net }
}

function clearPendingEnd() {
  if (endTimer === null) return
  clearTimeout(endTimer)
  endTimer = null
}

/**
 * Shared-element continuity: whatever stays connected across the cut gets set
 * up *before* the camera starts travelling, so it reads as one move rather
 * than two. `archive-morph` / `dive-to-lost` rewire the topology itself.
 */
function applySharedElement(
  net: NetworkWithTravel | null | undefined,
  strategy: SharedElementStrategy,
  request: { from: SceneMode; boardSlug: string | null; durationMs: number },
): void {
  if (strategy === 'board-node-anchor') {
    if (request.boardSlug) net?.anchorSharedElement(request.boardSlug)
    return
  }
  if (strategy === 'thread-packet-envoy') {
    if (request.from === 'board' && request.boardSlug) {
      net?.launchEnvoyPacket(request.boardSlug)
    }
    return
  }
  if (strategy === 'archive-morph') {
    net?.morphTo('platinum', request.durationMs)
    return
  }
  if (strategy === 'dive-to-lost') {
    net?.morphTo('error', request.durationMs)
  }
}

export function playTransition(
  from: SceneMode,
  to: SceneMode,
  context: TransitionRequest = {},
): void {
  if (from === to) return

  clearPendingEnd()

  if (prefersReducedMotion()) {
    playWarp('soft')
    return
  }

  const scenario = scenarioFor(from, to)
  const net = ctx.network
  const boardSlug = context.boardSlug ?? sceneState.boardSlug

  applySharedElement(net, scenario.sharedElement, {
    from,
    boardSlug,
    durationMs: scenario.durationMs,
  })

  net?.travelTo({
    preset: scenario.cameraPreset,
    durationMs: scenario.durationMs,
    easing: scenario.easing,
  })
  playWarp(scenario.kind)

  emitSceneEvent({ type: 'transition-start', from, to })
  endTimer = setTimeout(() => {
    endTimer = null
    net?.anchorSharedElement(null)
    emitSceneEvent({ type: 'transition-end', from, to })
  }, TRANSITION_DURATION_MS)
}

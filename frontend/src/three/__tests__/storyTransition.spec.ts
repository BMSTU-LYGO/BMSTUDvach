import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The story trip inside the archive space: `/platinum` → `/platinum/:id` and
 * back. Both ends live in the `platinum` scene mode, so the trip is chosen
 * by direction, not by the mode pair.
 */

const motion = vi.hoisted(() => ({ reduced: false }))

vi.mock('@/composables/useGsap', () => ({
  gsap: { from: vi.fn(), to: vi.fn(), fromTo: vi.fn(), set: vi.fn() },
  ScrollTrigger: {},
  Flip: {},
  prefersReducedMotion: () => motion.reduced,
  isTouchDevice: () => false,
}))

import {
  initTransitionDirector,
  playStoryTransition,
  TRANSITION_DURATION_MS,
  type NetworkWithTravel,
} from '@/three/transitionDirector'
import { scenarioFor, storyScenario, STORY_SCENARIOS } from '@/three/scenarios'
import { onSceneEvent, type SceneEvent } from '@/three/sceneState'
import { registerWarpPlayer, type WarpKind } from '@/three/warps'

/** A network controller that only remembers what it was told to do. */
function fakeNetwork() {
  return {
    travelTo: vi.fn(),
    morphTo: vi.fn(),
    anchorSharedElement: vi.fn(),
  } as unknown as NetworkWithTravel
}

describe('story scenarios', () => {
  it('the reveal scenario is a soft trip anchored on the fragment', () => {
    const reveal = storyScenario('reveal')
    expect(reveal.id).toBe('story-reveal')
    expect(reveal.from).toBe('platinum')
    expect(reveal.to).toBe('platinum')
    expect(reveal.kind).toBe('soft')
    expect(reveal.durationMs).toBe(520)
    expect(reveal.easing).toBe('easeInOutCubic')
    expect(reveal.cameraPreset).toBe('platinum')
    expect(reveal.sharedElement).toBe('archive-story-anchor')
  })

  it('the return scenario is the same trip in the other direction', () => {
    const back = storyScenario('return')
    expect(back.id).toBe('story-return')
    expect(back.kind).toBe('soft')
    expect(back.durationMs).toBe(520)
    expect(back.sharedElement).toBe('archive-story-anchor')
  })

  it('exposes both scenarios by direction', () => {
    expect(STORY_SCENARIOS.reveal).toBe(storyScenario('reveal'))
    expect(STORY_SCENARIOS.return).toBe(storyScenario('return'))
    expect(STORY_SCENARIOS.reveal.id).not.toBe(STORY_SCENARIOS.return.id)
  })

  it('the mode pair still resolves to the plain fallback', () => {
    // platinum→platinum says nothing about the direction, so the story
    // scenarios stay out of the mode lookup.
    expect(scenarioFor('platinum', 'platinum').id).toBe('soft-veil')
    expect(scenarioFor('platinum', 'home').id).toBe('archive-unmorph-to-home')
  })
})

describe('playStoryTransition', () => {
  let events: SceneEvent[]
  let stopListening: () => void
  let warps: WarpKind[]
  let net: NetworkWithTravel

  beforeEach(() => {
    motion.reduced = false
    vi.useFakeTimers()
    events = []
    warps = []
    stopListening = onSceneEvent((ev) => events.push(ev))
    registerWarpPlayer((kind) => warps.push(kind))
    net = fakeNetwork()
    initTransitionDirector({ network: net })
  })

  afterEach(() => {
    stopListening()
    registerWarpPlayer(null)
    initTransitionDirector({})
    vi.useRealTimers()
  })

  it('reveal opens the story and plays the trip', () => {
    playStoryTransition('reveal', 7)

    expect(events).toEqual([
      { type: 'archive-open', target: 7 },
      { type: 'transition-start', from: 'platinum', to: 'platinum' },
    ])
    expect(warps).toEqual(['soft'])
  })

  it('reveal ends the trip after the transition duration', () => {
    playStoryTransition('reveal', 7)

    vi.advanceTimersByTime(TRANSITION_DURATION_MS - 1)
    expect(events.some((ev) => ev.type === 'transition-end')).toBe(false)

    vi.advanceTimersByTime(1)
    expect(events[events.length - 1]).toEqual({
      type: 'transition-end',
      from: 'platinum',
      to: 'platinum',
    })
  })

  it('return clears the archive', () => {
    playStoryTransition('return', 7)

    expect(events).toEqual([
      { type: 'archive-clear' },
      { type: 'transition-start', from: 'platinum', to: 'platinum' },
    ])
    expect(warps).toEqual(['soft'])
  })

  it('never travels or morphs the network', () => {
    playStoryTransition('reveal', 7)
    playStoryTransition('return', 7)

    expect(net.travelTo).not.toHaveBeenCalled()
    expect(net.morphTo).not.toHaveBeenCalled()
    expect(net.anchorSharedElement).not.toHaveBeenCalled()
  })

  it('works without a network controller', () => {
    initTransitionDirector({})

    expect(() => playStoryTransition('reveal', 7)).not.toThrow()
    expect(events[0]).toEqual({ type: 'archive-open', target: 7 })
  })

  it('a quick second call does not leave a pending end behind', () => {
    playStoryTransition('reveal', 7)
    vi.advanceTimersByTime(100)
    playStoryTransition('return', 7)

    vi.advanceTimersByTime(TRANSITION_DURATION_MS * 2)

    const ends = events.filter((ev) => ev.type === 'transition-end')
    expect(ends).toHaveLength(1)
  })

  it('reduced motion plays only the soft veil', () => {
    motion.reduced = true

    playStoryTransition('reveal', 7)

    expect(warps).toEqual(['soft'])
    expect(events).toEqual([])
    expect(net.travelTo).not.toHaveBeenCalled()
    expect(net.morphTo).not.toHaveBeenCalled()

    vi.advanceTimersByTime(TRANSITION_DURATION_MS * 2)
    expect(events).toEqual([])
  })
})

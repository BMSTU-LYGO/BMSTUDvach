import { gsap, Flip, prefersReducedMotion } from './useGsap'

/**
 * Shared-element page morphs powered by GSAP Flip.
 *
 * Flow: on the source page capture an element's state before navigation
 * (`captureMorph`), then on the destination page morph a target element
 * from that captured state (`playMorph`).
 */

let pendingState: Flip.FlipState | null = null
let pendingId: string | null = null

export function captureMorph(el: HTMLElement | null, id: string) {
  if (!el || prefersReducedMotion()) return
  pendingState = Flip.getState(el)
  pendingId = id
}

export function playMorph(
  target: HTMLElement | null,
  id: string,
  options: { duration?: number } = {},
) {
  const { duration = 0.5 } = options
  if (!target || !pendingState || prefersReducedMotion()) {
    pendingState = null
    pendingId = null
    return
  }
  if (pendingId !== id) {
    // A morph for a different element was pending; drop it.
    pendingState = null
    pendingId = null
    return
  }

  Flip.from(pendingState, {
    targets: target,
    duration,
    ease: 'expo.out',
    absolute: true,
    onEnter: (elements) =>
      gsap.fromTo(
        elements,
        { opacity: 0.4 },
        { opacity: 1, duration: duration * 0.8 },
      ),
    onComplete: () => {
      pendingState = null
      pendingId = null
    },
  })
}

export function clearMorph() {
  pendingState = null
  pendingId = null
}

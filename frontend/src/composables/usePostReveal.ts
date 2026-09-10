import { watch, nextTick, type Ref } from 'vue'
import { gsap, prefersReducedMotion } from './useGsap'

/**
 * Cinematic staggered reveal for thread posts.
 * Animates newly added post elements whenever the posts count grows
 * (e.g. after fetching or posting a reply).
 */
export function usePostReveal(
  containerRef: Ref<HTMLElement | null>,
  postsCount: Ref<number>,
) {
  watch(postsCount, async (count, prev) => {
    if (prefersReducedMotion() || !containerRef.value || count <= (prev ?? 0)) return
    await nextTick()
    const els = containerRef.value.querySelectorAll('.post-item')
    const newEls = Array.from(els).slice(prev ?? 0)
    if (newEls.length === 0) return

    gsap.fromTo(
      newEls,
      { opacity: 0, y: 24, scale: 0.98 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        stagger: 0.08,
        ease: 'expo.out',
        clearProps: 'all',
      },
    )
  })
}

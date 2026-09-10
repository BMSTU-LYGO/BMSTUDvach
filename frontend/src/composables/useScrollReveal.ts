import { onMounted, onUnmounted, type Ref } from 'vue'
import { gsap, ScrollTrigger, prefersReducedMotion } from './useGsap'

interface ScrollRevealOptions {
  y?: number
  duration?: number
  delay?: number
  stagger?: number
  ease?: string
}

export function useScrollReveal(
  containerRef: Ref<HTMLElement | null>,
  selector: string = '.reveal',
  options: ScrollRevealOptions = {},
) {
  const {
    y = 30,
    duration = 0.7,
    delay = 0,
    stagger = 0.08,
    ease = 'expo.out',
  } = options

  let ctx: gsap.Context | null = null

  onMounted(() => {
    if (!containerRef.value || prefersReducedMotion()) return

    ctx = gsap.context(() => {
      const elements = containerRef.value!.querySelectorAll(selector)
      if (elements.length === 0) return

      gsap.set(elements, { opacity: 0, y })

      ScrollTrigger.batch(elements, {
        onEnter: (batch) => {
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration,
            delay,
            stagger,
            ease,
            overwrite: true,
          })
        },
        start: 'top 85%',
      })
    }, containerRef.value)
  })

  onUnmounted(() => {
    ctx?.revert()
  })
}

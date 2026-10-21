import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { prefersReducedMotion, isTouchDevice } from './useGsap'

interface TiltOptions {
  maxTilt?: number
  scale?: number
  speed?: number
}

interface TiltReturn {
  tiltX: Ref<number>
  tiltY: Ref<number>
  isHovered: Ref<boolean>
}

export function useTilt(
  elementRef: Ref<HTMLElement | null>,
  options: TiltOptions = {},
): TiltReturn {
  const { maxTilt = 8, scale = 1.02, speed = 400 } = options

  const tiltX = ref(0)
  const tiltY = ref(0)
  const isHovered = ref(false)

  let el: HTMLElement | null = null

  function handleMouseMove(event: MouseEvent) {
    if (!el) return
    const rect = el.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const percentX = (event.clientX - centerX) / (rect.width / 2)
    const percentY = (event.clientY - centerY) / (rect.height / 2)

    tiltY.value = percentX * maxTilt
    tiltX.value = -percentY * maxTilt

    el.style.transform = `perspective(800px) rotateX(${tiltX.value}deg) rotateY(${tiltY.value}deg) scale3d(${scale}, ${scale}, ${scale})`
  }

  /**
   * Тайминг наклона — из motion-системы: длительность и кривую наклон берёт
   * из общих токенов, а скорость (параметр хука) кладёт в токен длительности
   * на самом элементе. Имя роли и кривая остаются в системе, а параметр
   * остаётся живым: без него хук врал бы, что скорость можно менять.
   * `fallback` в инлайне — страховка, если motion.css не загрузился.
   */
  function applyTiming(target: HTMLElement) {
    target.style.setProperty('--motion-tilt-duration', `${speed}ms`)
    target.style.transition = `transform var(--motion-tilt-duration, ${speed}ms) var(--motion-tilt-ease, var(--ease-emphasized))`
  }

  function handleMouseEnter() {
    if (!el) return
    isHovered.value = true
    applyTiming(el)
  }

  function handleMouseLeave() {
    if (!el) return
    isHovered.value = false
    tiltX.value = 0
    tiltY.value = 0
    applyTiming(el)
    el.style.transform =
      'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
  }

  onMounted(() => {
    el = elementRef.value
    if (!el || prefersReducedMotion() || isTouchDevice()) return

    el.addEventListener('mousemove', handleMouseMove, { passive: true })
    el.addEventListener('mouseenter', handleMouseEnter)
    el.addEventListener('mouseleave', handleMouseLeave)
  })

  onUnmounted(() => {
    if (el) {
      el.removeEventListener('mousemove', handleMouseMove)
      el.removeEventListener('mouseenter', handleMouseEnter)
      el.removeEventListener('mouseleave', handleMouseLeave)
    }
  })

  return { tiltX, tiltY, isHovered }
}

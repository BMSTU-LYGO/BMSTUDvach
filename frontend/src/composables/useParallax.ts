import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { prefersReducedMotion } from './useGsap'

interface ParallaxReturn {
  mouseX: Ref<number>
  mouseY: Ref<number>
  mousePercentX: Ref<number>
  mousePercentY: Ref<number>
}

export function useParallax(): ParallaxReturn {
  const mouseX = ref(0)
  const mouseY = ref(0)
  const mousePercentX = ref(0.5)
  const mousePercentY = ref(0.5)

  function handleMouseMove(event: MouseEvent) {
    if (prefersReducedMotion()) return
    mouseX.value = event.clientX
    mouseY.value = event.clientY
    mousePercentX.value = event.clientX / window.innerWidth
    mousePercentY.value = event.clientY / window.innerHeight
  }

  onMounted(() => {
    if (!prefersReducedMotion()) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true })
    }
  })

  onUnmounted(() => {
    window.removeEventListener('mousemove', handleMouseMove)
  })

  return { mouseX, mouseY, mousePercentX, mousePercentY }
}

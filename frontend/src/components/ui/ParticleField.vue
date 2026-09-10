<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { prefersReducedMotion } from '@/composables/useGsap'

interface Particle {
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  opacity: number
  hue: number
}

const props = withDefaults(
  defineProps<{ count?: number; connectDistance?: number }>(),
  { count: 60, connectDistance: 120 },
)

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animationId: number | null = null
let particles: Particle[] = []
let mouseX = -1000
let mouseY = -1000
let canvasW = 0
let canvasH = 0

function createParticle(w: number, h: number): Particle {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    size: Math.random() * 2 + 0.5,
    speedX: (Math.random() - 0.5) * 0.4,
    speedY: (Math.random() - 0.5) * 0.4,
    opacity: Math.random() * 0.4 + 0.1,
    hue: 30 + Math.random() * 30,
  }
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas || prefersReducedMotion()) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  function resize() {
    canvasW = canvas!.offsetWidth
    canvasH = canvas!.offsetHeight
    canvas!.width = canvasW * devicePixelRatio
    canvas!.height = canvasH * devicePixelRatio
    ctx!.scale(devicePixelRatio, devicePixelRatio)
  }
  resize()
  window.addEventListener('resize', resize)

  function handleMouseMove(e: MouseEvent) {
    const rect = canvas!.getBoundingClientRect()
    mouseX = e.clientX - rect.left
    mouseY = e.clientY - rect.top
  }
  canvas.addEventListener('mousemove', handleMouseMove, { passive: true })

  function handleMouseLeave() {
    mouseX = -1000
    mouseY = -1000
  }
  canvas.addEventListener('mouseleave', handleMouseLeave)

  const effectiveCount = window.innerWidth < 768 ? Math.floor(props.count * 0.5) : props.count
  particles = Array.from({ length: effectiveCount }, () =>
    createParticle(canvasW, canvasH),
  )

  function animate() {
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvasW, canvasH)

    // Mouse influence radius
    const mouseRadius = 150

    for (const p of particles) {
      // Mouse interaction
      const dx = mouseX - p.x
      const dy = mouseY - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < mouseRadius && dist > 0) {
        const force = (1 - dist / mouseRadius) * 0.02
        p.speedX += dx * force
        p.speedY += dy * force
        // Hue shift near cursor
        p.hue = 30 + (dx / mouseRadius) * 30
      }

      // Damping
      p.speedX *= 0.99
      p.speedY *= 0.99

      p.x += p.speedX
      p.y += p.speedY

      // Wrap around
      if (p.x < -10) p.x = canvasW + 10
      if (p.x > canvasW + 10) p.x = -10
      if (p.y < -10) p.y = canvasH + 10
      if (p.y > canvasH + 10) p.y = -10

      // Draw particle
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${p.hue}, 60%, 55%, ${p.opacity})`
      ctx.fill()
    }

    // Draw connections
    const maxDist = props.connectDistance
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i]
        const b = particles[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < maxDist) {
          const alpha = (1 - dist / maxDist) * 0.15
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = `hsla(35, 70%, 50%, ${alpha})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      }
    }

    animationId = requestAnimationFrame(animate)
  }

  animate()

  onUnmounted(() => {
    if (animationId) cancelAnimationFrame(animationId)
    window.removeEventListener('resize', resize)
    canvas!.removeEventListener('mousemove', handleMouseMove)
    canvas!.removeEventListener('mouseleave', handleMouseLeave)
  })
})
</script>

<template>
  <canvas ref="canvasRef" class="particle-field" aria-hidden="true"></canvas>
</template>

<style scoped>
.particle-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  z-index: 0;
  cursor: crosshair;
}

@media (prefers-reduced-motion: reduce) {
  .particle-field {
    display: none;
  }
}
</style>

<script setup lang="ts">
import { ref } from 'vue'
import { useThreeScene, type ThreeBuildResult, type ThreeContext } from '@/composables/useThreeScene'
import { useQuality3D } from '@/composables/useQuality3D'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const { resolved } = useQuality3D()
const { active } = useThreeScene(canvasRef, build)

function makeSpriteTexture(ctx: ThreeContext) {
  const { three } = ctx
  const size = 64
  const el = document.createElement('canvas')
  el.width = size
  el.height = size
  const c = el.getContext('2d')!
  const grad = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255, 220, 170, 1)')
  grad.addColorStop(0.4, 'rgba(212, 136, 42, 0.6)')
  grad.addColorStop(1, 'rgba(212, 136, 42, 0)')
  c.fillStyle = grad
  c.fillRect(0, 0, size, size)
  return new three.CanvasTexture(el)
}

function build(ctx: ThreeContext): ThreeBuildResult {
  const { three, scene, camera, quality } = ctx

  const count = quality === 'high' ? 160 : 70
  let w = 1
  let h = 1

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 2)
  const color = new three.Color()

  const spawn = (i: number) => {
    positions[i * 3] = (Math.random() - 0.5) * w
    positions[i * 3 + 1] = (Math.random() - 0.5) * h
    positions[i * 3 + 2] = 0
    velocities[i * 2] = (Math.random() - 0.5) * 40
    velocities[i * 2 + 1] = (Math.random() - 0.5) * 40
    color.setHSL(0.08 + Math.random() * 0.07, 0.6, 0.45 + Math.random() * 0.2)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  for (let i = 0; i < count; i++) spawn(i)

  const geometry = new three.BufferGeometry()
  geometry.setAttribute('position', new three.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new three.BufferAttribute(colors, 3))

  const sprite = makeSpriteTexture(ctx)
  const material = new three.PointsMaterial({
    size: quality === 'high' ? 5 : 4,
    sizeAttenuation: false,
    map: sprite,
    transparent: true,
    depthWrite: false,
    blending: three.AdditiveBlending,
    vertexColors: true,
    opacity: 0.7,
  })

  const points = new three.Points(geometry, material)
  scene.add(points)

  camera.position.set(0, 0, 10)

  // Mouse in world px units (center-based, y up).
  let mx = -10000
  let my = -10000
  const onPointerMove = (e: PointerEvent) => {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return
    mx = e.clientX - rect.left - rect.width / 2
    my = -(e.clientY - rect.top - rect.height / 2)
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true })

  function fitCamera() {
    const canvas = canvasRef.value
    if (!canvas) return
    w = canvas.offsetWidth
    h = canvas.offsetHeight
    // Make 1 world unit == 1 css px on the z=0 plane.
    const fovRad = (camera.fov * Math.PI) / 180
    camera.position.z = h / 2 / Math.tan(fovRad / 2)
    camera.updateProjectionMatrix()
  }
  fitCamera()
  // Re-fit on renderer resizes (useThreeScene resizes before frame loop starts).
  let lastW = w
  let lastH = h

  return {
    frame: (dt) => {
      const curW = canvasRef.value?.offsetWidth ?? lastW
      const curH = canvasRef.value?.offsetHeight ?? lastH
      if (curW !== lastW || curH !== lastH) {
        lastW = curW
        lastH = curH
        fitCamera()
      }

      const halfW = w / 2
      const halfH = h / 2
      const mouseRadius = 150

      for (let i = 0; i < count; i++) {
        const px = positions[i * 3]
        const py = positions[i * 3 + 1]
        const dx = mx - px
        const dy = my - py
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < mouseRadius && dist > 0.001) {
          const force = (1 - dist / mouseRadius) * 60
          velocities[i * 2] += (dx / dist) * force * dt
          velocities[i * 2 + 1] += (dy / dist) * force * dt
        }

        velocities[i * 2] *= 0.995
        velocities[i * 2 + 1] *= 0.995

        positions[i * 3] += velocities[i * 2] * dt
        positions[i * 3 + 1] += velocities[i * 2 + 1] * dt

        if (positions[i * 3] < -halfW - 10) positions[i * 3] = halfW + 10
        if (positions[i * 3] > halfW + 10) positions[i * 3] = -halfW - 10
        if (positions[i * 3 + 1] < -halfH - 10) positions[i * 3 + 1] = halfH + 10
        if (positions[i * 3 + 1] > halfH + 10) positions[i * 3 + 1] = -halfH - 10
      }
      geometry.attributes.position.needsUpdate = true
    },
    dispose: () => {
      window.removeEventListener('pointermove', onPointerMove)
      sprite.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}
</script>

<template>
  <canvas
    :key="resolved"
    ref="canvasRef"
    class="particle-3d"
    :class="{ hidden: !active }"
    aria-hidden="true"
  ></canvas>
</template>

<style scoped>
.particle-3d {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.particle-3d.hidden {
  visibility: hidden;
}
</style>

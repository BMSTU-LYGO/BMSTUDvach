<script setup lang="ts">
import { ref } from 'vue'
import type { LineSegments } from 'three'
import { useThreeScene, type ThreeBuildResult, type ThreeContext } from '@/composables/useThreeScene'
import { useQuality3D } from '@/composables/useQuality3D'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const { resolved } = useQuality3D()
const { active } = useThreeScene(canvasRef, build)

function makeGeometry(ctx: ThreeContext, kind: number, quality: string) {
  const { three } = ctx
  const detail = quality === 'high' ? 1 : 0
  switch (kind % 3) {
    case 0:
      return new three.IcosahedronGeometry(1, detail)
    case 1:
      return new three.OctahedronGeometry(1, detail)
    default:
      return new three.TorusGeometry(0.8, 0.3, 6, quality === 'high' ? 14 : 8)
  }
}

function build(ctx: ThreeContext): ThreeBuildResult {
  const { three, scene, camera, quality } = ctx
  const count = quality === 'high' ? 9 : 5
  const shapes: {
    obj: LineSegments
    spinX: number
    spinY: number
    baseY: number
    drift: number
    phase: number
  }[] = []

  for (let i = 0; i < count; i++) {
    const geo = makeGeometry(ctx, i, quality)
    const edges = new three.EdgesGeometry(geo)
    geo.dispose()
    const mat = new three.LineBasicMaterial({
      color: i % 4 === 0 ? 0xd4882a : 0x3a4360,
      transparent: true,
      opacity: i % 4 === 0 ? 0.3 : 0.22,
    })
    const lines = new three.LineSegments(edges, mat)
    const scale = 0.6 + Math.random() * 1.3
    lines.scale.setScalar(scale)
    lines.position.set(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 8,
      -3 - Math.random() * 9,
    )
    scene.add(lines)
    shapes.push({
      obj: lines,
      spinX: (Math.random() - 0.5) * 0.5,
      spinY: (Math.random() - 0.5) * 0.5,
      baseY: lines.position.y,
      drift: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    })
  }

  camera.position.set(0, 0, 7)

  let targetX = 0
  let targetY = 0
  const onPointerMove = (e: PointerEvent) => {
    targetX = (e.clientX / window.innerWidth) * 2 - 1
    targetY = (e.clientY / window.innerHeight) * 2 - 1
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true })

  let elapsed = 0

  return {
    frame: (dt) => {
      elapsed += dt
      for (const s of shapes) {
        s.obj.rotation.x += s.spinX * dt
        s.obj.rotation.y += s.spinY * dt
        s.obj.position.y = s.baseY + Math.sin(elapsed * s.drift + s.phase) * 0.5
      }
      const lerp = Math.min(1, dt * 1.8)
      camera.position.x += (targetX * 0.9 - camera.position.x) * lerp
      camera.position.y += (-targetY * 0.6 - camera.position.y) * lerp
    },
    dispose: () => {
      window.removeEventListener('pointermove', onPointerMove)
    },
  }
}
</script>

<template>
  <canvas
    :key="resolved"
    ref="canvasRef"
    class="floating-shapes"
    :class="{ hidden: !active }"
    aria-hidden="true"
  ></canvas>
</template>

<style scoped>
.floating-shapes {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.floating-shapes.hidden {
  visibility: hidden;
}
</style>

<script setup lang="ts">
import { ref } from 'vue'
import type { Object3D } from 'three'

import { useThreeScene, type ThreeBuildResult, type ThreeContext } from '@/composables/useThreeScene'
import { useQuality3D } from '@/composables/useQuality3D'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const { resolved } = useQuality3D()
const { active } = useThreeScene(canvasRef, build)

function makeGearGeometry(
  ctx: ThreeContext,
  teeth: number,
  outerR: number,
  toothDepth: number,
  holeR: number,
) {
  const { three } = ctx
  const shape = new three.Shape()
  const steps = teeth * 4
  for (let k = 0; k < steps; k++) {
    const r = k % 4 < 2 ? outerR : outerR - toothDepth
    const ang = (k / steps) * Math.PI * 2
    const x = Math.cos(ang) * r
    const y = Math.sin(ang) * r
    if (k === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()

  const hole = new three.Path()
  hole.absarc(0, 0, holeR, 0, Math.PI * 2, true)
  shape.holes.push(hole)

  const geo = new three.ExtrudeGeometry(shape, {
    depth: 0.32,
    bevelEnabled: false,
  })
  geo.translate(0, 0, -0.16)
  return geo
}

function addGear(ctx: ThreeContext, parent: Object3D, teeth: number, outerR: number, toothDepth: number, holeR: number, opacity: number) {
  const { three } = ctx
  const geo = new three.EdgesGeometry(makeGearGeometry(ctx, teeth, outerR, toothDepth, holeR))
  const mat = new three.LineBasicMaterial({
    color: 0xd4882a,
    transparent: true,
    opacity,
  })
  const lines = new three.LineSegments(geo, mat)
  parent.add(lines)
  return lines
}

function build(ctx: ThreeContext): ThreeBuildResult {
  const { three, scene, camera, quality } = ctx
  const opacity = quality === 'high' ? 0.55 : 0.4

  const world = new three.Group()
  world.rotation.x = -0.45
  scene.add(world)

  // Two meshing gears, counter-rotated by tooth ratio.
  const bigTeeth = 16
  const smallTeeth = 10
  const big = addGear(ctx, world, bigTeeth, 2.4, 0.5, 0.85, opacity)
  big.position.set(-2.4, 0.4, 0)
  const small = addGear(ctx, world, smallTeeth, 1.5, 0.42, 0.55, opacity * 0.85)
  small.position.set(2.7, -0.9, -1.4)

  // "Blueprint" floor grid.
  const grid = new three.GridHelper(
    46,
    quality === 'high' ? 46 : 18,
    0x2d3348,
    0x1a1e2a,
  )
  grid.position.y = -3.2
  const gridMat = grid.material as { transparent: boolean; opacity: number }
  gridMat.transparent = true
  gridMat.opacity = 0.45
  scene.add(grid)

  camera.position.set(0, 1.4, 8.5)
  camera.lookAt(0, 0, 0)

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
      const bigSpeed = 0.14
      big.rotation.z += dt * bigSpeed
      small.rotation.z -= dt * bigSpeed * (bigTeeth / smallTeeth)

      const lerp = Math.min(1, dt * 2.5)
      camera.position.x += (targetX * 1.3 - camera.position.x) * lerp
      camera.position.y += (1.4 - targetY * 0.7 - camera.position.y) * lerp
      camera.lookAt(0, 0, 0)

      world.position.y = Math.sin(elapsed * 0.5) * 0.12
    },
    dispose: () => {
      window.removeEventListener('pointermove', onPointerMove)
    },
  }
}
</script>

<template>
  <div class="gear-hero">
    <canvas
      :key="resolved"
      ref="canvasRef"
      class="gear-canvas"
      :class="{ hidden: !active }"
      aria-hidden="true"
    ></canvas>
    <div v-if="!active" class="gear-fallback" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.gear-hero {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.gear-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.gear-canvas.hidden {
  visibility: hidden;
}

.gear-fallback {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 50% 60% at 30% 40%, var(--accent-glow), transparent 70%),
    radial-gradient(ellipse 40% 50% at 75% 60%, oklch(0.55 0.12 65 / 0.12), transparent 70%);
}
</style>

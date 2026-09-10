<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ seed: number; size?: number; isOp?: boolean }>()

const avatar = computed(() => {
  const s = props.seed
  const size = props.size ?? 40
  const hue = (s * 137.508) % 360
  const hue2 = (hue + 60) % 360

  // Generate deterministic shapes
  const shapes: string[] = []
  const rng = (n: number) => ((s * 9301 + 49297 + n * 233) % 233280) / 233280

  // Background circles
  for (let i = 0; i < 3; i++) {
    const cx = rng(i * 10) * size
    const cy = rng(i * 10 + 1) * size
    const r = rng(i * 10 + 2) * size * 0.4 + 4
    shapes.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsla(${hue + i * 20}, 50%, 40%, 0.4)"/>`,
    )
  }

  // Center pattern
  if (s % 3 === 0) {
    // Diamond
    const half = size * 0.3
    const cx = size / 2
    const cy = size / 2
    shapes.push(
      `<polygon points="${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}" fill="hsla(${hue2}, 60%, 55%, 0.8)"/>`,
    )
  } else if (s % 3 === 1) {
    // Cross
    const w = size * 0.15
    const h = size * 0.35
    const cx = size / 2
    const cy = size / 2
    shapes.push(
      `<rect x="${cx - w}" y="${cy - h}" width="${w * 2}" height="${h * 2}" rx="2" fill="hsla(${hue2}, 60%, 55%, 0.8)"/>`,
      `<rect x="${cx - h}" y="${cy - w}" width="${h * 2}" height="${w * 2}" rx="2" fill="hsla(${hue2}, 60%, 55%, 0.8)"/>`,
    )
  } else {
    // Triangle
    const r = size * 0.28
    const cx = size / 2
    const cy = size / 2
    const points = [0, 1, 2]
      .map((i) => {
        const angle = (i * 120 - 90) * (Math.PI / 180)
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
      })
      .join(' ')
    shapes.push(
      `<polygon points="${points}" fill="hsla(${hue2}, 60%, 55%, 0.8)"/>`,
    )
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="hsl(${hue}, 35%, 20%)" rx="4"/>
    ${shapes.join('\n    ')}
  </svg>`

  return {
    background: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
  }
})
</script>

<template>
  <div
    class="generative-avatar"
    :class="{ op: isOp }"
    :style="{ width: (size ?? 40) + 'px', height: (size ?? 40) + 'px', ...avatar }"
    aria-hidden="true"
  ></div>
</template>

<style scoped>
.generative-avatar {
  border-radius: var(--radius-md);
  background-size: cover;
  flex-shrink: 0;
  opacity: 0.9;
}

.generative-avatar.op {
  border: 2px solid var(--accent-dim);
  opacity: 1;
}
</style>

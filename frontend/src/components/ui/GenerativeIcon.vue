<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ seed: string; size?: number }>(),
  { size: 48 },
)

const icon = computed(() => {
  const hash = hashString(props.seed)
  const size = props.size
  const hue = (hash * 137.508) % 360
  const hue2 = (hue + 45) % 360
  const rng = (n: number) => ((hash * 9301 + 49297 + n * 233) % 233280) / 233280

  const shapes: string[] = []

  // Grid of small dots
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (rng(i * 4 + j) > 0.5) {
        const x = 8 + i * 10
        const y = 8 + j * 10
        shapes.push(
          `<circle cx="${x}" cy="${y}" r="2" fill="hsla(${hue}, 50%, 60%, 0.6)"/>`,
        )
      }
    }
  }

  // Connecting lines
  const lineCount = Math.floor(rng(100) * 3) + 1
  for (let i = 0; i < lineCount; i++) {
    const x1 = 8 + Math.floor(rng(200 + i * 2) * 4) * 10
    const y1 = 8 + Math.floor(rng(201 + i * 2) * 4) * 10
    const x2 = 8 + Math.floor(rng(202 + i * 2) * 4) * 10
    const y2 = 8 + Math.floor(rng(203 + i * 2) * 4) * 10
    shapes.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="hsla(${hue2}, 60%, 55%, 0.4)" stroke-width="1.5"/>`,
    )
  }

  // Accent shape
  if (hash % 2 === 0) {
    const cx = size / 2
    const cy = size / 2
    const r = size * 0.2
    shapes.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="hsla(${hue}, 70%, 55%, 0.7)" stroke-width="1.5"/>`,
    )
  } else {
    const half = size * 0.18
    const cx = size / 2
    const cy = size / 2
    shapes.push(
      `<rect x="${cx - half}" y="${cy - half}" width="${half * 2}" height="${half * 2}" fill="none" stroke="hsla(${hue}, 70%, 55%, 0.7)" stroke-width="1.5" transform="rotate(45 ${cx} ${cy})"/>`,
    )
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${shapes.join('')}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
})

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return Math.abs(hash)
}
</script>

<template>
  <div
    class="generative-icon"
    :style="{
      width: size + 'px',
      height: size + 'px',
      backgroundImage: icon,
    }"
    aria-hidden="true"
  ></div>
</template>

<style scoped>
.generative-icon {
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0;
}
</style>

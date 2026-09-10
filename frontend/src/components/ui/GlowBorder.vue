<script setup lang="ts">
import { ref } from 'vue'
import { prefersReducedMotion } from '@/composables/useGsap'

defineProps<{ color?: 'accent' | 'danger' | 'success' }>()

const cardRef = ref<HTMLElement | null>(null)
const glowX = ref(50)
const glowY = ref(50)

function handleMouseMove(event: MouseEvent) {
  if (!cardRef.value || prefersReducedMotion()) return
  const rect = cardRef.value.getBoundingClientRect()
  glowX.value = ((event.clientX - rect.left) / rect.width) * 100
  glowY.value = ((event.clientY - rect.top) / rect.height) * 100
}
</script>

<template>
  <div
    ref="cardRef"
    class="glow-border"
    :class="[`glow-${color ?? 'accent'}`]"
    :style="{
      '--glow-x': glowX + '%',
      '--glow-y': glowY + '%',
    }"
    @mousemove="handleMouseMove"
  >
    <slot />
  </div>
</template>

<style scoped>
.glow-border {
  position: relative;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color var(--duration-normal) var(--ease-out-quart);
}

.glow-border::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  background: radial-gradient(
    200px circle at var(--glow-x) var(--glow-y),
    var(--glow-color, var(--accent-glow)),
    transparent 70%
  );
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-out-quart);
  pointer-events: none;
  z-index: -1;
}

.glow-border:hover {
  border-color: var(--glow-border-color, var(--border-accent));
}

.glow-border:hover::before {
  opacity: 1;
}

.glow-accent {
  --glow-color: var(--accent-glow);
  --glow-border-color: var(--border-accent);
}

.glow-danger {
  --glow-color: oklch(0.55 0.20 25 / 0.25);
  --glow-border-color: oklch(0.55 0.20 25 / 0.4);
}

.glow-success {
  --glow-color: oklch(0.65 0.18 155 / 0.25);
  --glow-border-color: oklch(0.65 0.18 155 / 0.4);
}

@media (prefers-reduced-motion: reduce) {
  .glow-border::before {
    display: none;
  }
}
</style>

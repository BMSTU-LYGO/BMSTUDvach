<script setup lang="ts">
import { ref } from 'vue'
import { prefersReducedMotion, isTouchDevice } from '@/composables/useGsap'

withDefaults(
  defineProps<{ strength?: number; variant?: 'primary' | 'ghost' | 'danger' }>(),
  { strength: 0.3, variant: 'primary' },
)

const btnRef = ref<HTMLElement | null>(null)
const offsetX = ref(0)
const offsetY = ref(0)
const isHovered = ref(false)

function handleMouseMove(e: MouseEvent) {
  if (!btnRef.value || prefersReducedMotion() || isTouchDevice()) return
  const rect = btnRef.value.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  offsetX.value = (e.clientX - centerX) * 0.3
  offsetY.value = (e.clientY - centerY) * 0.3
}

function handleMouseEnter() {
  isHovered.value = true
}

function handleMouseLeave() {
  isHovered.value = false
  offsetX.value = 0
  offsetY.value = 0
}
</script>

<template>
  <button
    ref="btnRef"
    class="magnetic-btn"
    :class="[`variant-${variant}`, { hovered: isHovered }]"
    :style="{
      transform: `translate(${offsetX}px, ${offsetY}px)`,
    }"
    @mousemove="handleMouseMove"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <span class="btn-content">
      <slot />
    </span>
    <span v-if="isHovered" class="btn-ripple" aria-hidden="true"></span>
  </button>
</template>

<style scoped>
.magnetic-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.4;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  background: var(--bg-raised);
  color: var(--text-primary);
  cursor: pointer;
  overflow: hidden;
  transition:
    transform 0.3s var(--ease-out-expo),
    background 0.2s,
    border-color 0.2s,
    box-shadow 0.3s;
}

.variant-primary {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: oklch(0.10 0.01 260);
}

.variant-primary:hover {
  background: var(--accent);
  box-shadow: var(--shadow-glow);
}

.variant-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-secondary);
}

.variant-ghost:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
}

.variant-danger {
  border-color: var(--danger-dim);
  color: var(--danger);
}

.variant-danger:hover {
  background: oklch(0.55 0.20 25 / 0.15);
  border-color: var(--danger);
}

.btn-content {
  position: relative;
  z-index: 1;
}

.btn-ripple {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at center,
    oklch(1 0 0 / 0.1) 0%,
    transparent 70%
  );
  animation: ripple-expand 0.6s var(--ease-out-expo) forwards;
  pointer-events: none;
}

@keyframes ripple-expand {
  from {
    transform: scale(0);
    opacity: 1;
  }
  to {
    transform: scale(2.5);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .magnetic-btn {
    transform: none !important;
  }

  .btn-ripple {
    display: none;
  }
}
</style>

<script setup lang="ts">
withDefaults(
  defineProps<{ cellSize?: number; opacity?: number }>(),
  { cellSize: 40, opacity: 0.06 },
)
</script>

<template>
  <div
    class="grid-pattern"
    :style="{
      '--grid-size': cellSize + 'px',
      '--grid-opacity': opacity,
    }"
    aria-hidden="true"
  ></div>
</template>

<style scoped>
.grid-pattern {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image:
    linear-gradient(var(--border-subtle) 1px, transparent 1px),
    linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px);
  background-size: var(--grid-size) var(--grid-size);
  opacity: var(--grid-opacity);
  mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 20%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 20%, transparent 70%);
}
</style>

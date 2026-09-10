<script setup lang="ts">
withDefaults(defineProps<{ intensity?: number }>(), { intensity: 0.04 })
</script>

<template>
  <div
    class="scanline-overlay"
    :style="{ '--scanline-opacity': intensity }"
    aria-hidden="true"
  ></div>
</template>

<style scoped>
.scanline-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, var(--scanline-opacity)) 2px,
    rgba(0, 0, 0, var(--scanline-opacity)) 4px
  );
  animation: scanline-scroll 8s linear infinite;
}

@keyframes scanline-scroll {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 0 100px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scanline-overlay {
    animation: none;
  }
}
</style>

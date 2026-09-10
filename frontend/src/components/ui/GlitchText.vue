<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gsap, prefersReducedMotion } from '@/composables/useGsap'

withDefaults(
  defineProps<{ text: string; tag?: string; glitchDuration?: number }>(),
  { tag: 'span', glitchDuration: 2 },
)

const textRef = ref<HTMLElement | null>(null)
const isGlitching = ref(false)

onMounted(() => {
  if (!textRef.value || prefersReducedMotion()) return

  const el = textRef.value

  // Initial entrance animation
  gsap.from(el, {
    opacity: 0,
    y: 20,
    duration: 0.8,
    ease: 'expo.out',
    delay: 0.3,
  })

  // Periodic glitch bursts
  function triggerGlitch() {
    if (prefersReducedMotion()) return
    isGlitching.value = true
    setTimeout(() => {
      isGlitching.value = false
    }, 200 + Math.random() * 300)
  }

  // Random glitch every 3-8 seconds
  function scheduleGlitch() {
    const delay = 3000 + Math.random() * 5000
    setTimeout(() => {
      triggerGlitch()
      scheduleGlitch()
    }, delay)
  }

  scheduleGlitch()
})
</script>

<template>
  <component
    :is="tag"
    ref="textRef"
    class="glitch-text"
    :class="{ glitching: isGlitching }"
    :data-text="text"
    aria-label="text"
  >
    {{ text }}
  </component>
</template>

<style scoped>
.glitch-text {
  position: relative;
  display: inline-block;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--text-primary);
}

.glitch-text::before,
.glitch-text::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
}

.glitch-text::before {
  color: oklch(0.65 0.25 30);
  z-index: -1;
}

.glitch-text::after {
  color: oklch(0.65 0.25 200);
  z-index: -1;
}

/* Glitch animation */
.glitch-text.glitching::before {
  animation: glitch-before 0.3s linear;
  opacity: 0.8;
}

.glitch-text.glitching::after {
  animation: glitch-after 0.3s linear;
  opacity: 0.8;
}

.glitch-text.glitching {
  animation: glitch-main 0.3s linear;
}

@keyframes glitch-main {
  0% { transform: translate(0); }
  20% { transform: translate(-2px, 1px); }
  40% { transform: translate(2px, -1px); }
  60% { transform: translate(-1px, 2px); }
  80% { transform: translate(1px, -2px); }
  100% { transform: translate(0); }
}

@keyframes glitch-before {
  0% { clip-path: inset(0 0 85% 0); transform: translate(0); }
  20% { clip-path: inset(15% 0 60% 0); transform: translate(-3px, 1px); }
  40% { clip-path: inset(40% 0 30% 0); transform: translate(3px, -1px); }
  60% { clip-path: inset(60% 0 10% 0); transform: translate(-2px, 2px); }
  80% { clip-path: inset(80% 0 0% 0); transform: translate(2px, -2px); }
  100% { clip-path: inset(0 0 85% 0); transform: translate(0); }
}

@keyframes glitch-after {
  0% { clip-path: inset(85% 0 0 0); transform: translate(0); }
  20% { clip-path: inset(60% 0 15% 0); transform: translate(3px, -1px); }
  40% { clip-path: inset(30% 0 40% 0); transform: translate(-3px, 1px); }
  60% { clip-path: inset(10% 0 60% 0); transform: translate(2px, -2px); }
  80% { clip-path: inset(0% 0 80% 0); transform: translate(-2px, 2px); }
  100% { clip-path: inset(85% 0 0 0); transform: translate(0); }
}

@media (prefers-reduced-motion: reduce) {
  .glitch-text::before,
  .glitch-text::after {
    display: none;
  }
  .glitch-text.glitching {
    animation: none;
  }
}
</style>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { gsap, prefersReducedMotion } from '@/composables/useGsap'

const props = withDefaults(
  defineProps<{ text: string; speed?: number; startDelay?: number }>(),
  { speed: 60, startDelay: 300 },
)

const displayText = ref('')
const showCursor = ref(true)
const isDone = ref(false)

function animateTypewriter() {
  if (prefersReducedMotion()) {
    displayText.value = props.text
    isDone.value = true
    showCursor.value = false
    return
  }

  displayText.value = ''
  isDone.value = false
  showCursor.value = true

  const tl = gsap.timeline({
    delay: props.startDelay / 1000,
    onComplete: () => {
      isDone.value = true
      gsap.delayedCall(1.5, () => {
        showCursor.value = false
      })
    },
  })

  for (let i = 0; i <= props.text.length; i++) {
    tl.call(
      () => {
        displayText.value = props.text.slice(0, i)
      },
      undefined,
      (i * props.speed) / 1000,
    )
  }
}

onMounted(animateTypewriter)
watch(() => props.text, animateTypewriter)
</script>

<template>
  <span class="typewriter" aria-label="props.text">
    <span class="typewriter-text">{{ displayText }}</span>
    <span v-if="showCursor" class="typewriter-cursor" aria-hidden="true">▌</span>
  </span>
</template>

<style scoped>
.typewriter {
  display: inline;
}

.typewriter-text {
  font-family: var(--font-display);
}

.typewriter-cursor {
  display: inline-block;
  color: var(--accent);
  animation: cursorBlink 0.8s step-end infinite;
  margin-left: 1px;
  font-weight: 400;
}

@media (prefers-reduced-motion: reduce) {
  .typewriter-cursor {
    display: none;
  }
}
</style>

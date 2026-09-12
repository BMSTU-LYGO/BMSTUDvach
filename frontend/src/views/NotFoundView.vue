<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { emitSceneEvent } from '@/three/sceneState'
import { useSound } from '@/composables/useSound'

/**
 * 404 — an interactive WebGL 'LOST NODE'. The route meta switches the
 * persistent network scene into 'error' mode: the node tumbles, chases the
 * pointer, and the "return" action fires a rescue ping through the graph.
 */

const router = useRouter()
const { sounds } = useSound()
const searching = ref(false)

function returnHome() {
  if (searching.value) return
  searching.value = true
  emitSceneEvent({ type: 'rescue' })
  sounds.submit()
  // let the ping read for a beat before the warp covers the route change
  window.setTimeout(() => {
    void router.push('/')
    searching.value = false
  }, 320)
}
</script>

<template>
  <section class="lost-node" data-testid="not-found">
    <p class="lost-kicker">// signal lost</p>
    <h1 class="lost-title">LOST NODE</h1>
    <p class="lost-text">
      Этот узел отключён от графа. Он крутится в пустоте и тянется к
      курсору — но маршрута сюда не существует.
    </p>
    <button
      class="btn btn-primary lost-btn"
      :disabled="searching"
      @click="returnHome"
    >
      {{ searching ? 'поиск маршрута…' : 'вернуться в сеть' }}
    </button>
  </section>
</template>

<style scoped>
.lost-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-5);
  min-height: 55vh;
  text-align: center;
}

.lost-kicker {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.lost-title {
  margin: 0;
  font-size: clamp(3rem, 10vw, 6.5rem);
  letter-spacing: 0.06em;
  color: var(--text-primary);
  text-shadow: 0 0 40px var(--accent-glow);
  animation: nodeDrift 6s ease-in-out infinite;
}

@keyframes nodeDrift {
  0%,
  100% {
    transform: translateY(0) rotate(0.001deg);
  }
  50% {
    transform: translateY(-8px) rotate(-0.4deg);
  }
}

.lost-text {
  max-width: 44ch;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

.lost-btn {
  margin-top: var(--space-2);
}

.lost-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}

@media (prefers-reduced-motion: reduce) {
  .lost-title {
    animation: none;
  }
}
</style>

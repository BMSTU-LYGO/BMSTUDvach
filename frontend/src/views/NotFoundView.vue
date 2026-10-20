<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import NotFoundState from '@/components/NotFoundState.vue'
import { emitSceneEvent } from '@/three/sceneState'
import { useSound } from '@/composables/useSound'

/**
 * 404 — «СИГНАЛ ПОТЕРЯН». The route meta switches the persistent network
 * scene into 'error' mode: the node tumbles, chases the pointer, and the
 * "return" action fires a rescue ping through the graph.
 *
 * The page speaks the same language as every other state of the product:
 * one instrument frame with its own graphic (the trace of a cut-out
 * fragment), a mono caption and one calm line of body copy. No glow, no
 * drifting headline — the lost node is already on the screen behind.
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
  <section class="lost-node" data-testid="not-found-view">
    <header class="lost-node__head">
      <span class="lost-node__kicker">// 404</span>
      <h1 class="lost-node__title">СИГНАЛ ПОТЕРЯН</h1>
    </header>

    <NotFoundState
      variant="lost"
      title="FRAGMENT LOST"
      message="Фрагмента по этому адресу нет: страница вырезана из сети, но след остался в бумаге."
      :action-label="searching ? 'поиск маршрута…' : 'вернуться в сеть'"
      :action-disabled="searching"
      :on-action="returnHome"
    />

    <p class="lost-node__alt">
      <RouterLink class="lost-node__link" to="/stats">
        открыть статистику сети
      </RouterLink>
    </p>
  </section>
</template>

<style scoped>
.lost-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
  min-height: 55vh;
  padding: var(--space-6) 0;
  text-align: center;
}

/* === Заголовок: редакционный, без неона и без дрейфа === */
.lost-node__head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.lost-node__kicker {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
}

.lost-node__title {
  margin: 0;
  font-size: clamp(1.6rem, 4vw, 2.6rem);
  letter-spacing: 0.04em;
  color: var(--ink);
}

/* === Запасной выход: тихая ссылка, не второй прибор === */
.lost-node__alt {
  margin: 0;
}

.lost-node__link {
  font-family: var(--font-body);
  font-size: 0.86rem;
  color: var(--ink-secondary);
  border-bottom: 1px solid var(--rule);
  padding-bottom: 2px;
  transition:
    color var(--motion-hover),
    border-color var(--motion-hover);
}

.lost-node__link:hover {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.lost-node__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .lost-node__link {
    transition: none;
  }
}
</style>

<script setup lang="ts">
/**
 * «ОБРЫВ СВЯЗИ» — потерянный узел: микро-подпись кода ERROR, человекочитаемый
 * текст и кнопка ретрая (наложение нового пинга на шину).
 */
defineProps<{ message?: string; onRetry?: () => void }>()
</script>

<template>
  <div class="state-error" role="alert" data-testid="error">
    <div class="drop" data-testid="state-error">
      <span class="drop__node drop__node--live" aria-hidden="true"></span>
      <span class="drop__wire" aria-hidden="true"></span>
      <span class="drop__cut" aria-hidden="true"></span>
      <span class="drop__wire" aria-hidden="true"></span>
      <span class="drop__node drop__node--lost" aria-hidden="true"></span>
    </div>

    <p class="state-error__caption">ERROR · ОБРЫВ СВЯЗИ</p>
    <p class="state-error__title">Ошибка связи</p>
    <p class="state-error__message">{{ message ?? 'Сигнал не дошёл до узла.' }}</p>

    <button v-if="onRetry" type="button" class="retry" @click="onRetry">
      <span class="retry__ping" aria-hidden="true"></span>
      ПОВТОРИТЬ
    </button>
  </div>
</template>

<style scoped>
.state-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8);
  text-align: center;
}

/* === Lost node: broken wire between two nodes === */
.drop {
  display: flex;
  align-items: center;
  gap: 0;
  height: 16px;
  margin-bottom: var(--space-1);
}

.drop__node {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
}

.drop__node--live {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow-strong);
}

.drop__node--lost {
  border: 1px dashed var(--danger-dim);
  background: transparent;
  animation: drop-lost 1.6s var(--ease-out-quart) infinite;
}

.drop__wire {
  width: 32px;
  height: 1px;
  background: var(--border-medium);
}

.drop__cut {
  width: 12px;
  height: 1px;
  background: var(--danger);
  transform: rotate(-24deg);
  transform-origin: center;
  animation: drop-cut 1.6s var(--ease-out-quart) infinite;
}

@keyframes drop-lost {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}

@keyframes drop-cut {
  0%,
  100% {
    transform: rotate(-24deg) translateX(0);
    opacity: 0.5;
  }
  50% {
    transform: rotate(-24deg) translateX(1px);
    opacity: 1;
  }
}

/* === Hierarchy: code → human → action === */
.state-error__caption {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--danger-dim);
}

.state-error__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-primary);
}

.state-error__message {
  margin: 0;
  max-width: 42ch;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

/* === Retry: signal re-ping === */
.retry {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-5);
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--danger);
  background: color-mix(in oklab, var(--danger) 8%, transparent);
  border: 1px solid var(--danger-dim);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) var(--ease-out-quart);
}

.retry:hover {
  color: var(--text-primary);
  background: color-mix(in oklab, var(--danger) 18%, transparent);
  border-color: var(--danger);
}

.retry:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.retry:active {
  transform: translateY(1px);
}

.retry__ping {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--danger);
  animation: retry-ping 1.4s var(--ease-out-quart) infinite;
}

@keyframes retry-ping {
  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 0 0 color-mix(in oklab, var(--danger) 45%, transparent);
  }
  50% {
    opacity: 0.55;
    box-shadow: 0 0 0 4px color-mix(in oklab, var(--danger) 0%, transparent);
  }
}

/* === Reduced motion: calm static break === */
@media (prefers-reduced-motion: reduce) {
  .drop__node--lost,
  .drop__cut,
  .retry__ping {
    animation: none;
  }

  .drop__node--lost {
    opacity: 1;
  }

  .drop__cut {
    opacity: 1;
  }

  .retry__ping {
    box-shadow: none;
    opacity: 1;
  }
}
</style>

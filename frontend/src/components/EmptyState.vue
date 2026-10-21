<script setup lang="ts">
/**
 * «ТИШИНА» — пустое состояние в общем языке прибора: та же рамка, тот же
 * трек, та же типографика. Отличие — только состояние прибора: ровная линия
 * без сигнала, приглушённый акцент и место для действия.
 */
defineProps<{ message?: string }>()

/** Форма сигнала в покое: та же сетка ячеек, но без единого подъёма. */
const SIGNAL: { h?: string; gap?: boolean }[] = [
  { h: '0%' },
  { h: '0%' },
  { h: '0%' },
  { h: '0%' },
  { h: '0%' },
  { h: '0%' },
  { h: '0%' },
  { h: '0%' },
  { h: '0%' },
]
</script>

<template>
  <div
    class="state state-empty"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    data-testid="empty"
  >
    <div class="state__frame" data-testid="state-empty">
      <span class="state__corner state__corner--tl" aria-hidden="true"></span>
      <span class="state__corner state__corner--tr" aria-hidden="true"></span>
      <span class="state__corner state__corner--bl" aria-hidden="true"></span>
      <span class="state__corner state__corner--br" aria-hidden="true"></span>

      <p class="state__label">EMPTY NODE</p>

      <div class="state__track" aria-hidden="true">
        <span v-for="(cell, i) in SIGNAL" :key="i" class="state__cell">
          <span
            v-if="cell.h"
            class="state__bar"
            :style="{ '--h': cell.h ?? '0%', '--i': i }"
          ></span>
          <span v-if="cell.gap" class="state__break"></span>
        </span>
      </div>

      <p class="state__message">{{ message ?? 'Здесь пока пусто.' }}</p>

      <div class="state__action">
        <slot>
          <p class="state__hint">Добавьте первую запись — узел оживёт.</p>
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* === Общий язык состояний: «прибор» ===
   Одна рамка, один сигнальный трек, одна типографика. Различается только
   состояние прибора: сканирование, обрыв или тишина. */

.state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-4);
}

.state__frame {
  --state-accent: var(--accent);
  --state-soft: color-mix(in oklab, var(--accent) 38%, var(--rule));
  /* Кромка действия: граница контрола должна читаться (3:1 к бумаге), поэтому
     она собрана из акцента состояния, а не из приглушённого тона. */
  --state-border: color-mix(in oklab, var(--state-accent) 65%, var(--rule));

  /* Ритм прибора: оборот сканирования, вдох сигнала, пульс состояния. */
  --state-scan-cycle: 2.6s;
  --state-rise-cycle: 2s;
  --state-pulse-cycle: 2.4s;

  position: relative;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--space-3);
  width: 100%;
  max-width: 360px;
  min-height: 232px;
  padding: var(--space-6) var(--space-5) var(--space-5);
  background: var(--bg-surface);
  border: 1px solid var(--rule);
  box-shadow: var(--shadow-sm);
}

/* === Уголки прибора: рамка, а не карточка === */
.state__corner {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 0 solid var(--state-accent);
  pointer-events: none;
}

.state__corner--tl {
  top: -1px;
  left: -1px;
  border-top-width: 1px;
  border-left-width: 1px;
}

.state__corner--tr {
  top: -1px;
  right: -1px;
  border-top-width: 1px;
  border-right-width: 1px;
}

.state__corner--bl {
  bottom: -1px;
  left: -1px;
  border-bottom-width: 1px;
  border-left-width: 1px;
}

.state__corner--br {
  bottom: -1px;
  right: -1px;
  border-bottom-width: 1px;
  border-right-width: 1px;
}

/* === Подпись прибора: моно, капс, разрядка === */
.state__label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.64rem;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--state-accent);
}

/* === Сигнальный трек: девять ячеек, одна линия === */
.state__track {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  width: 100%;
  height: 44px;
}

.state__cell {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  flex: 1 1 0;
  height: 100%;
}

.state__bar {
  width: 100%;
  max-width: 18px;
  height: max(2px, var(--h, 0%));
  background: var(--state-soft);
  transform-origin: bottom;
}

/* === Обрыв: линия разорвана === */
.state__break {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 3px;
  height: 24px;
  background: var(--state-accent);
  transform: translateX(-50%) rotate(22deg);
}

/* === Луч: единственное, что движется при загрузке === */
.state__beam {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    var(--state-accent) 0 2px,
    color-mix(in oklab, var(--state-accent) 20%, transparent) 2px 36px,
    transparent 36px
  );
  animation: state-scan var(--state-scan-cycle) var(--ease-emphasized) infinite;
  pointer-events: none;
}

@keyframes state-scan {
  0% {
    transform: translateX(0);
    opacity: 0;
  }

  12%,
  88% {
    opacity: 1;
  }

  100% {
    transform: translateX(calc(100% - 2px));
    opacity: 0;
  }
}

/* === Строка сообщения: единственный голос состояния === */
.state__message {
  margin: 0;
  max-width: 40ch;
  min-height: 3rem;
  font-family: var(--font-body);
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--ink-secondary);
  text-align: center;
}

/* === Действие: зарезервированная строка, чтобы высота не прыгала === */
.state__action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 44px;
}

.state__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0 var(--space-5);
  font-family: var(--font-mono);
  font-size: 0.66rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--state-accent);
  background: transparent;
  border: 1px solid var(--state-border);
  cursor: pointer;
  transition:
    background var(--motion-hover),
    border-color var(--motion-hover),
    transform var(--motion-press);
}

.state__button:hover {
  background: color-mix(in oklab, var(--state-accent) 10%, transparent);
  border-color: var(--state-accent);
}

.state__button:focus-visible {
  outline: 2px solid var(--state-accent);
  outline-offset: 2px;
}

.state__button:active {
  transform: translateY(1px);
}

.state__button-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--state-accent);
}

/* === Живой индикатор: работа идёт === */
.state__live {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--state-accent);
  animation: state-live var(--state-pulse-cycle) var(--ease-emphasized) infinite;
}

@keyframes state-live {
  0%,
  100% {
    opacity: 0.35;
  }

  50% {
    opacity: 1;
  }
}

/* === Подсказка: что можно сделать === */
.state__hint {
  margin: 0;
  max-width: 40ch;
  font-family: var(--font-body);
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--ink-secondary);
  text-align: center;
}

/* === Состояние: тишина — ровная линия, приглушённый акцент === */
.state-empty .state__frame {
  --state-accent: color-mix(in oklab, var(--accent) 72%, var(--ink-secondary));
  --state-soft: color-mix(in oklab, var(--accent) 24%, var(--rule));
}

/* === Статичный кадр: прибор замирает, контент виден сразу === */
@media (prefers-reduced-motion: reduce) {
  .state__bar,
  .state__beam,
  .state__break,
  .state__live {
    animation: none;
  }

  .state__beam {
    display: none;
  }

  .state-loading .state__bar {
    transform: scaleY(0.55);
    opacity: 1;
  }

  .state__break,
  .state__live {
    opacity: 1;
  }
}
</style>

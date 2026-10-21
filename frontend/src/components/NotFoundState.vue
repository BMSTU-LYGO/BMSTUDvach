<script setup lang="ts">
import { computed } from 'vue'

/**
 * «ПУСТОЙ КАРМАН» — состояние «фрагмент не найден» и его родственники в
 * общем языке прибора.
 *
 * Прибор общий с loading/error/empty: та же рамка с уголками, та же
 * типографика (моно-подпись + строка сообщения гарнитурой корпуса), та же
 * зарезервированная высота — контент не прыгает при смене состояния.
 *
 * Своя графика у каждого состояния: след вырезанного фрагмента, пустой
 * график показаний, запечатанный конверт. Никакой анимации: кадр статичен
 * с первой секунды, поэтому состояние читается и при reduced-motion.
 */

type StateVariant = 'lost' | 'quiet' | 'sealed'

const props = withDefaults(
  defineProps<{
    /** Подпись прибора (моно, капс). По умолчанию — своя у каждой графики. */
    title?: string
    /** Строка сообщения. По умолчанию — своя у каждой графики. */
    message?: string
    /** Подпись кнопки действия. */
    actionLabel?: string
    /** Обработчик действия: без него кнопки нет, остаётся подсказка. */
    onAction?: () => void
    /** Графика прибора: след фрагмента, пустой график, запечатанный конверт. */
    variant?: StateVariant
    /** Действие временно недоступно — прибор уже ищет маршрут. */
    actionDisabled?: boolean
  }>(),
  {
    title: '',
    message: '',
    actionLabel: '',
    variant: 'lost',
    actionDisabled: false,
  },
)

/** Словарь прибора: подпись, сообщение и подсказка по умолчанию. */
const VARIANTS: Record<StateVariant, { title: string; message: string; hint: string }> =
  {
    lost: {
      title: 'FRAGMENT LOST',
      message:
        'Фрагмента по этому адресу нет: страница вырезана из сети, но след остался в бумаге.',
      hint: 'Проверьте адрес — или вернитесь в сеть с соседнего фрагмента.',
    },
    quiet: {
      title: 'NO READINGS',
      message: 'Показаний ещё нет: прибор молчит, потому что сеть ещё не отчиталась.',
      hint: 'Как только появится первая запись, шкала оживёт.',
    },
    sealed: {
      title: 'ACCESS SEALED',
      message: 'Доступ закрыт: консоль ждёт служебную сессию.',
      hint: 'Войдите под служебной учётной записью — и консоль откроется.',
    },
  }

const caption = computed(() => props.title || VARIANTS[props.variant].title)
const text = computed(() => props.message || VARIANTS[props.variant].message)
const hint = computed(() => VARIANTS[props.variant].hint)
</script>

<template>
  <div
    :class="['state', 'state-notfound', `state-${props.variant}`]"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    data-testid="not-found"
    :data-variant="props.variant"
  >
    <div
      class="state__frame"
      data-testid="state-not-found"
      :data-variant="props.variant"
    >
      <span class="state__corner state__corner--tl" aria-hidden="true"></span>
      <span class="state__corner state__corner--tr" aria-hidden="true"></span>
      <span class="state__corner state__corner--bl" aria-hidden="true"></span>
      <span class="state__corner state__corner--br" aria-hidden="true"></span>

      <p class="state__label">{{ caption }}</p>

      <!-- Графика прибора: своя у каждого состояния. -->
      <div class="state__graphic" aria-hidden="true" data-testid="not-found-graphic">
        <svg
          v-if="props.variant === 'lost'"
          class="state__art"
          viewBox="0 0 240 44"
          focusable="false"
          data-testid="not-found-cut"
        >
          <g class="state__ruled">
            <line x1="4" y1="9" x2="236" y2="9" />
            <line x1="4" y1="18" x2="236" y2="18" />
            <line x1="4" y1="27" x2="236" y2="27" />
            <line x1="4" y1="36" x2="236" y2="36" />
          </g>
          <rect class="state__cut-hole" x="132" y="3" width="88" height="38" />
          <line class="state__cut-edge" x1="132" y1="3" x2="132" y2="41" />
          <path class="state__cut-tear" d="M220 3 l5 6 l-5 6 l5 6 l-5 6 l5 6 l-5 6" />
        </svg>

        <svg
          v-else-if="props.variant === 'quiet'"
          class="state__art"
          viewBox="0 0 240 44"
          focusable="false"
          data-testid="not-found-axis"
        >
          <g class="state__grid">
            <line x1="4" y1="12" x2="236" y2="12" />
            <line x1="4" y1="24" x2="236" y2="24" />
          </g>
          <g class="state__axis">
            <line x1="4" y1="3" x2="4" y2="40" />
            <line x1="4" y1="40" x2="236" y2="40" />
          </g>
          <rect class="state__zero" x="4" y="36" width="7" height="4" />
        </svg>

        <svg
          v-else
          class="state__art"
          viewBox="0 0 240 44"
          focusable="false"
          data-testid="not-found-seal"
        >
          <g class="state__envelope">
            <rect x="76" y="2" width="88" height="40" />
            <path d="M76 2 L120 22 L164 2" />
            <path d="M76 42 L114 25" />
            <path d="M164 42 L126 25" />
          </g>
          <rect class="state__seal" x="115" y="17" width="10" height="10" />
        </svg>
      </div>

      <p class="state__message">{{ text }}</p>

      <div class="state__action">
        <slot>
          <button
            v-if="props.onAction"
            type="button"
            class="state__button"
            :disabled="props.actionDisabled"
            @click="props.onAction?.()"
          >
            <span class="state__button-dot" aria-hidden="true"></span>
            {{ props.actionLabel || 'Вернуться' }}
          </button>
          <p v-else class="state__hint">{{ hint }}</p>
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* === Общий язык состояний: «прибор» ===
   Одна рамка, одна типографика, одна зарезервированная высота. Различается
   только графика прибора: след фрагмента, пустой график, запечатанный
   конверт. */

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

/* === Графика прибора: своя у каждого состояния === */
.state__graphic {
  display: block;
  width: 100%;
  max-width: 240px;
  height: 44px;
}

.state__art {
  display: block;
  width: 100%;
  height: 100%;
}

.state__art line,
.state__art path,
.state__art rect {
  vector-effect: non-scaling-stroke;
}

/* Лист: строки, которые когда-то были на месте. */
.state__ruled line {
  stroke: var(--rule);
  stroke-width: 1;
}

/* Карман: место вырезанного фрагмента — чуть темнее, чем бумага. */
.state__cut-hole {
  fill: color-mix(in oklab, var(--ink) 6%, var(--bg-surface));
  stroke: none;
}

/* Срез: ровный край ножа. */
.state__cut-edge {
  stroke: var(--state-soft);
  stroke-width: 1;
}

/* Рваный край: бумага порвалась по волокну. */
.state__cut-tear {
  fill: none;
  stroke: var(--state-accent);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Сетка прибора: показаний ещё нет. */
.state__grid line {
  stroke: var(--rule);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

/* Оси: прибор ждёт первую точку. */
.state__axis line {
  stroke: var(--ink-tertiary);
  stroke-width: 1;
}

/* Нулевая отметка: прибор включён, но показаний нет. */
.state__zero {
  fill: var(--state-accent);
  stroke: none;
}

/* Конверт: доступ закрыт. */
.state__envelope rect {
  fill: none;
  stroke: var(--rule);
  stroke-width: 1;
}

.state__envelope path {
  fill: none;
  stroke: var(--ink-tertiary);
  stroke-width: 1;
}

/* Печать: единственный акцент состояния. */
.state__seal {
  fill: var(--state-accent);
  stroke: none;
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

.state__button:hover:not(:disabled) {
  background: color-mix(in oklab, var(--state-accent) 10%, transparent);
  border-color: var(--state-accent);
}

.state__button:focus-visible {
  outline: 2px solid var(--state-accent);
  outline-offset: 2px;
}

.state__button:active:not(:disabled) {
  transform: translateY(1px);
}

.state__button:disabled {
  opacity: 0.6;
  cursor: progress;
}

.state__button-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--state-accent);
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

/* === Состояние: след фрагмента — единственный цветной акцент === */
.state-lost .state__frame {
  --state-accent: var(--accent);
  --state-soft: color-mix(in oklab, var(--accent) 38%, var(--rule));
}

/* === Состояние: тишина показаний — приглушённый акцент === */
.state-quiet .state__frame {
  --state-accent: color-mix(in oklab, var(--accent) 72%, var(--ink-secondary));
  --state-soft: color-mix(in oklab, var(--accent) 24%, var(--rule));
}

/* === Состояние: закрытый доступ — чернила вместо красной стены === */
.state-sealed .state__frame {
  --state-accent: var(--ink-secondary);
  --state-soft: color-mix(in oklab, var(--ink-secondary) 30%, var(--rule));
}
</style>

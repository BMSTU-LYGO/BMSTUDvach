<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export interface LensCommand {
  id: string
  label: string
  hint: string
  shortcut: string
  run: () => void
}

/**
 * Command Lens (SIGNAL-09). Borrows the /-command UX principle from
 * Notion/Raycast — not the visuals. Real actions only.
 *
 * It shares the Scan Lens frame language: one surface, mono type, signal
 * rows with one active row and kbd affordances on the edges.
 */
const props = defineProps<{
  open: boolean
  filter: string
  commands: LensCommand[]
}>()

const emit = defineEmits<{ close: [] }>()

const active = ref(0)

const filtered = computed(() => {
  const q = props.filter.trim().toLowerCase()
  if (!q) return props.commands
  return props.commands.filter(
    (c) => c.label.toLowerCase().includes(q) || c.id.includes(q),
  )
})

// Russian plurals: 1 команда, 2 команды, 5 команд.
const countLabel = computed(() => {
  const n = filtered.value.length
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'команда'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'команды'
  return 'команд'
})

watch(
  () => [props.open, props.filter] as const,
  () => {
    active.value = 0
  },
)

function run(cmd: LensCommand) {
  cmd.run()
  emit('close')
}

function move(delta: number) {
  if (!filtered.value.length) return
  active.value = (active.value + delta + filtered.value.length) % filtered.value.length
}

function commit() {
  const c = filtered.value[active.value]
  if (c) run(c)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    commit()
  }
}

defineExpose({ onKeydown, commit })
</script>

<template>
  <Transition name="lens">
    <div
      v-if="open"
      class="lens"
      role="listbox"
      aria-label="Команды"
      data-testid="command-lens"
      @keydown="onKeydown"
    >
      <div class="lens__head" aria-hidden="true">
        <span class="lens__kicker">команды</span>
        <span class="lens__query">
          <span class="lens__query-prefix">/</span>{{ filter
          }}<span class="lens__caret"></span>
        </span>
        <span class="lens__count">{{ filtered.length }}/{{ commands.length }}</span>
      </div>

      <div class="lens__list">
        <div v-if="filtered.length === 0" class="lens__empty">
          <span class="lens__empty-mark" aria-hidden="true"></span>
          <span class="lens__empty-text">нет совпадений</span>
        </div>
        <button
          v-for="(cmd, i) in filtered"
          :key="cmd.id"
          type="button"
          class="lens__item"
          :class="{ 'lens__item--active': i === active }"
          role="option"
          :aria-selected="i === active"
          :data-command="cmd.id"
          :aria-label="`${cmd.label} — ${cmd.hint}`"
          @click="run(cmd)"
          @mouseenter="active = i"
        >
          <span class="lens__name">{{ cmd.label }}</span>
          <span class="lens__hint">{{ cmd.hint }}</span>
          <span class="lens__shortcut">
            <kbd>{{ cmd.shortcut }}</kbd>
          </span>
        </button>
      </div>

      <footer class="lens__foot" aria-hidden="true">
        <span class="lens__foot-count">{{ filtered.length }} {{ countLabel }}</span>
        <span class="lens__foot-keys">
          <kbd>↑↓</kbd> ряд <kbd>↵</kbd> выполнить <kbd>esc</kbd> закрыть
        </span>
      </footer>
    </div>
  </Transition>
</template>

<style scoped>
/* Q-A-006: браузер рисует кнопки своим шрифтом (Arial 13.33px) — гарнитура
   приложения должна побеждать. Правило с низкой специфичностью: у строк,
   которые задают свой кегль, он остаётся. */
button {
  font-family: inherit;
}

.lens {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  z-index: var(--z-dropdown);
  display: flex;
  flex-direction: column;
  /* Q-M-08: список команд резался пополам — пятая строка была наполовину
     за экраном, и это читалось как сломанный рендер. Теперь высота линзы
     считается целыми строками, а список помещается в экран целиком. */
  max-height: min(70vh, 420px);
  overflow: hidden;
}

.lens__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--paper-sunken);
  font-family: var(--font-body);
  /* Q-M-10: подпись прибора не должна быть мельче 10 px. */
  font-size: 0.6875rem;
}

.lens__kicker {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  color: var(--accent);
  flex-shrink: 0;
}

.lens__kicker-sep {
  color: var(--ink-tertiary);
}

.lens__query {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lens__query-prefix {
  color: var(--accent-hover);
}

.lens__caret {
  /* Каретка мигает раз в 1.1 с — это её собственный ритм, а не роль
     движения: у цикла нет «появления» и «наведения». */
  --lens-caret-rhythm: 1.1s steps(2, start);
  display: inline-block;
  width: 6px;
  height: 11px;
  background: var(--accent);
  transform: translateY(1px);
  animation: lens-caret var(--lens-caret-rhythm) infinite;
}

@keyframes lens-caret {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

.lens__count {
  color: var(--ink-tertiary);
  flex-shrink: 0;
}

.lens__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: var(--space-1);
  overflow-y: auto;
  /* Q-M-08: список прокручивается сам, но строки не режутся — каждая
     команда занимает целую строку, край списка подсказывает, что он
     длиннее экрана. */
  scroll-snap-type: y proximity;
  -webkit-overflow-scrolling: touch;
}

.lens__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  min-height: 40px;
  padding: var(--space-2) var(--space-3);
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: inherit;
  cursor: pointer;
  text-align: left;
  width: 100%;
  scroll-snap-align: start;
  transition: background var(--duration-fast) var(--ease-out-quart);
}

.lens__item:hover {
  background: color-mix(in oklab, var(--ink) 5%, transparent);
}

.lens__item--active {
  background: color-mix(in oklab, var(--accent) 12%, transparent);
  box-shadow: inset 2px 0 0 var(--accent);
}

.lens__item--active:hover {
  background: color-mix(in oklab, var(--accent) 16%, transparent);
}

.lens__item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.lens__name {
  font-family: var(--font-body);
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lens__item--active .lens__name {
  color: var(--accent);
}

.lens__hint {
  font-size: 0.72rem;
  color: var(--ink-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lens__shortcut kbd {
  font-family: var(--font-body);
  font-size: 0.64rem;
  line-height: 1.4;
  color: var(--ink-secondary);
  background: color-mix(in oklab, var(--paper-raised) 75%, transparent);
  border: 1px solid var(--rule);
  border-bottom-width: 2px;
  border-radius: var(--radius-sm);
  padding: 2px 5px;
  white-space: nowrap;
}

.lens__empty {
  padding: var(--space-5) var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
}

.lens__empty-mark {
  position: relative;
  width: 22px;
  height: 22px;
  border: 1px solid var(--rule);
  border-radius: 50%;
}

.lens__empty-mark::after {
  content: '';
  position: absolute;
  inset: 9px;
  border-radius: 50%;
  background: var(--ink-tertiary);
}

.lens__empty-text {
  font-size: 0.8rem;
  color: var(--ink-tertiary);
}

.lens__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-body);
  font-size: 0.6875rem;
  color: var(--ink-tertiary);
}

.lens__foot-keys {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.lens__foot-keys kbd {
  font-family: var(--font-body);
  font-size: 0.6875rem;
  line-height: 1.4;
  color: var(--ink-secondary);
  background: color-mix(in oklab, var(--paper-raised) 75%, transparent);
  border: 1px solid var(--rule);
  border-bottom-width: 2px;
  border-radius: var(--radius-sm);
  padding: 2px 5px;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .lens {
    max-height: min(60vh, 380px);
  }

  .lens__hint {
    display: none;
  }

  .lens__item {
    grid-template-columns: minmax(0, 1fr) auto;
    /* Q-M-09: строка команды — цель для пальца, а не строка в 40 px. */
    min-height: 44px;
  }
}

.lens-enter-active,
.lens-leave-active {
  /* Линза выпадает тихо: одна роль наведения (150ms) на оба свойства —
     `transition` не складывается, а разные кривые в одной строке читались
     бы как случайность. */
  transition:
    opacity var(--motion-hover),
    transform var(--motion-hover);
}

.lens-enter-from,
.lens-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* Движение выключено — появление линзы мгновенное. Ветка стоит ПОСЛЕ
   обычных правил перехода: при равной специфичности побеждает тот, кто
   объявлен последним (Q-T6). */
@media (prefers-reduced-motion: reduce) {
  .lens__item,
  .lens__caret {
    transition: none;
    animation: none;
  }

  .lens-enter-active,
  .lens-leave-active {
    transition: none;
  }
}
</style>

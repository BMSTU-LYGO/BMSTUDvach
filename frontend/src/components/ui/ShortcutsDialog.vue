<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * SHORTCUTS-01 — the `?` cheat-sheet.
 *
 * A real modal layer: role="dialog", focus trap, Esc/backdrop close, body
 * scroll lock and focus restored to whatever opened it. Visibility is owned
 * by the host (`v-model`); the keyboard trigger lives in `useNavShortcuts`.
 */
const open = defineModel<boolean>({ required: true })

interface ShortcutRow {
  keys: string[]
  label: string
}

interface ShortcutSection {
  title: string
  rows: ShortcutRow[]
}

// Strictly what the app actually listens for.
const SECTIONS: ShortcutSection[] = [
  {
    title: 'Глобально',
    rows: [
      { keys: ['⌘/Ctrl', 'K'], label: 'поиск' },
      { keys: ['/'], label: 'поиск' },
      { keys: ['g', 'h'], label: 'главная' },
      { keys: ['g', 'b'], label: 'разделы' },
      { keys: ['g', 'm'], label: 'модерация' },
      { keys: ['g', 't'], label: 'вверх' },
      { keys: ['?'], label: 'эта справка' },
    ],
  },
  {
    title: 'Signal Dock',
    rows: [
      { keys: ['⌘/Ctrl', 'Enter'], label: 'отправить' },
      { keys: ['/'], label: 'командная линза' },
      { keys: ['Ctrl', 'V'], label: 'вложить файл' },
      { keys: ['>>id'], label: 'цитата (клик)' },
    ],
  },
]

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

const dialogRef = ref<HTMLElement | null>(null)
const closeRef = ref<HTMLButtonElement | null>(null)
const active = ref(false)
const entered = ref(false)
const lastFocusElement = ref<HTMLElement | null>(null)
const previousBodyOverflow = ref('')

function close(): void {
  open.value = false
}

function trapFocus(event: KeyboardEvent): void {
  const root = dialogRef.value
  if (!root) return
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  if (!first || !last) {
    event.preventDefault()
    root.focus()
    return
  }
  const inside = root.contains(document.activeElement)
  if (event.shiftKey) {
    if (!inside || document.activeElement === first) {
      event.preventDefault()
      last.focus()
    }
    return
  }
  if (!inside || document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (!active.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'Tab') trapFocus(event)
}

watch(
  open,
  async (isOpen) => {
    if (isOpen === active.value) return
    active.value = isOpen
    if (isOpen) {
      lastFocusElement.value =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      previousBodyOverflow.value = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onWindowKeydown)
      await nextTick()
      entered.value = true
      closeRef.value?.focus()
    } else {
      window.removeEventListener('keydown', onWindowKeydown)
      document.body.style.overflow = previousBodyOverflow.value
      entered.value = false
      lastFocusElement.value?.focus()
      lastFocusElement.value = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  if (active.value) {
    document.body.style.overflow = previousBodyOverflow.value
    active.value = false
  }
})
</script>

<template>
  <div
    v-if="open"
    class="shortcuts-backdrop"
    :class="{ 'shortcuts-backdrop--entered': entered }"
    @click.self="close"
  >
    <div
      ref="dialogRef"
      class="shortcuts"
      :class="{ 'shortcuts--entered': entered }"
      role="dialog"
      aria-modal="true"
      aria-label="Горячие клавиши"
      tabindex="-1"
      data-testid="shortcuts-dialog"
    >
      <header class="shortcuts__head">
        <span class="shortcuts__kicker">горячие клавиши</span>
        <button
          ref="closeRef"
          type="button"
          class="shortcuts__close"
          aria-label="Закрыть справку"
          data-testid="shortcuts-close"
          @click="close"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <div class="shortcuts__body">
        <section
          v-for="section in SECTIONS"
          :key="section.title"
          class="shortcuts__section"
          :aria-label="section.title"
        >
          <h2 class="shortcuts__section-title">{{ section.title }}</h2>
          <dl class="shortcuts__list">
            <div
              v-for="row in section.rows"
              :key="`${section.title}-${row.label}-${row.keys.join()}`"
              class="shortcuts__row"
              data-testid="shortcut-row"
            >
              <dt class="shortcuts__keys">
                <kbd v-for="key in row.keys" :key="key" class="shortcuts__key">{{ key }}</kbd>
              </dt>
              <dd class="shortcuts__label">{{ row.label }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <footer class="shortcuts__foot">
        <span class="shortcuts__hint"><kbd class="shortcuts__key">esc</kbd> закрыть</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.shortcuts-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: color-mix(in oklab, var(--paper) 62%, transparent);
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-out-quart);
}

.shortcuts-backdrop--entered {
  opacity: 1;
}

.shortcuts {
  position: relative;
  width: min(560px, 100%);
  max-height: min(620px, 86vh);
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  outline: none;
  transform: translateY(8px);
  transition: transform var(--duration-normal) var(--ease-out-expo);
}

.shortcuts--entered {
  transform: translateY(0);
}


.shortcuts__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--paper-sunken);
}

.shortcuts__kicker {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  font-family: var(--font-body);
  font-size: 0.6rem;
  color: var(--accent);
}

.shortcuts__sep {
  color: var(--ink-tertiary);
}

.shortcuts__close {
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--ink-tertiary);
  font-family: var(--font-body);
  font-size: 0.86rem;
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart);
}

.shortcuts__close:hover {
  color: var(--accent);
  border-color: var(--rule);
}

.shortcuts__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.shortcuts__body {
  overflow-y: auto;
  padding: var(--space-4) var(--space-5) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.shortcuts__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.shortcuts__section-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-family: var(--font-body);
  font-size: 0.58rem;
  font-weight: 600;
  color: var(--ink-tertiary);
}

.shortcuts__section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--border-subtle), transparent);
}

.shortcuts__list {
  margin: 0;
  display: flex;
  flex-direction: column;
}

.shortcuts__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 34px;
  padding: var(--space-1) 0;
  border-bottom: 1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent);
}

.shortcuts__row:last-child {
  border-bottom: none;
}

.shortcuts__keys {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 116px;
}

.shortcuts__key {
  font-family: var(--font-body);
  font-size: 0.64rem;
  line-height: 1.4;
  color: var(--ink-secondary);
  background: color-mix(in oklab, var(--paper-raised) 75%, transparent);
  border: 1px solid var(--rule);
  border-bottom-width: 2px;
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  white-space: nowrap;
}

.shortcuts__label {
  margin: 0;
  font-size: 0.82rem;
  color: var(--ink-secondary);
}

.shortcuts__foot {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-body);
  font-size: 0.62rem;
  color: var(--ink-tertiary);
}

.shortcuts__hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

@media (prefers-reduced-motion: reduce) {
  .shortcuts-backdrop,
  .shortcuts {
    transition: none;
  }

  .shortcuts {
    transform: none;
  }
}
</style>

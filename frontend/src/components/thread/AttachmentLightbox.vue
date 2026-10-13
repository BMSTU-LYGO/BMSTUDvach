<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import type { Attachment } from '@/types'

/**
 * ATTACHMENT LIGHTBOX — full-size viewer for the attachments of one post.
 *
 * The parent owns visibility (v-model) and only ever mounts this when a
 * preview tile was activated, so the whole overlay is inert while closed:
 * no listeners, no scroll lock, no lingering focus.
 *
 * Keyboard: Esc closes, ←/→ walk the attachments, Tab stays inside the
 * dialog. Focus returns to the tile that opened it.
 */
const props = defineProps<{
  attachments: Attachment[]
  modelValue: boolean
  startIndex?: number
  postId?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

const dialogRef = ref<HTMLElement | null>(null)
const closeRef = ref<HTMLButtonElement | null>(null)
const currentIndex = ref(0)
const active = ref(false)
const entered = ref(false)
const lastFocusElement = ref<HTMLElement | null>(null)
const previousBodyOverflow = ref('')

const total = computed(() => props.attachments.length)
const isOpen = computed(() => props.modelValue && total.value > 0)
const current = computed(() => props.attachments[currentIndex.value] ?? null)
const isFirst = computed(() => currentIndex.value <= 0)
const isLast = computed(() => currentIndex.value >= total.value - 1)
const counter = computed(() => `${pad(currentIndex.value + 1)} / ${pad(total.value)}`)

const dialogLabel = computed(() => {
  const base = `Вложение ${currentIndex.value + 1} из ${total.value}`
  return props.postId ? `${base} — пост #${props.postId}` : base
})

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), Math.max(total.value - 1, 0))
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

function isImage(attachment: Attachment) {
  return attachment.mime_type.startsWith('image/')
}

function step(delta: number) {
  if (total.value === 0) return
  currentIndex.value = clamp(currentIndex.value + delta)
}

function close() {
  emit('update:modelValue', false)
}

function onWindowKeydown(event: KeyboardEvent) {
  if (!active.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    step(-1)
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    step(1)
    return
  }
  if (event.key === 'Tab') trapFocus(event)
}

function trapFocus(event: KeyboardEvent) {
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

watch(
  isOpen,
  async (open) => {
    if (open === active.value) return
    active.value = open
    if (open) {
      lastFocusElement.value =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      previousBodyOverflow.value = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onWindowKeydown)
      currentIndex.value = clamp(props.startIndex ?? 0)
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

watch(
  () => props.startIndex,
  (value) => {
    if (active.value) currentIndex.value = clamp(value ?? 0)
  },
)

watch(total, () => {
  currentIndex.value = clamp(currentIndex.value)
})

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
    v-if="isOpen"
    ref="dialogRef"
    class="lightbox"
    :class="{ 'lightbox--entered': entered }"
    role="dialog"
    aria-modal="true"
    :aria-label="dialogLabel"
    tabindex="-1"
    data-testid="attachment-lightbox"
    @click.self="close"
  >
    <div class="lightbox__panel" data-testid="lightbox-panel">
      <header class="lightbox__head">
        <span class="lightbox__kicker" aria-hidden="true">SIGNAL VIEW</span>
        <span class="lightbox__counter" data-testid="lightbox-counter">{{ counter }}</span>
        <button
          ref="closeRef"
          type="button"
          class="lightbox__close"
          aria-label="Закрыть просмотр"
          data-testid="lightbox-close"
          @click="close"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <div class="lightbox__stage">
        <button
          type="button"
          class="lightbox__nav lightbox__nav--prev"
          aria-label="Предыдущее вложение"
          data-testid="lightbox-prev"
          :disabled="isFirst"
          @click="step(-1)"
        >
          <span class="lightbox__glyph" aria-hidden="true">←</span>
        </button>

        <figure class="lightbox__figure">
          <img
            v-if="current && isImage(current)"
            :key="current.id"
            class="lightbox__image"
            :src="current.url"
            :alt="current.original_name || 'Вложение'"
            :width="current.width ?? undefined"
            :height="current.height ?? undefined"
            loading="eager"
            data-testid="lightbox-image"
          />
          <a
            v-else-if="current"
            class="lightbox__file"
            :href="current.url"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Открыть ${current.original_name || 'вложение'} в новой вкладке`"
            data-testid="lightbox-file"
          >
            <span class="lightbox__glyph" aria-hidden="true">▣</span>
            <span class="lightbox__file-open">открыть в новой вкладке</span>
          </a>
          <figcaption class="lightbox__caption">
            <span class="lightbox__name">{{
              current?.original_name || 'Вложение'
            }}</span>
            <span class="lightbox__meta">{{
              current ? `${current.mime_type} · ${formatSize(current.size)}` : ''
            }}</span>
          </figcaption>
        </figure>

        <button
          type="button"
          class="lightbox__nav lightbox__nav--next"
          aria-label="Следующее вложение"
          data-testid="lightbox-next"
          :disabled="isLast"
          @click="step(1)"
        >
          <span class="lightbox__glyph" aria-hidden="true">→</span>
        </button>
      </div>

      <footer class="lightbox__hints" aria-hidden="true">
        <span>← → переключение</span>
        <span>esc закрыть</span>
        <span>клик по фону закрыть</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: var(--bg-overlay);
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-out-quart);
}

.lightbox--entered {
  opacity: 1;
}

.lightbox__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: min(100%, 1080px);
  max-height: calc(100vh - var(--space-8));
  padding: var(--space-4);
  overflow: hidden;
  background: color-mix(in oklab, var(--bg-surface) 92%, transparent);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  transform: scale(0.96);
  transition: transform var(--duration-normal) var(--ease-out-quart);
}

.lightbox--entered .lightbox__panel {
  transform: scale(1);
}

.lightbox__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.lightbox__kicker {
  font-family: var(--font-display);
  font-size: 0.64rem;
  letter-spacing: 0.22em;
  color: var(--accent);
}

.lightbox__counter {
  font-family: var(--font-display);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.lightbox__close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin-left: auto;
  padding: 0;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-family: var(--font-display);
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart),
    background var(--duration-fast) var(--ease-out-quart);
}

.lightbox__close:hover {
  color: var(--text-primary);
  border-color: var(--border-accent);
  background: var(--bg-raised);
}

.lightbox__stage {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  min-height: 0;
}

.lightbox__nav {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  background: var(--bg-raised);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart),
    background var(--duration-fast) var(--ease-out-quart);
}

.lightbox__nav:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--border-accent);
  background: var(--bg-surface);
}

.lightbox__nav:disabled {
  color: var(--text-muted);
  border-color: var(--border-subtle);
  background: transparent;
  cursor: default;
  opacity: 0.5;
}

.lightbox__glyph {
  font-family: var(--font-display);
  font-size: 1.1rem;
  line-height: 1;
}

.lightbox__figure {
  display: grid;
  place-items: center;
  gap: var(--space-3);
  min-width: 0;
  margin: 0;
}

.lightbox__image {
  display: block;
  max-width: 100%;
  max-height: min(64vh, 640px);
  width: auto;
  height: auto;
  object-fit: contain;
  background: var(--bg-deep);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.lightbox__file {
  display: grid;
  place-items: center;
  gap: var(--space-2);
  min-height: 200px;
  max-height: min(64vh, 640px);
  padding: var(--space-8);
  color: var(--text-secondary);
  border: 1px dashed var(--border-medium);
  border-radius: var(--radius-md);
  transition:
    color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart);
}

.lightbox__file:hover {
  color: var(--accent);
  border-color: var(--border-accent);
}

.lightbox__file .lightbox__glyph {
  font-size: 2rem;
}

.lightbox__file-open {
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
}

.lightbox__caption {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: var(--space-2);
  text-align: center;
}

.lightbox__name {
  font-family: var(--font-display);
  font-size: 0.78rem;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.lightbox__meta {
  font-family: var(--font-display);
  font-size: 0.68rem;
  color: var(--text-muted);
}

.lightbox__hints {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  justify-content: center;
  font-family: var(--font-display);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  color: var(--text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .lightbox,
  .lightbox__panel {
    transition: none;
  }

  .lightbox__panel {
    transform: none;
  }
}
</style>

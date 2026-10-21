<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { listBoards } from '@/api/boards'
import { searchNetwork, type SearchPostHit, type SearchResults } from '@/api/search'
import type { Board, ThreadSummary } from '@/types'
import { usePointerLight } from '@/composables/useMotion'
import NetworkIcon from '../composer/NetworkIcon.vue'
import ScanHighlight from './ScanHighlight.vue'

/**
 * SCAN LENS (NEXT-05) — global network search on Cmd/Ctrl+K.
 *
 * Styled as a diagnostic scanner, not a modal: one input, results as
 * signal rows, keyboard-first. Yields to the Signal Dock's own Command
 * Lens when focus lives inside the dock or any field.
 *
 * The reaction of the lens is the reaction of an instrument: a soft light
 * slides along its frame where the cursor is, and the picked row answers
 * with an edge. Nothing blinks, nothing grows.
 */

const router = useRouter()
const open = defineModel<boolean>('open', { required: true })

const query = ref('')
const results = ref<SearchResults>({ query: '', threads: [], posts: [] })
const loading = ref(false)
const failed = ref(false)
const active = ref(0)

const boardFilter = ref<string | null>(null)
const boards = ref<Board[]>([])

const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const chipsRef = ref<HTMLElement | null>(null)
const lensRef = ref<HTMLElement | null>(null)

// The frame of the instrument catches the light of the cursor — one node,
// one listener. The rows themselves stay quiet.
usePointerLight(lensRef, { radius: 260 })

interface Row {
  kind: 'thread' | 'post'
  id: number
  title: string
  meta: string
  snippet?: string
  to: string
}

const rows = computed<Row[]>(() => {
  const threadRows: Row[] = results.value.threads.map((t: ThreadSummary) => ({
    kind: 'thread',
    id: t.id,
    title: t.title,
    meta: `/${t.board} · ${t.reply_count} ${plural(t.reply_count, 'ответ', 'ответа', 'ответов')}`,
    snippet: t.op_snippet || undefined,
    to: `/threads/${t.id}`,
  }))
  const postRows: Row[] = results.value.posts.map((p: SearchPostHit) => ({
    kind: 'post',
    id: p.id,
    title: p.thread_title,
    meta: `#${p.id} в треде #${p.thread}`,
    snippet: p.snippet,
    to: `/threads/${p.thread}#post-${p.id}`,
  }))
  return [...threadRows, ...postRows]
})

const hasQuery = computed(() => query.value.trim().length > 0)
const empty = computed(
  () => hasQuery.value && !loading.value && rows.value.length === 0,
)
const errored = computed(() => empty.value && failed.value)

// Russian plurals: 1 сигнал, 2 сигнала, 5 сигналов.
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const countLabel = computed(() =>
  plural(rows.value.length, 'сигнал', 'сигнала', 'сигналов'),
)

// One polite sentence for assistive tech: the lens is keyboard-first,
// but its state must not be visible-only.
const status = computed(() => {
  if (loading.value) return 'сканирование сети…'
  if (errored.value) return 'скан прерван — сеть не ответила'
  if (empty.value) return 'сеть молчит — сигнал не найден'
  if (rows.value.length) return `найдено сигналов: ${rows.value.length}`
  return ''
})

// debounce + stale-response guard
let debounce: number | null = null
let requestId = 0

async function runSearch(value: string) {
  const id = ++requestId
  try {
    const data = await searchNetwork(value, { board: boardFilter.value })
    if (id !== requestId) return
    results.value = data
    failed.value = false
  } catch {
    if (id !== requestId) return
    results.value = { query: value, threads: [], posts: [] }
    failed.value = true
  } finally {
    if (id === requestId) loading.value = false
  }
}

watch(query, (value) => {
  active.value = 0
  if (debounce) window.clearTimeout(debounce)
  if (!value.trim()) {
    results.value = { query: '', threads: [], posts: [] }
    loading.value = false
    failed.value = false
    return
  }
  loading.value = true
  failed.value = false
  debounce = window.setTimeout(() => void runSearch(value), 200)
})

async function loadBoards() {
  try {
    boards.value = await listBoards()
  } catch {
    boards.value = []
  }
}

function selectBoard(slug: string | null) {
  boardFilter.value = slug
  active.value = 0
  if (!hasQuery.value) return
  if (debounce) window.clearTimeout(debounce)
  loading.value = true
  failed.value = false
  void runSearch(query.value)
}

function onChipsKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const chips = Array.from(
    chipsRef.value?.querySelectorAll<HTMLButtonElement>('.scan__chip') ?? [],
  )
  const index = chips.indexOf(document.activeElement as HTMLButtonElement)
  if (index < 0) return
  e.preventDefault()
  const next =
    e.key === 'ArrowRight'
      ? (index + 1) % chips.length
      : (index - 1 + chips.length) % chips.length
  chips[next]?.focus()
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  query.value = ''
  results.value = { query: '', threads: [], posts: [] }
  boardFilter.value = null
  failed.value = false
  await nextTick()
  inputRef.value?.focus()
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    open.value = false
    return
  }
  if (!rows.value.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = (active.value + 1) % rows.value.length
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = (active.value - 1 + rows.value.length) % rows.value.length
    scrollActiveIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    navigate(rows.value[active.value])
  }
}

function scrollActiveIntoView() {
  listRef.value
    ?.querySelector<HTMLElement>('.scan-row--active')
    ?.scrollIntoView({ block: 'nearest' })
}

function navigate(row: Row | undefined) {
  if (!row) return
  open.value = false
  void router.push(row.to)
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) open.value = false
}

onMounted(() => {
  document.addEventListener('keydown', onGlobalKeydown, true)
  void loadBoards()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKeydown, true)
})

function onGlobalKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') open.value = false
}
</script>

<template>
  <div v-if="open" class="scan-backdrop" @click="onBackdropClick">
    <div
      ref="lensRef"
      class="scan react-edge"
      role="dialog"
      aria-label="Поиск по сети"
      data-testid="scan-lens"
    >
      <header class="scan__head">
        <span class="scan__kicker">поиск</span>
        <input
          ref="inputRef"
          v-model="query"
          class="scan__input"
          type="text"
          placeholder="что ищем в сети?"
          aria-label="Поисковый запрос"
          data-testid="scan-input"
          @keydown="onKeydown"
        />
        <span v-if="loading" class="scan__spinner" aria-hidden="true"></span>
        <button
          type="button"
          class="scan__close"
          aria-label="Закрыть поиск"
          @click="open = false"
        >
          <NetworkIcon name="close" :size="14" :stroke-width="2" />
        </button>
      </header>

      <div
        ref="chipsRef"
        class="scan__chips"
        role="group"
        aria-label="Фильтр по разделу"
        @keydown="onChipsKeydown"
      >
        <button
          type="button"
          class="scan__chip"
          :class="{ 'scan__chip--active': boardFilter === null }"
          data-testid="scan-board-chip"
          data-board=""
          aria-label="Все разделы"
          :aria-pressed="boardFilter === null"
          @click="selectBoard(null)"
        >
          Все
        </button>
        <button
          v-for="board in boards"
          :key="board.slug"
          type="button"
          class="scan__chip"
          :class="{ 'scan__chip--active': boardFilter === board.slug }"
          :data-testid="'scan-board-chip'"
          :data-board="board.slug"
          :aria-label="`Раздел ${board.name}`"
          :aria-pressed="boardFilter === board.slug"
          :title="board.name"
          @click="selectBoard(board.slug)"
        >
          {{ board.slug }}
        </button>
      </div>

      <div v-if="rows.length" ref="listRef" class="scan__results" role="listbox">
        <template v-for="(row, i) in rows" :key="`${row.kind}-${row.id}`">
          <div v-if="i === 0" class="scan__section" aria-hidden="true">треды</div>
          <div
            v-else-if="i === results.threads.length"
            class="scan__section"
            aria-hidden="true"
          >
            посты
          </div>
          <button
            type="button"
            class="scan-row"
            :class="{ 'scan-row--active': i === active }"
            role="option"
            :aria-selected="i === active"
            :data-testid="'scan-row'"
            @click="navigate(row)"
            @mouseenter="active = i"
          >
            <span
              class="scan-row__kind"
              :class="`scan-row__kind--${row.kind}`"
              aria-hidden="true"
            ></span>
            <span class="scan-row__body">
              <span class="scan-row__title">
                <ScanHighlight :text="row.title" :query="query" />
              </span>
              <span v-if="row.snippet" class="scan-row__snippet">
                <ScanHighlight :text="row.snippet" :query="query" />
              </span>
              <span class="scan-row__meta">{{ row.meta }}</span>
            </span>
          </button>
        </template>
      </div>

      <div v-else class="scan__panels">
        <p
          v-if="errored"
          class="scan__notice scan__notice--error"
          data-testid="scan-error"
        >
          <span class="scan__notice-mark" aria-hidden="true"></span>
          <span class="scan__notice-text">скан прерван — сеть не ответила</span>
          <span class="scan__notice-hint">проверьте соединение и повторите запрос</span>
        </p>
        <p v-else-if="empty" class="scan__notice" data-testid="scan-empty">
          <span class="scan__notice-mark" aria-hidden="true"></span>
          <span class="scan__notice-text">сеть молчит — сигнал не найден</span>
          <span class="scan__notice-hint"
            >смягчите запрос или выберите другой раздел</span
          >
        </p>
        <div v-else-if="!hasQuery" class="scan__hint">
          <p class="scan__hint-title">
            линза готова — заголовки и посты подсканируют сразу
          </p>
          <dl class="scan__hint-keys">
            <div class="scan__hint-row">
              <dt><kbd>⌘K</kbd></dt>
              <dd>сканер из любого места</dd>
            </div>
            <div class="scan__hint-row">
              <dt><kbd>title:</kbd></dt>
              <dd>искать только в заголовках</dd>
            </div>
            <div class="scan__hint-row">
              <dt><kbd>board:</kbd></dt>
              <dd>ограничить раздел</dd>
            </div>
            <div class="scan__hint-row">
              <dt><kbd>↑↓</kbd></dt>
              <dd>скользить по сигналам</dd>
            </div>
            <div class="scan__hint-row">
              <dt><kbd>↵</kbd></dt>
              <dd>перейти к сигналу</dd>
            </div>
            <div class="scan__hint-row">
              <dt><kbd>esc</kbd></dt>
              <dd>закрыть линзу</dd>
            </div>
          </dl>
        </div>
      </div>

      <footer v-if="rows.length" class="scan__foot">
        <span class="scan__count">{{ rows.length }} {{ countLabel }}</span>
        <span class="scan__keys">
          <kbd>↑↓</kbd> ряд <kbd>↵</kbd> перейти <kbd>esc</kbd> закрыть
        </span>
      </footer>

      <p class="scan__sr" role="status" aria-live="polite">{{ status }}</p>
    </div>
  </div>
</template>

<style scoped>
.scan-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop);
  background: color-mix(in oklab, var(--paper) 62%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6) var(--space-4);
  animation: scan-fade var(--motion-hover);
}

@keyframes scan-fade {
  from {
    opacity: 0;
  }
}

/* the lens itself: a frame, not a box */
.scan {
  position: relative;
  width: min(640px, 100%);
  max-height: min(560px, 80vh);
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  /* the lens answers at once — it is an instrument, not a scene change */
  animation: scan-in var(--motion-hover) var(--ease-emphasized);
}

@keyframes scan-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.scan__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--paper-sunken);
}

.scan__kicker {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  font-family: var(--font-body);
  font-size: 0.6rem;
  color: var(--accent);
  flex-shrink: 0;
}

.scan__kicker-sep {
  color: var(--ink-tertiary);
}

.scan__input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 1.05rem;
  min-height: 34px;
}

.scan__input::placeholder {
  color: var(--ink-tertiary);
}

.scan__spinner {
  /* the instrument works: the ring turns while the scan runs —
     равномерное вращение требует линейной кривой, иначе кольцо
     дёргается на стыке цикла */
  --scan-spin-rhythm: var(--motion-cinematic-duration) var(--ease-linear);
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1.5px solid var(--rule);
  border-top-color: var(--accent);
  flex-shrink: 0;
  animation: scan-spin var(--scan-spin-rhythm) infinite;
}

@keyframes scan-spin {
  to {
    transform: rotate(360deg);
  }
}

.scan__close {
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: 6px;
  cursor: pointer;
  color: var(--ink-tertiary);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  /* тихая реакция: цвет и кромка, без «вспышки» */
  transition:
    color var(--motion-hover),
    border-color var(--motion-hover);
}

.scan__close:hover {
  color: var(--accent);
  border-color: var(--rule);
}

.scan__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* section chips — one visual, one touch target, one active state */
.scan__chips {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  overflow-x: auto;
  border-bottom: 1px solid var(--border-subtle);
  scrollbar-width: none;
}

.scan__chips::-webkit-scrollbar {
  display: none;
}

.scan__chip {
  position: relative;
  min-height: 30px;
  padding: 0 var(--space-3);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--paper-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--ink-tertiary);
  font-family: var(--font-body);
  font-size: 0.64rem;
  white-space: nowrap;
  cursor: pointer;
  /* тихая реакция прибора: цвет, подложка и кромка */
  transition:
    color var(--motion-hover),
    background-color var(--motion-hover),
    border-color var(--motion-hover);
}

.scan__chip::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--rule);
  transition: background-color var(--motion-hover);
}

.scan__chip:hover {
  color: var(--ink);
  border-color: var(--rule);
}

.scan__chip:hover::before {
  background: var(--ink-tertiary);
}

.scan__chip--active {
  color: var(--accent);
  border-color: color-mix(in oklab, var(--accent) 45%, transparent);
  background: color-mix(in oklab, var(--accent) 10%, transparent);
}

.scan__chip--active::before {
  background: var(--accent);
}

.scan__chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* results */
.scan__results {
  overflow-y: auto;
  padding: var(--space-2);
}

.scan__section {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3) var(--space-1);
  font-family: var(--font-body);
  font-size: 0.56rem;
  color: var(--ink-tertiary);
}

.scan__section::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--border-subtle), transparent);
}

.scan__section + .scan-row {
  margin-top: var(--space-1);
}

.scan-row {
  display: grid;
  grid-template-columns: 12px 1fr;
  gap: var(--space-3);
  width: 100%;
  min-height: 44px;
  padding: var(--space-3);
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: inherit;
  cursor: pointer;
  text-align: left;
  /* Длинный список — только тихая реакция наведения: подложка и кромка
     выбранной строки. Никаких трансформаций по строкам. */
  transition:
    background-color var(--motion-hover),
    box-shadow var(--motion-hover);
}

.scan-row:hover {
  background: color-mix(in oklab, var(--ink) 5%, transparent);
}

.scan-row--active {
  background: color-mix(in oklab, var(--accent) 12%, transparent);
  box-shadow: inset 2px 0 0 var(--accent);
}

.scan-row--active:hover {
  background: color-mix(in oklab, var(--accent) 16%, transparent);
}

.scan-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.scan-row__kind {
  position: relative;
  width: 9px;
  height: 9px;
  margin-top: 6px;
}

.scan-row__kind--thread {
  border: 1px solid var(--ink-tertiary);
  border-radius: 2px;
  transform: rotate(45deg);
}

.scan-row__kind--post {
  border: 1px solid var(--ink-tertiary);
  border-radius: 50%;
}

.scan-row--active .scan-row__kind--thread {
  border-color: var(--accent);
}

.scan-row--active .scan-row__kind--post {
  border-color: var(--ink-tertiary);
  background: var(--ink-tertiary);
}

.scan-row__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.scan-row__title {
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--ink);
}

.scan-row__snippet {
  font-size: 0.8rem;
  color: var(--ink-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.scan-row__meta {
  font-family: var(--font-body);
  font-size: 0.64rem;
  color: var(--ink-tertiary);
}

/* notices — an empty scan and a broken one read as the same micro-caption */
.scan__panels {
  display: flex;
  flex-direction: column;
}

.scan__notice {
  margin: 0;
  padding: var(--space-8) var(--space-5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
}

.scan__notice-mark {
  position: relative;
  width: 26px;
  height: 26px;
  border: 1px solid var(--rule);
  border-radius: 50%;
}

.scan__notice-mark::after {
  content: '';
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: var(--ink-tertiary);
}

.scan__notice--error .scan__notice-mark {
  border-color: var(--danger-dim);
}

.scan__notice--error .scan__notice-mark::after {
  background: var(--danger);
}

.scan__notice-text {
  font-size: 0.86rem;
  color: var(--ink-secondary);
}

.scan__notice-hint {
  font-family: var(--font-body);
  font-size: 0.64rem;
  color: var(--ink-tertiary);
}

.scan__hint {
  padding: var(--space-5) var(--space-5) var(--space-6);
}

.scan__hint-title {
  margin: 0 0 var(--space-4);
  font-family: var(--font-body);
  font-size: 0.68rem;
  color: var(--ink-tertiary);
}

.scan__hint-keys {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2) var(--space-4);
}

.scan__hint-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.scan__hint-row dt {
  flex-shrink: 0;
}

.scan__hint-row dd {
  margin: 0;
  font-size: 0.78rem;
  color: var(--ink-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scan kbd,
.scan__hint kbd {
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

.scan__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-body);
  font-size: 0.62rem;
  color: var(--ink-tertiary);
}

.scan__keys {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* visible to assistive tech only */
.scan__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 640px) {
  .scan-backdrop {
    padding: var(--space-3);
  }

  .scan {
    max-height: 88vh;
  }

  .scan__hint-keys {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scan,
  .scan-backdrop {
    animation: none;
  }

  .scan__spinner {
    animation: none;
    border-top-color: var(--rule);
  }

  .scan__chip,
  .scan__chip::before,
  .scan__close,
  .scan-row {
    transition: none;
  }
}
</style>

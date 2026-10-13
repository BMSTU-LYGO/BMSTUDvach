<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { searchNetwork, type SearchPostHit, type SearchResults } from '@/api/search'
import type { ThreadSummary } from '@/types'
import NetworkIcon from '../composer/NetworkIcon.vue'

/**
 * SCAN LENS (NEXT-05) — global network search on Cmd/Ctrl+K.
 *
 * Styled as a diagnostic scanner, not a modal: one input, results as
 * signal rows, keyboard-first. Yields to the Signal Dock's own Command
 * Lens when focus lives inside the dock or any field.
 */

const router = useRouter()
const open = defineModel<boolean>('open', { required: true })

const query = ref('')
const results = ref<SearchResults>({ query: '', threads: [], posts: [] })
const loading = ref(false)
const active = ref(0)

const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

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
    meta: `/${t.board}/ · ${t.reply_count} ${t.reply_count === 1 ? 'ответ' : 'ответов'}`,
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
const empty = computed(() => hasQuery.value && !loading.value && rows.value.length === 0)

// debounce + stale-response guard
let debounce: number | null = null
let requestId = 0

watch(query, (value) => {
  active.value = 0
  if (debounce) window.clearTimeout(debounce)
  if (!value.trim()) {
    results.value = { query: '', threads: [], posts: [] }
    loading.value = false
    return
  }
  loading.value = true
  debounce = window.setTimeout(async () => {
    const id = ++requestId
    try {
      const data = await searchNetwork(value)
      if (id === requestId) results.value = data
    } catch {
      if (id === requestId) results.value = { query: value, threads: [], posts: [] }
    } finally {
      if (id === requestId) loading.value = false
    }
  }, 200)
})

watch(open, async (isOpen) => {
  if (!isOpen) return
  query.value = ''
  results.value = { query: '', threads: [], posts: [] }
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
      <div class="scan" role="dialog" aria-label="Поиск по сети" data-testid="scan-lens">
        <header class="scan__head">
          <span class="scan__kicker">SCAN / NETWORK</span>
          <input
            ref="inputRef"
            v-model="query"
            class="scan__input"
            type="text"
            placeholder="искать сигнал по заголовкам и постам…"
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

        <div v-if="rows.length" ref="listRef" class="scan__results" role="listbox">
          <template v-for="(row, i) in rows" :key="`${row.kind}-${row.id}`">
            <div v-if="i === 0" class="scan__section">ТРЕДЫ</div>
            <div v-if="i === results.threads.length" class="scan__section">ПОСТЫ</div>
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
              <span class="scan-row__kind" aria-hidden="true">
                {{ row.kind === 'thread' ? '◈' : '◆' }}
              </span>
              <span class="scan-row__body">
                <span class="scan-row__title">{{ row.title }}</span>
                <span v-if="row.snippet" class="scan-row__snippet">{{ row.snippet }}</span>
                <span class="scan-row__meta">{{ row.meta }}</span>
              </span>
            </button>
          </template>
        </div>

        <p v-else-if="empty" class="scan__empty">сеть молчит — сигнал не найден</p>
        <p v-else-if="!hasQuery" class="scan__hint">
          <kbd>⌘K</kbd> откроет сканер из любого места · <kbd>↑↓</kbd> навигация ·
          <kbd>↵</kbd> перейти · <kbd>esc</kbd> закрыть
        </p>

        <footer v-if="rows.length" class="scan__foot">
          <span>{{ rows.length }} сигналов</span>
          <span class="scan__foot-keys"><kbd>↵</kbd> перейти · <kbd>esc</kbd> закрыть</span>
        </footer>
      </div>
  </div>
</template>

<style scoped>
.scan-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: oklch(0 0 0 / 0.55);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: center;
  padding: var(--space-6) var(--space-4);
  animation: scan-fade 160ms var(--ease-out-quart);
}

@keyframes scan-fade {
  from {
    opacity: 0;
  }
}

.scan {
  width: min(640px, 100%);
  max-height: min(560px, 80vh);
  display: flex;
  flex-direction: column;
  background: var(--bg-deep);
  border: 1px solid color-mix(in oklab, var(--accent) 30%, transparent);
  border-radius: var(--radius-lg);
  box-shadow: 0 32px 90px oklch(0 0 0 / 0.6);
  overflow: hidden;
  animation: scan-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scan-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
}

.scan__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
}

.scan__kicker {
  font-family: var(--font-display);
  font-size: 0.62rem;
  letter-spacing: 0.2em;
  color: var(--accent);
  flex-shrink: 0;
}

.scan__input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 1rem;
  min-height: 32px;
}

.scan__input::placeholder {
  color: var(--text-muted);
  opacity: 0.7;
}

.scan__spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid var(--border-medium);
  border-top-color: var(--accent);
  animation: scan-spin 700ms linear infinite;
}

@keyframes scan-spin {
  to {
    transform: rotate(360deg);
  }
}

.scan__close {
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.scan__close:hover {
  color: var(--text-primary);
}

.scan__results {
  overflow-y: auto;
  padding: var(--space-2);
}

.scan__section {
  font-family: var(--font-display);
  font-size: 0.58rem;
  letter-spacing: 0.2em;
  color: var(--text-muted);
  padding: var(--space-2) var(--space-3) var(--space-1);
}

.scan-row {
  display: flex;
  align-items: flex-start;
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
}

.scan-row--active {
  background: color-mix(in oklab, var(--accent) 10%, transparent);
  box-shadow: inset 2px 0 0 var(--accent);
}

.scan-row__kind {
  font-family: var(--font-display);
  color: var(--accent-dim);
  flex-shrink: 0;
  line-height: 1.4;
}

.scan-row__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.scan-row__title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.scan-row__snippet {
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.scan-row__meta {
  font-family: var(--font-display);
  font-size: 0.66rem;
  color: var(--text-muted);
}

.scan__empty,
.scan__hint {
  margin: 0;
  padding: var(--space-6) var(--space-5);
  text-align: center;
  font-size: 0.84rem;
  color: var(--text-muted);
}

.scan__hint kbd {
  font-family: var(--font-display);
  font-size: 0.68rem;
  border: 1px solid var(--border-medium);
  border-radius: 4px;
  padding: 1px 5px;
}

.scan__foot {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-5);
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-display);
  font-size: 0.64rem;
  color: var(--text-muted);
}

.scan__foot kbd {
  border: 1px solid var(--border-medium);
  border-radius: 4px;
  padding: 0 4px;
}

@media (prefers-reduced-motion: reduce) {
  .scan,
  .scan-backdrop {
    animation: none;
  }

  .scan__spinner {
    animation: none;
    border-top-color: var(--border-medium);
  }
}
</style>

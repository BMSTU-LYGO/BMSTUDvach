<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { discardDraft, listDrafts, type DraftSummary } from '@/composables/useDraft'
import NetworkIcon from './NetworkIcon.vue'

/**
 * DraftsPanel (DRAFTS-01).
 *
 * Signal Dock buffers live in localStorage under `draft:signal-<id>`, so
 * until now they were invisible until you reopened the thread. This panel
 * surfaces every unfinished signal on the home page with a preview, the
 * thread it belongs to and an honest "saved N ago" stamp.
 *
 * The list is a snapshot: on mount, on cross-tab `storage` changes and on
 * an explicit refresh. No background polling.
 */

const drafts = ref<DraftSummary[]>([])

function refresh() {
  drafts.value = listDrafts()
}

function removeDraft(key: string) {
  discardDraft(key)
  refresh()
}

function preview(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim()
  if (!text) return 'без текста'
  return text.length > 80 ? `${text.slice(0, 80).trimEnd()}…` : text
}

function ago(ts: number): string {
  if (!ts) return 'дата неизвестна'
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (seconds < 60) return `${seconds} сек назад`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  return `${Math.floor(hours / 24)} дн назад`
}

function filesLabel(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  let word = 'файлов'
  if (mod10 === 1 && mod100 !== 11) word = 'файл'
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'файла'
  return `${count} ${word}`
}

onMounted(() => {
  refresh()
  window.addEventListener('storage', refresh)
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', refresh)
})
</script>

<template>
  <section
    v-if="drafts.length"
    class="drafts"
    aria-label="Незаконченные сигналы"
    data-testid="drafts-panel"
  >
    <div class="drafts__head">
      <h2 class="drafts__title">НЕЗАКОНЧЕННЫЕ СИГНАЛЫ</h2>
      <button
        type="button"
        class="drafts__refresh"
        aria-label="Обновить список черновиков"
        @click="refresh"
      >
        обновить
      </button>
    </div>

    <ul class="drafts__list">
      <li
        v-for="draft in drafts"
        :key="draft.key"
        class="drafts__row"
        :data-testid="`draft-row-${draft.threadId}`"
      >
        <div class="drafts__main">
          <p class="drafts__preview">{{ preview(draft.body) }}</p>
          <p class="drafts__meta">
            <span class="drafts__thread">#{{ draft.threadId }}</span>
            <span v-if="draft.filesCount > 0" class="drafts__files">
              {{ filesLabel(draft.filesCount) }}
            </span>
            <span class="drafts__time">{{ ago(draft.savedAt) }}</span>
          </p>
        </div>

        <RouterLink :to="`/threads/${draft.threadId}`" class="drafts__resume">
          продолжить
        </RouterLink>

        <button
          type="button"
          class="drafts__delete"
          aria-label="Удалить черновик"
          @click="removeDraft(draft.key)"
        >
          <NetworkIcon name="close" :size="14" :stroke-width="2" />
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.drafts {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  padding: var(--space-4);
}

.drafts__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.drafts__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--text-muted);
}

.drafts__refresh {
  margin-left: auto;
  min-height: 44px;
  padding: 0 var(--space-3);
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart);
}

.drafts__refresh:hover {
  color: var(--accent);
  border-color: var(--border-accent);
}

.drafts__refresh:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.drafts__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.drafts__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.drafts__row + .drafts__row {
  border-top: 1px solid var(--border-subtle);
}

.drafts__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-2) 0;
}

.drafts__preview {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drafts__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.drafts__thread {
  color: var(--accent-dim);
  font-weight: 600;
}

.drafts__files {
  color: var(--text-secondary);
}

.drafts__time {
  color: var(--text-muted);
}

.drafts__resume {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--space-2);
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px dotted var(--border-accent);
  transition:
    color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart);
}

.drafts__resume:hover {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.drafts__resume:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.drafts__delete {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  background: none;
  border: none;
  border-radius: 50%;
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out-quart);
}

.drafts__delete:hover {
  color: var(--danger);
}

.drafts__delete:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-width: 560px) {
  .drafts__preview {
    white-space: normal;
  }
}

@media (prefers-reduced-motion: reduce) {
  .drafts__refresh,
  .drafts__resume,
  .drafts__delete {
    transition: none;
  }
}
</style>

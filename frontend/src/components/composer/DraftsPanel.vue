<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  discardDraft,
  listDrafts,
  type DraftKind,
  type DraftSummary,
} from '@/composables/useDraft'
import NetworkIcon from './NetworkIcon.vue'

/**
 * DraftsPanel (DRAFTS-01, widened by P2-T3).
 *
 * Every composer buffers into localStorage, and until now only the Signal
 * Dock's buffers had a way back to the surface that owns them. This panel
 * lists all three on the home page — a reply («ответ в треде #7»), an
 * unlaunched thread («новый тред /bauman/») and a report («жалоба на пост
 * #42») — each with a preview and an honest «N назад» stamp.
 *
 * Two honesty rules shape the rows:
 *  - a launch buffer links to its board with `?launch=1`, and the board
 *    reopens the Launch Bay with the buffered text (BoardView);
 *  - a report key names the post but not its thread, so a report row gets
 *    no resume link at all — only the discard. No phantom navigation: the
 *    Report Probe restores its own buffer the moment it is opened again.
 *
 * The list is a snapshot: on mount, on cross-tab `storage` changes and on
 * an explicit refresh. No background polling.
 */

/** One row as the template needs it: label and link decided once, here. */
interface DraftRow {
  key: string
  kind: DraftKind
  testId: string
  /** What this buffer actually is. */
  label: string
  preview: string
  filesCount: number
  savedAt: number
  /** Where «продолжить» leads. Reports have none — see the note above. */
  resume?: string
}

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

function toRow(draft: DraftSummary): DraftRow {
  if (draft.kind === 'launch') {
    // `listDrafts` read the slug out of the key, so it is always there
    const slug = draft.boardSlug ?? ''
    return {
      key: draft.key,
      kind: draft.kind,
      testId: `draft-row-launch-${slug}`,
      label: `новый тред /${slug}/`,
      // the title is what a thread is announced by; the opener is the
      // fallback while the title is still empty
      preview: preview(draft.title || draft.body),
      filesCount: draft.filesCount,
      savedAt: draft.savedAt,
      resume: `/boards/${slug}?launch=1`,
    }
  }

  if (draft.kind === 'report') {
    const postId = draft.postId ?? 0
    return {
      key: draft.key,
      kind: draft.kind,
      testId: `draft-row-report-${postId}`,
      label: `жалоба на пост #${postId}`,
      preview: preview(draft.body),
      filesCount: draft.filesCount,
      savedAt: draft.savedAt,
    }
  }

  const threadId = draft.threadId ?? 0
  return {
    key: draft.key,
    kind: draft.kind,
    // signal rows keep the DRAFTS-01 test id the panel has always had
    testId: `draft-row-${threadId}`,
    label: `ответ в треде #${threadId}`,
    preview: preview(draft.body),
    filesCount: draft.filesCount,
    savedAt: draft.savedAt,
    resume: `/threads/${threadId}`,
  }
}

const rows = computed<DraftRow[]>(() => drafts.value.map(toRow))

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
    v-if="rows.length"
    class="drafts"
    aria-label="Незаконченные черновики"
    data-testid="drafts-panel"
  >
    <div class="drafts__head">
      <h2 class="drafts__title">ЧЕРНОВИКИ</h2>
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
        v-for="row in rows"
        :key="row.key"
        class="drafts__row"
        :data-testid="row.testId"
      >
        <div class="drafts__main">
          <p class="drafts__preview">{{ row.preview }}</p>
          <p class="drafts__meta">
            <span class="drafts__subject">{{ row.label }}</span>
            <span v-if="row.filesCount > 0" class="drafts__files">
              {{ filesLabel(row.filesCount) }}
            </span>
            <span class="drafts__time">{{ ago(row.savedAt) }}</span>
          </p>
        </div>

        <!-- a report has nowhere to resume to: the buffer opens with its
             own probe, so the row keeps only its discard -->
        <RouterLink v-if="row.resume" :to="row.resume" class="drafts__resume">
          продолжить
        </RouterLink>

        <button
          type="button"
          class="drafts__delete"
          aria-label="Удалить черновик"
          @click="removeDraft(row.key)"
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

.drafts__subject {
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

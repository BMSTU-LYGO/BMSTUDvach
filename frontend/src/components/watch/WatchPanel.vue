<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getThread } from '@/api/threads'
import { apiErrorMessage } from '@/api/client'
import { useWatchlist } from '@/composables/useWatchlist'
import NetworkIcon from '../composer/NetworkIcon.vue'

/**
 * WATCHLIST panel (NEXT-08) — the nodes you track, with honest unread
 * counts: current replies minus what you already read. Watched threads
 * that vanished (404) silently drop out of the list.
 */

interface Row {
  threadId: number
  title: string
  current: number
  seen: number
}

const router = useRouter()
const watch = useWatchlist()

const rows = ref<Row[]>([])
const loading = ref(false)

const unreadTotal = computed(() => rows.value.reduce((sum, r) => sum + Math.max(0, r.current - r.seen), 0))

onMounted(async () => {
  loading.value = true
  try {
    const entries = watch.entries.value
    const results = await Promise.all(
      entries.map(async (entry) => {
        try {
          const thread = await getThread(entry.threadId)
          return {
            threadId: entry.threadId,
            title: entry.title,
            current: thread.reply_count,
            seen: entry.seenReplies,
          } satisfies Row
        } catch {
          return null
        }
      }),
    )
    const alive = results.filter((r): r is Row => r !== null)
    // threads that vanished or 404 — drop from the watchlist
    for (const entry of entries) {
      if (!alive.some((r) => r.threadId === entry.threadId)) {
        watch.untrack(entry.threadId)
      }
    }
    rows.value = alive
  } catch (err) {
    // panel is auxiliary — never block the page for it
    console.warn('watchlist resolve failed:', apiErrorMessage(err, ''))
  } finally {
    loading.value = false
  }
})

function open(threadId: number) {
  watch.markSeen(threadId, rows.value.find((r) => r.threadId === threadId)?.current ?? 0)
  void router.push(`/threads/${threadId}`)
}

</script>

<template>
  <section v-if="watch.entries.value.length || rows.length" class="watch" data-testid="watch-panel">
    <div class="watch__head">
      <h2 class="watch__title">ОТСЛЕЖИВАЕМЫЕ УЗЛЫ</h2>
      <span v-if="unreadTotal > 0" class="watch__badge" data-testid="watch-unread">
        {{ unreadTotal }} новых
      </span>
    </div>

    <p v-if="loading" class="watch__loading">сверяем сигналы…</p>
    <ul v-else class="watch__list">
      <li v-for="row in rows" :key="row.threadId" class="watch__row" :data-testid="'watch-row'">
        <RouterLink :to="`/threads/${row.threadId}`" class="watch__link" @click="open(row.threadId)">
          <span class="watch__name">{{ row.title }}</span>
          <span class="watch__meta">
            <span class="watch__count">{{ row.current }}</span>
            ответов
            <span v-if="row.current - row.seen > 0" class="watch__unread">
              +{{ row.current - row.seen }}
            </span>
          </span>
        </RouterLink>
        <button
          type="button"
          class="watch__off"
          aria-label="Больше не отслеживать"
          @click="watch.untrack(row.threadId)"
        >
          <NetworkIcon name="close" :size="12" :stroke-width="2" />
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.watch {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  padding: var(--space-4);
}

.watch__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.watch__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  color: var(--text-muted);
}

.watch__badge {
  margin-left: auto;
  font-family: var(--font-display);
  font-size: 0.68rem;
  color: var(--accent);
  border: 1px solid color-mix(in oklab, var(--accent) 45%, transparent);
  border-radius: 999px;
  padding: 2px 10px;
}

.watch__loading {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.watch__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.watch__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.watch__row + .watch__row {
  border-top: 1px solid var(--border-subtle);
}

.watch__link {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 44px;
  text-decoration: none;
  color: inherit;
}

.watch__name {
  font-size: 0.9rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.watch__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display);
  font-size: 0.68rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.watch__count {
  color: var(--accent-dim);
  font-weight: 600;
}

.watch__unread {
  color: var(--accent);
}

.watch__off {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.watch__off:hover {
  color: var(--danger);
}
</style>

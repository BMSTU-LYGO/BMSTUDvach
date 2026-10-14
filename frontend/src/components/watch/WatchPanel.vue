<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getThread } from '@/api/threads'
import { apiErrorMessage } from '@/api/client'
import { useWatchlist } from '@/composables/useWatchlist'
import NetworkIcon from '../composer/NetworkIcon.vue'

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
    for (const entry of entries) {
      if (!alive.some((r) => r.threadId === entry.threadId)) {
        watch.untrack(entry.threadId)
      }
    }
    rows.value = alive
  } catch (err) {
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
      <h2 class="watch__title">Отслеживаемые треды</h2>
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
  --paper-raised: #EAE4D4;
  --paper-sunken: #F7F3E8;
  --ink: #1C1A14;
  --ink-secondary: #5B5547;
  --ink-tertiary: #8A8273;
  --rule: #D4CEB8;
  --accent: #2F4F4E;
  --font-display: 'Cormorant Garamond', 'Georgia', serif;
  --font-body: 'Inter', -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --duration-fast: 150ms;
  --ease-out: cubic-bezier(0.33, 1, 0.68, 1);
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;

  border: 1px solid var(--rule);
  border-radius: 0;
  background: var(--paper-raised);
  padding: var(--space-5);
}

.watch__head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--rule);
}

.watch__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--ink);
}

.watch__badge {
  margin-left: auto;
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--accent);
}

.watch__loading {
  margin: 0;
  font-family: var(--font-body);
  font-size: 0.875rem;
  color: var(--ink-tertiary);
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
  transition: background var(--duration-fast) var(--ease-out);
}

.watch__row + .watch__row {
  border-top: 1px solid var(--rule);
}

.watch__row:hover {
  background: var(--paper-sunken);
}

.watch__link {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 44px;
  padding: 0 var(--space-2);
  text-decoration: none;
  color: inherit;
}

.watch__name {
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 400;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.watch__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-body);
  font-size: 0.875rem;
  color: var(--ink-tertiary);
  white-space: nowrap;
}

.watch__count {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink);
}

.watch__unread {
  color: var(--accent);
  font-weight: 500;
}

.watch__off {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--ink-tertiary);
  display: grid;
  place-items: center;
  transition: color var(--duration-fast) var(--ease-out);
}

.watch__off:hover {
  color: var(--danger, #9C2A1F);
}

.watch__off:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>

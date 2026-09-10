<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import GlowBorder from '@/components/ui/GlowBorder.vue'
import CreateThreadForm from '@/components/CreateThreadForm.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useForumStore } from '@/stores/forum'
import { useScrollReveal } from '@/composables/useScrollReveal'
import type { NewThreadInput } from '@/types'

const props = defineProps<{ boardSlug: string }>()

const store = useForumStore()
const sectionRef = ref<HTMLElement | null>(null)

useScrollReveal(sectionRef, '.thread-row')

const creating = ref(false)
const createdError = ref('')
const formKey = ref(0)
const showForm = ref(false)

const threads = computed(() => store.threadList.threads)

onMounted(() => {
  void store.fetchThreads(props.boardSlug)
})

async function handleCreate(input: NewThreadInput) {
  creating.value = true
  createdError.value = ''
  try {
    await store.createThread(props.boardSlug, input)
    formKey.value += 1
    showForm.value = false
    await store.fetchThreads(props.boardSlug)
  } catch (err) {
    createdError.value = err instanceof Error ? err.message : 'Не удалось создать тред.'
  } finally {
    creating.value = false
  }
}

function formatDate(value: string): string {
  const d = new Date(value)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч`
  const days = Math.floor(hours / 24)
  return `${days} д`
}
</script>

<template>
  <section class="board-page">
    <div class="board-header">
      <h1 class="board-title text-mono">/{{ boardSlug }}/</h1>
      <button class="btn btn-primary" @click="showForm = !showForm">
        {{ showForm ? '✕ Закрыть' : '+ Новый тред' }}
      </button>
    </div>

    <Transition name="form-slide">
      <div v-if="showForm" class="form-wrapper">
        <GlowBorder>
          <CreateThreadForm :key="formKey" @submit="handleCreate" />
        </GlowBorder>
      </div>
    </Transition>

    <p v-if="createdError" class="text-danger" data-testid="create-error">
      {{ createdError }}
    </p>

    <LoadingState v-if="store.threadList.loading" />
    <ErrorState
      v-else-if="store.threadList.error"
      :message="store.threadList.error"
      :on-retry="() => store.fetchThreads(props.boardSlug)"
    />
    <EmptyState
      v-else-if="threads.length === 0"
      message="В этом разделе пока нет тредов."
    />
    <div v-else ref="sectionRef" class="threads-list">
      <RouterLink
        v-for="thread in threads"
        :key="thread.id"
        :to="`/threads/${thread.id}`"
        class="thread-row"
      >
        <div class="thread-main">
          <div class="thread-title-row">
            <span v-if="thread.is_pinned" class="thread-pin" title="Закреплён">▲</span>
            <span class="thread-title">{{ thread.title }}</span>
          </div>
          <div class="thread-meta">
            <span class="meta-item">
              <span class="meta-count">{{ thread.reply_count }}</span>
              ответ{{ thread.reply_count === 1 ? '' : thread.reply_count < 5 ? 'а' : 'ов' }}
            </span>
            <span v-if="thread.is_locked" class="meta-lock" title="Закрыт">● закрыт</span>
          </div>
        </div>
        <span class="thread-time">{{ formatDate(thread.bumped_at) }}</span>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.board-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.board-title {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  color: var(--accent);
  margin: 0;
  text-shadow: 0 0 30px var(--accent-glow);
}

/* Form transition */
.form-wrapper {
  margin-bottom: var(--space-2);
}

.form-slide-enter-active {
  transition:
    opacity 0.3s var(--ease-out-quart),
    max-height 0.4s var(--ease-out-expo),
    margin 0.3s;
  overflow: hidden;
}

.form-slide-leave-active {
  transition:
    opacity 0.2s ease-in,
    max-height 0.2s ease-in,
    margin 0.2s;
  overflow: hidden;
}

.form-slide-enter-from,
.form-slide-leave-to {
  opacity: 0;
  max-height: 0;
  margin-bottom: 0;
}

.form-slide-enter-to,
.form-slide-leave-from {
  max-height: 500px;
}

/* Thread list */
.threads-list {
  display: flex;
  flex-direction: column;
}

.thread-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
  text-decoration: none;
  color: inherit;
  transition:
    background var(--duration-fast) var(--ease-out-quart),
    transform var(--duration-fast) var(--ease-out-quart);
}

.thread-row:hover {
  background: var(--bg-surface);
  transform: translateX(4px);
}

.thread-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.thread-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.thread-title-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.thread-pin {
  color: var(--accent);
  font-size: 0.7rem;
  flex-shrink: 0;
}

.thread-title {
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: 0.8rem;
  color: var(--text-muted);
}

.meta-count {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--accent-dim);
}

.meta-lock {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.thread-time {
  font-family: var(--font-display);
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .thread-row {
    padding: var(--space-3) var(--space-4);
  }

  .thread-time {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .thread-row:hover {
    transform: none;
  }
}
</style>

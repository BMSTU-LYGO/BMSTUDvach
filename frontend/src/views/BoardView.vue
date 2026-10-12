<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'

import LaunchBay from '@/components/launch/LaunchBay.vue'
import NetworkIcon from '@/components/composer/NetworkIcon.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useForumStore } from '@/stores/forum'
import { useScrollReveal } from '@/composables/useScrollReveal'
import { captureMorph, playMorph } from '@/composables/usePageMorph'
import { useSound } from '@/composables/useSound'
import { emitSceneEvent } from '@/three/sceneState'
import type { NewThreadInput } from '@/types'

const props = defineProps<{ boardSlug: string }>()

const store = useForumStore()
const sectionRef = ref<HTMLElement | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const launchBtnRef = ref<HTMLElement | null>(null)
const bayRef = ref<InstanceType<typeof LaunchBay> | null>(null)

useScrollReveal(sectionRef, '.thread-row')

const { sounds } = useSound()

const creating = ref(false)
const createdError = ref('')
const createSuccessToken = ref(0)
const launchOpen = ref(false)

const threads = computed(() => store.threadList.threads)

onMounted(async () => {
  await nextTick()
  playMorph(titleRef.value, `board:${props.boardSlug}`)
  void store.fetchThreads(props.boardSlug)
})

// "+ Новый тред" morphs into the Launch Bay stage (SIGNAL-13).
async function openLaunchBay() {
  if (launchOpen.value) return
  captureMorph(launchBtnRef.value, 'launch-bay')
  launchOpen.value = true
  await nextTick()
  playMorph(bayRef.value?.$el ?? null, 'launch-bay', { duration: 0.45 })
}

function closeLaunchBay() {
  launchOpen.value = false
}

function onBayDone() {
  launchOpen.value = false
}

async function handleCreate(input: NewThreadInput) {
  creating.value = true
  createdError.value = ''
  try {
    await store.createThread(props.boardSlug, input)
    createSuccessToken.value++
    await store.fetchThreads(props.boardSlug)
    sounds.submit()
    // Spatial feedback: the board cluster answers the launch.
    emitSceneEvent({ type: 'pulse', target: props.boardSlug })
    // failure keeps the bay open with title/body/files/draft intact
  } catch (err) {
    createdError.value = err instanceof Error ? err.message : 'Не удалось создать тред.'
    sounds.error()
  } finally {
    creating.value = false
  }
}

function captureRow(event: MouseEvent, threadId: number) {
  captureMorph(event.currentTarget as HTMLElement, `thread:${threadId}`)
  sounds.click()
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
      <h1 ref="titleRef" class="board-title text-mono">/{{ boardSlug }}/</h1>
      <button ref="launchBtnRef" type="button" class="launch-trigger" @click="openLaunchBay">
        <NetworkIcon name="transmit" :size="16" />
        <span class="launch-trigger__label">Новый тред</span>
      </button>
    </div>

    <LaunchBay
      v-if="launchOpen"
      ref="bayRef"
      :board-slug="props.boardSlug"
      :submitting="creating"
      :submit-error="createdError"
      :success-token="createSuccessToken"
      @submit="handleCreate"
      @close="closeLaunchBay"
      @done="onBayDone"
    />

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
    <div
      v-else
      ref="sectionRef"
      class="threads-list"
      :class="{ 'threads-list--staged': launchOpen }"
    >
      <RouterLink
        v-for="thread in threads"
        :key="thread.id"
        :to="`/threads/${thread.id}`"
        class="thread-row"
        @click="captureRow($event, thread.id)"
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

/* Launch trigger — node, not a generic primary button */
.launch-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0 var(--space-4);
  background: none;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  color: var(--accent);
  cursor: pointer;
  font-family: var(--font-display);
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  transition:
    border-color var(--duration-fast),
    background var(--duration-fast),
    box-shadow var(--duration-normal) var(--ease-out-quart);
}

.launch-trigger:hover {
  border-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 8%, transparent);
  box-shadow: 0 0 24px color-mix(in oklab, var(--accent) 18%, transparent);
}

.launch-trigger__label {
  color: var(--text-primary);
}

/* while the Launch Bay owns the stage the list recedes */
.threads-list--staged {
  transform: scale(0.97);
  filter: blur(2px);
  opacity: 0.55;
  pointer-events: none;
  transition:
    transform 350ms var(--ease-out-quart),
    filter 350ms var(--ease-out-quart),
    opacity 350ms var(--ease-out-quart);
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

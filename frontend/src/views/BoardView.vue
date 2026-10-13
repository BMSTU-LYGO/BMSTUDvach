<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'

import LaunchBay from '@/components/launch/LaunchBay.vue'
import LoadMoreNode from '@/components/thread/LoadMoreNode.vue'
import ThreadRow from '@/components/thread/ThreadRow.vue'
import CatalogCard from '@/components/thread/CatalogCard.vue'
import SortLens from '@/components/thread/SortLens.vue'
import NetworkIcon from '@/components/composer/NetworkIcon.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useForumStore } from '@/stores/forum'
import { useScrollReveal } from '@/composables/useScrollReveal'
import { captureMorph, playMorph } from '@/composables/usePageMorph'
import { useSound } from '@/composables/useSound'
import { emitSceneEvent } from '@/three/sceneState'
import { apiErrorMessage } from '@/api/client'
import type { ThreadOrder } from '@/api/threads'
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

// board view: signal rows (list) or cluster nodes (catalog)
type ViewMode = 'list' | 'catalog'
const VIEW_KEY = 'board-view-mode'
const viewMode = ref<ViewMode>(
  (localStorage.getItem(VIEW_KEY) as ViewMode) || 'list',
)

function setViewMode(mode: ViewMode) {
  viewMode.value = mode
  localStorage.setItem(VIEW_KEY, mode)
}

// thread order — persisted like the view mode, a change is a plain refetch
const ORDER_KEY = 'board-thread-order'
const threadOrder = ref<ThreadOrder>(
  (localStorage.getItem(ORDER_KEY) as ThreadOrder) || 'bump',
)

function setThreadOrder(order: ThreadOrder) {
  if (order === threadOrder.value) return
  threadOrder.value = order
  localStorage.setItem(ORDER_KEY, order)
  reloadThreads()
}

function reloadThreads() {
  void store.fetchThreads(props.boardSlug, threadOrder.value)
}

// page-by-page feed: the node sits under the rows only while a list exists
function loadMore() {
  void store.loadMoreThreads(props.boardSlug, threadOrder.value)
}

const threads = computed(() => store.threadList.threads)

const showLoadMore = computed(
  () =>
    !store.threadList.loading &&
    !store.threadList.error &&
    threads.value.length > 0,
)

onMounted(async () => {
  await nextTick()
  playMorph(titleRef.value, `board:${props.boardSlug}`)
  void store.fetchThreads(props.boardSlug, threadOrder.value)
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
    await store.fetchThreads(props.boardSlug, threadOrder.value)
    sounds.submit()
    // Spatial feedback: the board cluster answers the launch.
    emitSceneEvent({ type: 'thread-launch', target: props.boardSlug })
    // failure keeps the bay open with title/body/files/draft intact
  } catch (err) {
    createdError.value = apiErrorMessage(err, 'Не удалось создать тред.')
    sounds.error()
  } finally {
    creating.value = false
  }
}

function captureRow(event: MouseEvent, threadId: number) {
  captureMorph(event.currentTarget as HTMLElement, `thread:${threadId}`)
  sounds.click()
}
</script>

<template>
  <section class="board-page">
    <div class="board-header">
      <h1 ref="titleRef" class="board-title text-mono">/{{ boardSlug }}/</h1>
      <div class="board-header__actions">
        <SortLens :model-value="threadOrder" @change="setThreadOrder" />
        <div class="view-switch" role="group" aria-label="Вид разделы">
          <button
            type="button"
            class="view-switch__btn"
            :class="{ 'view-switch__btn--active': viewMode === 'list' }"
            aria-label="Список тредов"
            :aria-pressed="viewMode === 'list'"
            @click="setViewMode('list')"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12M2 8h12M2 13h12"/></svg>
          </button>
          <button
            type="button"
            class="view-switch__btn"
            :class="{ 'view-switch__btn--active': viewMode === 'catalog' }"
            aria-label="Каталог узлов"
            :aria-pressed="viewMode === 'catalog'"
            @click="setViewMode('catalog')"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/></svg>
          </button>
        </div>
        <button ref="launchBtnRef" type="button" class="launch-trigger" @click="openLaunchBay">
          <NetworkIcon name="transmit" :size="16" />
          <span class="launch-trigger__label">Новый тред</span>
        </button>
      </div>
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
      :on-retry="reloadThreads"
    />
    <EmptyState
      v-else-if="threads.length === 0"
      message="В этом разделе пока нет тредов."
    />
    <div
      v-else
      ref="sectionRef"
      :class="viewMode === 'catalog' ? 'catalog-grid' : 'threads-list'"
      :data-staged="launchOpen"
    >
      <template v-if="viewMode === 'catalog'">
        <CatalogCard
          v-for="thread in threads"
          :key="thread.id"
          :thread="thread"
          @open="captureRow"
        />
      </template>
      <template v-else>
        <ThreadRow
          v-for="thread in threads"
          :key="thread.id"
          :thread="thread"
          @open="captureRow"
        />
      </template>
    </div>
    <LoadMoreNode
      v-if="showLoadMore"
      :has-more="store.threadList.hasMore"
      :loading="store.threadList.loadingMore"
      @load-more="loadMore"
    />
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
.threads-list--staged,
.threads-list[data-staged='true'],
.catalog-grid[data-staged='true'] {
  transform: scale(0.97);
  filter: blur(2px);
  opacity: 0.55;
  pointer-events: none;
  transition:
    transform 350ms var(--ease-out-quart),
    filter 350ms var(--ease-out-quart),
    opacity 350ms var(--ease-out-quart);
}

.board-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

/* segmented view switch — instrumentation, not a pill group */
.view-switch {
  display: inline-flex;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.view-switch__btn {
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 160ms, background 160ms;
}

.view-switch__btn:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
}

.view-switch__btn--active {
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 10%, transparent);
}

/* catalog = cluster of nodes */
.catalog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-4);
}

/* Thread list */
.threads-list {
  display: flex;
  flex-direction: column;
}

@media (prefers-reduced-motion: reduce) {
  .thread-row:hover {
    transform: none;
  }
}
</style>

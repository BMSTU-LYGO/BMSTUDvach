<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'

import LaunchBay from '@/components/launch/LaunchBay.vue'
import LoadMoreNode from '@/components/thread/LoadMoreNode.vue'
import ThreadRow from '@/components/thread/ThreadRow.vue'
import CatalogCard from '@/components/thread/CatalogCard.vue'
import SortLens from '@/components/thread/SortLens.vue'
import HiddenThreadsChip from '@/components/thread/HiddenThreadsChip.vue'
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
import { getBoard } from '@/api/boards'
import type { ThreadOrder } from '@/api/threads'
import type { Board, NewThreadInput } from '@/types'

const props = defineProps<{ boardSlug: string }>()

const store = useForumStore()
const sectionRef = ref<HTMLElement | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const launchBtnRef = ref<HTMLElement | null>(null)
const bayRef = ref<InstanceType<typeof LaunchBay> | null>(null)

// board rules — a short imageboard-style notice under the /slug/ title
const board = ref<Board | null>(null)
const rulesText = computed(() => board.value?.rules?.trim() ?? '')
const showRules = computed(() => rulesText.value.length > 0)

const RULES_COLLAPSE_LINES = 3
const RULES_COLLAPSE_LENGTH = 220
const rulesExpanded = ref(false)
const rulesCollapsible = computed(
  () =>
    rulesText.value.split('\n').length > RULES_COLLAPSE_LINES ||
    rulesText.value.length > RULES_COLLAPSE_LENGTH,
)

async function loadBoard() {
  try {
    board.value = await getBoard(props.boardSlug)
  } catch {
    // rules are an enhancement — a failed fetch simply hides the block
    board.value = null
  }
}

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
  void loadBoard()
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
      <h1 ref="titleRef" class="board-title">/{{ boardSlug }}/</h1>
      <div class="board-header__actions">
        <SortLens :model-value="threadOrder" @change="setThreadOrder" />
        <HiddenThreadsChip />
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

    <div v-if="showRules" class="board-rules" data-testid="board-rules">
      <div class="board-rules__head">
        <span class="board-rules__label">Правила раздела</span>
        <button
          v-if="rulesCollapsible"
          type="button"
          class="board-rules__toggle"
          data-testid="board-rules-toggle"
          aria-controls="board-rules-text"
          :aria-expanded="rulesExpanded"
          @click="rulesExpanded = !rulesExpanded"
        >
          {{ rulesExpanded ? 'свернуть' : 'показать' }}
        </button>
      </div>
      <p
        id="board-rules-text"
        class="board-rules__text"
        :class="{ 'board-rules__text--clamped': rulesCollapsible && !rulesExpanded }"
      >
        {{ rulesText }}
      </p>
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
  background: var(--paper);
  color: var(--ink);
}

.board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--rule);
}

.board-title {
  font-family: var(--font-display);
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 600;
  line-height: 1.3;
  color: var(--ink);
  margin: 0;
}

.board-rules {
  border: 1px solid var(--rule);
  border-radius: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--paper-raised);
}

.board-rules__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.board-rules__label {
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ink-secondary);
}

.board-rules__toggle {
  background: none;
  border: none;
  padding: 0;
  color: var(--ink-tertiary);
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 0.875rem;
  transition: color var(--duration-fast) var(--ease-out);
}

.board-rules__toggle:hover {
  color: var(--accent);
}

.board-rules__text {
  margin: 0;
  color: var(--ink-secondary);
  font-size: 0.875rem;
  line-height: 1.6;
  white-space: pre-line;
}

.board-rules__text--clamped {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.launch-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0 var(--space-4);
  background: transparent;
  border: 1px solid var(--rule);
  border-radius: 0;
  color: var(--accent);
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 0.875rem;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}

.launch-trigger:hover {
  border-color: var(--accent);
  background: var(--paper-sunken);
}

.launch-trigger__label {
  color: var(--ink);
}

.threads-list[data-staged='true'],
.catalog-grid[data-staged='true'] {
  opacity: 0.5;
  pointer-events: none;
  transition: opacity var(--duration-normal) var(--ease-out);
}

.board-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.view-switch {
  display: inline-flex;
  border: 1px solid var(--rule);
  border-radius: 0;
  overflow: hidden;
}

.view-switch__btn {
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  background: none;
  border: none;
  color: var(--ink-tertiary);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}

.view-switch__btn:hover {
  color: var(--ink);
  background: var(--paper-sunken);
}

.view-switch__btn--active {
  color: var(--accent);
  background: var(--paper-sunken);
}

.catalog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

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

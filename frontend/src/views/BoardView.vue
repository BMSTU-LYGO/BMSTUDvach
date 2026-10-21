<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LaunchBay from '@/components/launch/LaunchBay.vue'
import LoadMoreNode from '@/components/thread/LoadMoreNode.vue'
import ThreadRow from '@/components/thread/ThreadRow.vue'
import CatalogCard from '@/components/thread/CatalogCard.vue'
import RuleSheet from '@/components/thread/RuleSheet.vue'
import ViewCommutator from '@/components/thread/ViewCommutator.vue'
import type { ViewMode } from '@/components/thread/ViewCommutator.vue'
import SortLens from '@/components/thread/SortLens.vue'
import HiddenThreadsChip from '@/components/thread/HiddenThreadsChip.vue'
import NetworkIcon from '@/components/composer/NetworkIcon.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useForumStore } from '@/stores/forum'
import { useScrollReveal } from '@/composables/useScrollReveal'
import { useTransmit } from '@/composables/useTransmit'
import { captureMorph, playMorph } from '@/composables/usePageMorph'
import { useSound } from '@/composables/useSound'
import { emitSceneEvent } from '@/three/sceneState'
import { getBoard } from '@/api/boards'
import type { ThreadOrder } from '@/api/threads'
import type { Board, NewThreadInput } from '@/types'

const props = defineProps<{ boardSlug: string }>()

const route = useRoute()
const router = useRouter()

const store = useForumStore()
const sectionRef = ref<HTMLElement | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const launchBtnRef = ref<HTMLElement | null>(null)
const bayRef = ref<InstanceType<typeof LaunchBay> | null>(null)

// board rules — a margin note the board runs against its own /slug/ title.
// The sheet owns its own opening gesture (P3-T4): the parent only decides
// whether there is a note at all.
const board = ref<Board | null>(null)
const rulesText = computed(() => board.value?.rules?.trim() ?? '')
const showRules = computed(() => rulesText.value.length > 0)

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

// Thread creation runs through the transmit engine (P1-T4): one attempt,
// a classified failure, retry of the very same input. No local error
// strings — `tx.error` is a structured `TransmitError` the bay renders.
const tx = useTransmit<NewThreadInput>()
// Destructured for the template proxy: `tx.error` would hand the ref
// itself to the bay's `:error` prop (see useTransmit's docs).
const { submitting: creating, error: launchError, successToken: launchSuccess } = tx
const launchOpen = ref(false)

// board view: signal rows (list) or cluster nodes (catalog)
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
  // P2-T3: the drafts panel hands a launch buffer over with `?launch=1`.
  // The board mounts and plays its own morph first (the frame above), and
  // only then does the bay take the stage — the sheet is laid down around
  // a board that already exists instead of popping over a blank page.
  if (route.query.launch === '1') {
    await openLaunchBay()
    // The flag is consumed: history-replace it away so a reload or a shared
    // URL does not reopen the bay by itself. Closing the bay does not put
    // it back — the flag was a request, not a state.
    await router.replace({ query: { ...route.query, launch: undefined } })
  }
})

// "+ Новый тред" morphs into the Launch Bay stage (SIGNAL-13).
//
// P3-T2 — shared element, strengthened. «trigger → scene title»: Flip
// captures the button's geometry and plays it into the bay's scene title
// (kicker + /slug/), so the title flies out of the button and lands on the
// sheet; the sheet itself is laid down around it. The trigger steps aside
// for the flight (`launch-trigger--staged`) — the title leaves the button's
// place instead of copying it — and the flip runs before the first paint
// (mounted → nextTick → playMorph), so nothing pops at its resting place.
// `prefers-reduced-motion` (or a missing GSAP) makes playMorph a no-op and
// the sheet is simply there.
const MORPH_DURATION = 0.45

async function openLaunchBay() {
  if (launchOpen.value) return
  captureMorph(launchBtnRef.value, 'launch-bay')
  launchOpen.value = true
  // The bay is a composer surface taking the stage, so it reuses the
  // composer-focus gesture the reply dock already owns: the network core
  // brightens slightly, nothing invented, no dead event bus entry. A
  // dedicated `bay-open` event would need sceneState + NetworkCanvas +
  // network.ts — outside this task's files, so it stays a FOLLOWUPS idea.
  emitSceneEvent({ type: 'composer-focus' })
  await nextTick()
  playMorph(bayRef.value?.sceneTitleElement() ?? null, 'launch-bay', {
    duration: MORPH_DURATION,
  })
}

function closeLaunchBay() {
  if (!launchOpen.value) return
  launchOpen.value = false
  emitSceneEvent({ type: 'composer-blur' })
}

// A successful launch ends the stage exactly like a close does — the scene
// signal is released either way.
function onBayDone() {
  closeLaunchBay()
}

async function handleCreate(input: NewThreadInput) {
  const created = await tx.run(input, (i) => store.createThread(props.boardSlug, i))
  // A refusal is a state, not a branch: the bay stays open with
  // title/body/files/draft intact and `tx.error` explains the failure.
  if (created === undefined) {
    sounds.error()
    return
  }
  await store.fetchThreads(props.boardSlug, threadOrder.value)
  sounds.submit()
  // Spatial feedback: the board cluster answers the launch.
  emitSceneEvent({ type: 'thread-launch', target: props.boardSlug })
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
        <ViewCommutator :model-value="viewMode" @change="setViewMode" />
        <button
          ref="launchBtnRef"
          type="button"
          class="launch-trigger"
          :class="{ 'launch-trigger--staged': launchOpen }"
          :tabindex="launchOpen ? -1 : 0"
          :aria-hidden="launchOpen ? 'true' : undefined"
          @click="openLaunchBay"
        >
          <NetworkIcon name="transmit" :size="16" />
          <span class="launch-trigger__label">Новый тред</span>
        </button>
      </div>
    </div>

    <RuleSheet v-if="showRules" :rules="rulesText" />

    <LaunchBay
      v-if="launchOpen"
      ref="bayRef"
      :board-slug="props.boardSlug"
      :submitting="creating"
      :error="launchError"
      :success-token="launchSuccess"
      @submit="handleCreate"
      @close="closeLaunchBay"
      @done="onBayDone"
      @retry="tx.retry()"
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
      :class="[
        viewMode === 'catalog' ? 'catalog-grid' : 'threads-list',
        { 'board-feed--receded': launchOpen },
      ]"
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

.rule-sheet {
  /* the margin note crowds the /slug/ title it belongs to */
  margin-top: calc(var(--space-4) * -1);
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
    background var(--duration-fast) var(--ease-out),
    opacity var(--duration-fast) var(--ease-out);
}

.launch-trigger:hover {
  border-color: var(--accent);
  background: var(--paper-sunken);
}

.launch-trigger__label {
  color: var(--ink);
}

/* The trigger is the shared element of the bay morph: while the sheet flies
   out of its place the button itself is gone — transparent, unfocusable and
   outside the accessibility tree until the stage is handed back. */
.launch-trigger--staged {
  opacity: 0;
  pointer-events: none;
}

/* P3-T2 — the board recedes while the bay holds the stage. «Отходит»
   instead of «затемняется слоем»: opacity 0.25 + a 1.5% pull-back, no
   filter (blur on a long list is not worth the frames). Nothing behind
   the sheet stays a click/scroll target. */
.board-feed--receded {
  opacity: 0.25;
  transform: scale(0.985);
  transform-origin: 50% 0;
  pointer-events: none;
}

/* The board recedes at the tempo of the bay that takes the stage: the same
   600ms the reveal role carries, but with the curve of an exit — the board
   leaves quickly and dims out, the bay arrives and settles. The duration
   comes from the role, so the two halves of the gesture cannot drift apart. */
.threads-list,
.catalog-grid {
  transition:
    opacity var(--motion-reveal-duration) var(--ease-exit),
    transform var(--motion-reveal-duration) var(--ease-exit);
}

.board-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
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

  /* the board still recedes — it just does not drift */
  .threads-list,
  .catalog-grid {
    transition: none;
  }

  /* the trigger still steps aside — it just does not dissolve */
  .launch-trigger--staged {
    transition: none;
  }
}
</style>

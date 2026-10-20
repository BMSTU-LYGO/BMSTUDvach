<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'

import GenerativeAvatar from '@/components/ui/GenerativeAvatar.vue'
import SignalDock from '@/components/composer/SignalDock.vue'
import ContextFiber, { type FiberLinkState } from '@/components/composer/ContextFiber.vue'
import ReportProbe from '@/components/report/ReportProbe.vue'
import PostBody from '@/components/thread/PostBody.vue'
import PostPreview from '@/components/thread/PostPreview.vue'
import NewPostsDivider from '@/components/thread/NewPostsDivider.vue'
import NetworkIcon from '@/components/composer/NetworkIcon.vue'
import ThreadProgress from '@/components/thread/ThreadProgress.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useForumStore } from '@/stores/forum'
import { playMorph } from '@/composables/usePageMorph'
import { usePostReveal } from '@/composables/usePostReveal'
import { useThreadSeen } from '@/composables/useThreadSeen'
import { useSound } from '@/composables/useSound'
import { collectBacklinks } from '@/composables/usePostLinks'
import { useReadingPosition } from '@/composables/useReadingPosition'
import { useWatchlist } from '@/composables/useWatchlist'
import {
  isEditableTarget,
  isModalOpen,
  useThreadSearch,
} from '@/composables/useThreadSearch'
import { emitSceneEvent } from '@/three/sceneState'
import type { NewPostInput, Post, ReportReason } from '@/types'
import { useTransmit } from '@/composables/useTransmit'

const props = defineProps<{ threadId: number }>()
const store = useForumStore()
const { sounds } = useSound()

/**
 * REPLY and REPORT run on the same transmit engine (TRANSMIT-ENGINE-01):
 * `useTransmit` owns submitting / classified error / successToken and
 * keeps the last attempt, so «повторить» repeats the very same call. The
 * error never reaches this view as a string — `classifyError` already
 * turned it into a `TransmitError` with a Russian `messageRu`.
 */
const replyTx = useTransmit<NewPostInput>()
const { submitting: posting, error: replyError, successToken: postSuccessToken } =
  replyTx

/** One report payload; `useTransmit` keeps it for «повторить». */
interface ReportPayload {
  postId: number
  reason: ReportReason
  comment: string
}

const reportTx = useTransmit<ReportPayload>()
const {
  submitting: reportSubmitting,
  error: reportError,
  successToken: reportSuccessToken,
} = reportTx

const reportNotice = ref('')
const activeReportPostId = ref<number | null>(null)
const replyContext = ref<{ postId: number; source: HTMLElement | null } | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const postsRef = ref<HTMLElement | null>(null)
const dockRef = ref<InstanceType<typeof SignalDock> | null>(null)
const dockEl = ref<HTMLElement | null>(null)

/**
 * REPLY LINK (P3-T1c) — the dock and the ContextFiber are one link, not two
 * decorations. The fiber measures the relationship between the source post
 * and the dock (it is the only piece that knows both ends) and publishes
 * it; the section mirrors it into the shared `--link-*` tokens and hands
 * the same state to the dock, so its leading edge and the fiber's line and
 * edge indicator always speak with one accent.
 */
const linkState = ref<FiberLinkState>('idle')

const linkClasses = computed(() => ({
  'thread-page--linked': linkState.value !== 'idle',
  'thread-page--link-live': linkState.value === 'live',
  'thread-page--link-edge': linkState.value === 'edge',
}))

function onFiberLinkState(state: FiberLinkState) {
  linkState.value = state
}

const watchlist = useWatchlist()
const watched = ref(false)

const route = useRoute()
const readingPosition = useReadingPosition()
/** Подписка на позицию чтения: живёт, пока открыт тред. */
let stopPositionWatch: (() => void) | null = null
/** Позицию возвращаем один раз за монтирование — повторный рендер не должен прыгать. */
let positionRestored = false

// reader state
const previewPost = ref<Post | null>(null)
const previewPos = ref({ x: 0, y: 0 })
const previewVisible = ref(false)
const progress = ref(0)

const postsCount = computed(() => store.thread.thread?.posts.length ?? 0)
usePostReveal(postsRef, postsCount)

// FINDPOST-01: in-thread search + the j/k post cursor.
const threadPosts = computed<Post[]>(() => store.thread.thread?.posts ?? [])
const searchInputRef = ref<HTMLInputElement | null>(null)
const {
  query: searchQuery,
  open: searchOpen,
  matches: searchMatches,
  activePostId: searchActivePostId,
  label: searchLabel,
  openSearch,
  close: closeSearch,
  next: searchNext,
  prev: searchPrev,
  cursorIndex,
  cursorNext,
  cursorPrev,
} = useThreadSearch(threadPosts)

const threadSeen = useThreadSeen()

const threadIdValue = computed(() => store.thread.thread?.id ?? props.threadId)
const seenBoundary = computed(() => threadSeen.lastSeenPostId(threadIdValue.value))
const newPosts = computed(() =>
  threadSeen.newPostsCount(threadIdValue.value, store.thread.thread?.posts ?? []),
)
/** Индекс первого поста за границей прочитанного; -1 — нет записи о посещении. */
const firstNewPostIndex = computed(() => {
  const posts = store.thread.thread?.posts ?? []
  if (seenBoundary.value <= 0) return -1
  return posts.findIndex((post) => post.id > seenBoundary.value)
})
const dividerBeforeIndex = computed(() =>
  newPosts.value > 0 ? firstNewPostIndex.value : -1,
)

function maxPostId(): number {
  const posts = store.thread.thread?.posts ?? []
  return posts.reduce((max, post) => Math.max(max, post.id), 0)
}

const knownIds = computed(
  () => new Set((store.thread.thread?.posts ?? []).map((p) => p.id)),
)
const backlinks = computed(() =>
  store.thread.thread
    ? collectBacklinks(store.thread.thread.posts)
    : new Map<number, number[]>(),
)

onMounted(() => {
  void store.fetchThread(props.threadId)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onWindowKeydown)
  stopPositionWatch = readingPosition.watchPosition(props.threadId)
})

onBeforeUnmount(() => {
  // фиксируем позицию, пока тред ещё в DOM и scrollY не сброшен
  readingPosition.remember(threadIdValue.value, window.scrollY)
  stopPositionWatch?.()
  stopPositionWatch = null
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onWindowKeydown)
  // уходя со страницы, фиксируем максимальный увиденный post-id
  threadSeen.markSeen(threadIdValue.value, maxPostId())
})

// Play the shared-element morph once the title actually renders.
watch(
  () => store.thread.thread,
  async (thread) => {
    if (!thread) return
    await nextTick()
    playMorph(titleRef.value, `thread:${props.threadId}`)
    // the dock only exists once the thread is loaded — re-anchor the fiber
    dockEl.value = dockRef.value?.$el ?? null
    // entering the thread counts as reading it
    watched.value = watchlist.isTracked(props.threadId)
    watchlist.markSeen(props.threadId, thread.reply_count)
    restoreReadingPosition()
  },
)

/**
 * Возвращает читателя туда, где он остановился в прошлый раз. Якорь в URL
 * важнее: тред, открытый ссылкой на пост, скроллит к посту, а не к позиции.
 */
function restoreReadingPosition() {
  if (positionRestored) return
  positionRestored = true
  if (route?.hash || window.location.hash) return
  readingPosition.restore(threadIdValue.value)
}

// --- FINDPOST-01: in-thread search + j/k cursor ---------------------------

function openThreadSearch() {
  openSearch()
  void nextTick(() => searchInputRef.value?.focus())
}

function closeThreadSearch() {
  closeSearch()
}

/** j/k cursor: move focus + outline to a post and bring it into view. */
function focusCursorPost(id: number) {
  const el = document.getElementById(`post-${id}`)
  if (!el) return
  document.querySelectorAll('.post-item--focused').forEach((node) => {
    node.classList.remove('post-item--focused')
  })
  el.classList.add('post-item--focused')
  el.focus({ preventScroll: true })
  el.scrollIntoView({
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
    block: 'center',
  })
}

watch(searchActivePostId, (id) => {
  if (id !== null) navigateToPost(id)
})

watch(cursorIndex, (index) => {
  const post = threadPosts.value[index]
  if (post) focusCursorPost(post.id)
})

function toggleWatch() {
  const thread = store.thread.thread
  if (!thread) return
  watchlist.toggle(props.threadId, thread.title, thread.reply_count)
  watched.value = watchlist.isTracked(props.threadId)
}

async function handlePost(input: NewPostInput) {
  await replyTx.run(input, (i) => store.createPost(props.threadId, i))
  // Refused — the classified `error` already explains why; the typed body
  // stays in the dock, and «повторить» replays this very attempt.
  if (replyError.value) return
  await store.fetchThread(props.threadId)
  // свой ответ тоже прочитан — разделитель пересчитывается по новой границе
  threadSeen.markSeen(threadIdValue.value, maxPostId())
  sounds.submit()
  // Spatial feedback: a signal packet flies through the network core.
  emitSceneEvent({ type: 'reply' })
  // `postSuccessToken` *is* the engine's token — the dock resets on it.
}

async function handleReport(payload: ReportPayload) {
  // a fresh attempt retires the previous report's thank-you
  reportNotice.value = ''
  await reportTx.run(payload, (p) =>
    store.createReport(p.postId, { reason: p.reason, comment: p.comment }),
  )
  // Refused — same contract as the dock: the notice explains, the probe
  // stays open with the reason and the comment, «повторить» replays.
  if (reportError.value) return
  reportNotice.value = 'Жалоба отправлена.'
  sounds.submit()
  // Danger pulse travels back from the probe into the network.
  emitSceneEvent({ type: 'report-submit' })
  // `reportSuccessToken` *is* the engine's token — it tells the probe to
  // close and drop its buffer.
  activeReportPostId.value = null
}

// A refusal is a state, not an exception — but the dock still wants to hear
// it, exactly as it did back when the catch block owned `sounds.error()`.
watch(replyError, (err) => {
  if (err) sounds.error()
})

watch(reportError, (err) => {
  if (err) sounds.error()
})

/**
 * «Повторить» replays the whole submit, not just the API call: a retry that
 * goes through must land the reply in the thread exactly like a fresh one
 * (refetch, seen border, the reply pulse) instead of half-finishing. The
 * input is the attempt `useTransmit` kept, so nothing has to be rebuilt.
 */
function retryReply() {
  const input = replyTx.lastInput.value as NewPostInput | null
  if (input === null) return
  void handlePost(input)
}

function retryReport() {
  const payload = reportTx.lastInput.value as ReportPayload | null
  if (payload === null) return
  void handleReport(payload)
}

function openReport(postId: number) {
  activeReportPostId.value = postId
  // Spatial feedback: a local danger node lights up at the core.
  emitSceneEvent({ type: 'report-open' })
}

/**
 * Подпись автора живёт в шапке поста: отображаемое имя плюс серверный
 * трипкод, чтобы плакатный почерк узнавался между постами без аккаунтов.
 */
function authorLabel(post: Post): string {
  return post.author.trim() || 'Аноним'
}

function hasSignature(post: Post): boolean {
  return Boolean(post.author.trim() || post.tripcode.trim())
}

function formatTime(value: string): string {
  const d = new Date(value)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function handleReply(postId: number, event: Event) {
  const source =
    (event.currentTarget as HTMLElement).closest<HTMLElement>('.post-item') ?? null
  replyContext.value = { postId, source }
}

function locateReplySource() {
  const el = replyContext.value?.source
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el?.classList.add('post-item--located')
  window.setTimeout(() => el?.classList.remove('post-item--located'), 1200)
}

function onDockFocus() {
  emitSceneEvent({ type: 'composer-focus' })
}

function onDockBlur() {
  emitSceneEvent({ type: 'composer-blur' })
}

function clearReplyContext() {
  replyContext.value = null
}

// --- thread reader: post links, previews, progress -------------------------

function navigateToPost(id: number) {
  const el = document.getElementById(`post-${id}`)
  if (!el) return
  el.scrollIntoView({
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
    block: 'center',
  })
  el.classList.add('post-item--linked')
  window.setTimeout(() => el.classList.remove('post-item--linked'), 1600)
  hidePreview()
}

function showPreview(id: number, event: MouseEvent) {
  const post = store.thread.thread?.posts.find((p) => p.id === id)
  if (!post) return
  previewPost.value = post
  previewPos.value = { x: event.clientX, y: event.clientY }
  previewVisible.value = true
}

function hidePreview() {
  previewVisible.value = false
}

function onWindowKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (previewVisible.value) {
      hidePreview()
      return
    }
    if (searchOpen.value) closeThreadSearch()
    return
  }

  // fields, dialogs and the lightbox keep their keys to themselves
  if (isEditableTarget(e.target) || isModalOpen()) return

  const key = e.key.toLowerCase()
  if (key === 'f') {
    e.preventDefault()
    if (searchOpen.value) searchInputRef.value?.focus()
    else openThreadSearch()
    return
  }
  if (key === 'j') {
    e.preventDefault()
    cursorNext()
  } else if (key === 'k') {
    e.preventDefault()
    cursorPrev()
  }
}

function onScroll() {
  const doc = document.documentElement
  const max = doc.scrollHeight - window.innerHeight
  progress.value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
  if (previewVisible.value) hidePreview()
}
</script>

<template>
  <section class="thread-page" :class="linkClasses">
    <ThreadProgress :progress="progress" />

    <!-- P3-T5 — the reading space. A wrapper so that on a wide screen the
         reader can hand its left edge to the dock's gutter: the reply dock
         owns a column of its own and the posts own the column beside it.
         Below the breakpoint the wrapper is `display: contents`, so the page
         keeps the single-column flow it has always had. -->
    <div class="thread-body">
      <div class="thread-breadcrumb">
        <RouterLink to="/" class="breadcrumb-link">Главная</RouterLink>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">{{ store.thread.thread?.board ?? '...' }}</span>
      </div>

      <LoadingState v-if="store.thread.loading" />
      <ErrorState
        v-else-if="store.thread.error"
        :message="store.thread.error"
        :on-retry="() => store.fetchThread(props.threadId)"
      />
      <template v-else-if="store.thread.thread">
        <div class="thread-title-row">
          <h1 ref="titleRef" class="thread-title">{{ store.thread.thread.title }}</h1>
          <button
            type="button"
            class="watch-toggle"
            :class="{ 'watch-toggle--on': watched }"
            :aria-pressed="watched"
            :title="watched ? 'Узел отслеживается — снять' : 'Отслеживать этот узел'"
            data-testid="watch-toggle"
            @click="toggleWatch"
          >
            <span class="watch-toggle__dot" aria-hidden="true"></span>
            {{ watched ? 'отслеживается' : 'отслеживать' }}
          </button>
          <button
            type="button"
            class="thread-search-toggle"
            aria-label="Найти в треде"
            title="Найти в треде (f)"
            data-testid="thread-search-toggle"
            @click="openThreadSearch"
          >
            Найти в треде
          </button>
        </div>

        <div
          v-if="searchOpen"
          class="thread-search"
          role="search"
          data-testid="thread-search"
        >
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="thread-search__input"
            type="search"
            placeholder="Поиск в треде"
            aria-label="Поиск в треде"
            data-testid="thread-search-input"
            @keydown.escape.prevent="closeThreadSearch"
            @keydown.enter.exact.prevent="searchNext"
            @keydown.shift.enter.prevent="searchPrev"
          />
          <span
            class="thread-search__count"
            aria-live="polite"
            data-testid="thread-search-count"
            >{{ searchLabel }}</span
          >
          <button
            type="button"
            class="thread-search__nav"
            aria-label="Предыдущее совпадение"
            :disabled="searchMatches.length === 0"
            data-testid="thread-search-prev"
            @click="searchPrev"
          >
            ‹
          </button>
          <button
            type="button"
            class="thread-search__nav"
            aria-label="Следующее совпадение"
            :disabled="searchMatches.length === 0"
            data-testid="thread-search-next"
            @click="searchNext"
          >
            ›
          </button>
          <button
            type="button"
            class="thread-search__close"
            aria-label="Закрыть поиск"
            data-testid="thread-search-close"
            @click="closeThreadSearch"
          >
            ×
          </button>
        </div>

        <p v-if="store.thread.thread.is_locked" class="thread-locked">● Тред закрыт</p>

        <div
          ref="postsRef"
          class="posts"
          :class="{ 'posts--probing': activeReportPostId !== null }"
        >
          <template v-for="(post, index) in store.thread.thread.posts" :key="post.id">
            <NewPostsDivider v-if="dividerBeforeIndex === index" :count="newPosts" />
            <article
              :id="`post-${post.id}`"
              class="post-item"
              :class="{
                op: post.is_op,
                'post-item--probe': activeReportPostId === post.id,
                'post-item--search-active': post.id === searchActivePostId,
              }"
              tabindex="-1"
              data-testid="post"
            >
              <GenerativeAvatar :seed="post.id" :is-op="post.is_op" />
              <div class="post-content">
                <div class="post-header">
                  <div class="post-meta">
                    <span class="post-id">#{{ post.id }}</span>
                    <span
                      v-if="post.is_op"
                      class="post-op-badge"
                      title="Автор треда"
                      data-testid="post-op-badge"
                      >OP</span
                    >
                    <span
                      v-if="post.sage"
                      class="post-sage"
                      title="Тихий сигнал — не поднимает тред"
                      data-testid="post-sage"
                    >
                      <NetworkIcon name="sage" :size="12" />
                    </span>
                    <span
                      v-if="hasSignature(post)"
                      class="post-author"
                      data-testid="post-author"
                      >{{ authorLabel(post) }}</span
                    >
                    <span
                      v-if="post.tripcode.trim()"
                      class="post-tripcode"
                      data-testid="post-tripcode"
                      >{{ post.tripcode }}</span
                    >
                    <time
                      class="post-time"
                      :datetime="post.created_at"
                      data-testid="post-time"
                      >{{ formatTime(post.created_at) }}</time
                    >
                  </div>
                  <div class="post-actions">
                    <button
                      class="btn-reply"
                      :title="`Ответить на пост #${post.id}`"
                      :aria-label="`Ответить на пост #${post.id}`"
                      @click="handleReply(post.id, $event)"
                    >
                      <NetworkIcon name="reply" :size="13" />
                      <span class="btn-reply__label">Ответить</span>
                    </button>
                    <button
                      class="btn-report"
                      :title="`Пожаловаться на пост #${post.id}`"
                      :aria-label="`Пожаловаться на пост #${post.id}`"
                      @click="openReport(post.id)"
                    >
                      <NetworkIcon name="report" :size="13" />
                    </button>
                  </div>
                </div>
                <PostBody
                  :body="post.body"
                  :known-ids="knownIds"
                  :attachments="post.attachments"
                  :highlight="searchQuery"
                  @navigate="navigateToPost"
                  @preview="showPreview"
                  @preview-leave="hidePreview"
                />

                <div
                  v-if="(backlinks.get(post.id) ?? []).length > 0"
                  class="post-backlinks"
                  data-testid="post-backlinks"
                >
                  <span class="post-backlinks__label">ответы:</span>
                  <a
                    v-for="id in backlinks.get(post.id)!"
                    :key="id"
                    class="post-link"
                    :href="`#post-${id}`"
                    @click.prevent="navigateToPost(id)"
                    >&gt;&gt;{{ id }}</a
                  >
                </div>

                <ReportProbe
                  v-if="activeReportPostId === post.id"
                  :post-id="post.id"
                  :submitting="reportSubmitting"
                  :error="reportError"
                  :success-token="reportSuccessToken"
                  @close="activeReportPostId = null"
                  @submit="(payload) => handleReport({ postId: post.id, ...payload })"
                  @retry="retryReport"
                />
              </div>
            </article>
          </template>
        </div>

        <EmptyState
          v-if="store.thread.thread.posts.length === 0"
          message="Сообщений пока нет."
        />

        <Transition name="fade">
          <p v-if="reportNotice" class="report-notice" data-testid="report-notice">
            {{ reportNotice }}
          </p>
        </Transition>
      </template>
    </div>

    <!-- the dock owns the gutter, so the sheet is never laid over a post -->
    <div v-if="store.thread.thread" class="thread-dock" data-testid="thread-dock">
      <SignalDock
        v-if="!store.thread.thread.is_locked"
        ref="dockRef"
        :thread-id="props.threadId"
        :reply-context="replyContext"
        :link-state="linkState"
        :submitting="posting"
        :error="replyError"
        :success-token="postSuccessToken"
        @submit="handlePost"
        @retry="retryReply"
        @focus="onDockFocus"
        @blur="onDockBlur"
        @clear-context="clearReplyContext"
        @locate-context="locateReplySource"
      />
    </div>

    <ContextFiber
      :source="replyContext?.source ?? null"
      :target="dockEl"
      :label="replyContext ? `#${replyContext.postId}` : ''"
      @link-state="onFiberLinkState"
    />

    <PostPreview
      :post="previewPost"
      :x="previewPos.x"
      :y="previewPos.y"
      :visible="previewVisible"
      @navigate="navigateToPost"
    />
  </section>
</template>

<style scoped>
.thread-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  position: relative;
  background: var(--paper, #F2EDE0);
  /* P3-T1c — the reply link is ONE system. The section owns the shared link
     tokens; the ContextFiber and the dock's leading edge both read them, so
     the line, the edge indicator and the marker always agree. */
  --link-accent: var(--accent);
  --link-state: 0;
  /* P3-T5 — the dock's gutter: a column reserved at the left edge of the
     reader, so the sheet never has to be laid over the posts. It takes only
     what the screen can spare (clamp), the reading column keeps the rest —
     and the reader itself widens by the same gutter (`content--reader` in
     DefaultLayout), so the measure of the reading never pays for the dock. */
  --dock-col: clamp(440px, 34vw, 500px);
  --dock-gap: var(--space-6);
}

.thread-page--link-live {
  --link-state: 1;
}

.thread-page--link-edge {
  --link-state: 0.55;
}

.thread-breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.875rem;
  color: var(--ink-secondary, #5B5547);
}

.breadcrumb-link {
  color: var(--ink-secondary, #5B5547);
  text-decoration: none;
}

.breadcrumb-link:hover {
  color: var(--accent, #2F4F4E);
  text-decoration: underline;
}

.breadcrumb-sep {
  color: var(--rule, #D4CEB8);
}

.breadcrumb-current {
  font-family: var(--font-display, 'Cormorant Garamond', serif);
  color: var(--ink-tertiary, #8A8273);
}

.thread-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.thread-title {
  font-family: var(--font-display, 'Cormorant Garamond', serif);
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 600;
  line-height: 1.3;
  margin: 0;
  color: var(--ink, #1C1A14);
}

.watch-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 var(--space-3);
  background: none;
  border: 1px solid var(--rule, #D4CEB8);
  border-radius: 0;
  color: var(--ink-secondary, #5B5547);
  font-family: var(--font-body, 'Inter', sans-serif);
  font-size: 0.875rem;
  cursor: pointer;
  transition:
    color var(--duration-fast, 150ms),
    border-color var(--duration-fast, 150ms),
    background var(--duration-fast, 150ms);
}

.watch-toggle:hover {
  color: var(--ink, #1C1A14);
  border-color: var(--ink-tertiary, #8A8273);
  background: var(--paper-sunken, #F7F3E8);
}

.watch-toggle__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid currentColor;
}

.watch-toggle--on {
  color: var(--accent, #2F4F4E);
  border-color: var(--accent, #2F4F4E);
}

.watch-toggle--on .watch-toggle__dot {
  background: var(--accent, #2F4F4E);
}

.thread-search-toggle {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--space-4);
  background: none;
  border: 1px solid var(--rule, #D4CEB8);
  border-radius: 0;
  color: var(--ink-secondary, #5B5547);
  font-family: var(--font-body, 'Inter', sans-serif);
  font-size: 0.875rem;
  cursor: pointer;
  transition:
    color var(--duration-fast, 150ms),
    border-color var(--duration-fast, 150ms),
    background var(--duration-fast, 150ms);
}

.thread-search-toggle:hover {
  color: var(--ink, #1C1A14);
  border-color: var(--ink-tertiary, #8A8273);
  background: var(--paper-sunken, #F7F3E8);
}

.thread-search-toggle:focus-visible {
  outline: 2px solid var(--accent, #2F4F4E);
  outline-offset: 2px;
}

.thread-search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  max-width: 520px;
  padding: var(--space-2);
  background: var(--paper-raised, #EAE4D4);
  border: 1px solid var(--rule, #D4CEB8);
  border-radius: 0;
}

.thread-search__input {
  flex: 1;
  min-width: 0;
  min-height: 36px;
  padding: 0 var(--space-3);
  background: var(--paper, #F2EDE0);
  border: 1px solid var(--rule, #D4CEB8);
  border-radius: 0;
  color: var(--ink, #1C1A14);
  font-family: var(--font-body, 'Inter', sans-serif);
  font-size: 0.9rem;
}

.thread-search__input:focus-visible {
  outline: 2px solid var(--accent, #2F4F4E);
  outline-offset: 1px;
  border-color: var(--accent, #2F4F4E);
}

.thread-search__count {
  min-width: 56px;
  text-align: center;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink-secondary, #5B5547);
}

.thread-search__nav,
.thread-search__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  background: none;
  border: 1px solid var(--rule, #D4CEB8);
  border-radius: 0;
  color: var(--ink-secondary, #5B5547);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition:
    color var(--duration-fast, 150ms),
    border-color var(--duration-fast, 150ms),
    background var(--duration-fast, 150ms);
}

.thread-search__nav:hover:not(:disabled),
.thread-search__close:hover {
  color: var(--ink, #1C1A14);
  border-color: var(--ink-tertiary, #8A8273);
  background: var(--paper-sunken, #F7F3E8);
}

.thread-search__nav:disabled {
  opacity: 0.4;
  cursor: default;
}

.thread-search__nav:focus-visible,
.thread-search__close:focus-visible {
  outline: 2px solid var(--accent, #2F4F4E);
  outline-offset: 2px;
}

.thread-locked {
  font-size: 0.875rem;
  color: var(--ink-secondary, #5B5547);
  margin: 0;
}

.posts {
  display: flex;
  flex-direction: column;
}

.posts--probing .post-item:not(.post-item--probe) {
  opacity: 0.45;
  transition: opacity 220ms var(--ease-out-quart);
}

.post-item--probe {
  background: var(--paper-sunken, #F7F3E8);
  box-shadow: inset 2px 0 0 var(--accent, #2F4F4E);
}

.post-item {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-4) 0;
  transition:
    background var(--duration-fast, 150ms) var(--ease-out-quart);
}

/* hairline rule between posts — the last one stands alone */
.post-item:not(:last-child) {
  border-bottom: 1px solid var(--rule, #D4CEB8);
}

.post-item:hover {
  background: var(--paper-sunken, #F7F3E8);
}

.post-item.op {
  background: var(--paper-sunken, #F7F3E8);
  border-left: 2px solid var(--accent, #2F4F4E);
}

.post-content {
  flex: 1;
  min-width: 0;
}

.post-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
}

.post-meta {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-2);
  min-width: 0;
}

.post-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
}

.post-author {
  font-weight: 600;
  color: var(--accent, #2F4F4E);
  font-size: 0.875rem;
}

.post-tripcode {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.75rem;
  color: var(--ink-tertiary, #8A8273);
}

.post-op-badge {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.75rem;
  line-height: 1.4;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 2px;
  background: var(--amber, #d4882a);
  color: #FFFDF7;
}

.post-id {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.875rem;
  color: var(--ink-tertiary, #8A8273);
}

.post-sage {
  display: inline-flex;
  align-items: center;
  color: var(--ink-tertiary, #8A8273);
  opacity: 0.75;
}

.post-time {
  font-size: 0.75rem;
  color: var(--ink-tertiary, #8A8273);
}

.btn-reply {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 2px 6px;
  background: none;
  border: 1px solid var(--rule, #D4CEB8);
  color: var(--accent, #2F4F4E);
  border-radius: 0;
  font-family: var(--font-body, 'Inter', sans-serif);
  font-size: 0.75rem;
  line-height: 1.2;
  font-weight: 500;
  cursor: pointer;
  transition:
    color var(--duration-fast, 150ms),
    border-color var(--duration-fast, 150ms),
    background var(--duration-fast, 150ms);
}

.btn-reply__label {
  white-space: nowrap;
}

.btn-reply:hover {
  color: var(--ink, #1C1A14);
  border-color: var(--ink-tertiary, #8A8273);
  background: var(--paper-sunken, #F7F3E8);
}

.btn-report {
  background: none;
  border: 1px solid var(--rule, #D4CEB8);
  color: var(--ink-tertiary, #8A8273);
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    color var(--duration-fast, 150ms),
    border-color var(--duration-fast, 150ms),
    background var(--duration-fast, 150ms);
}

.btn-report:hover {
  color: var(--danger, #9C2A1F);
  border-color: var(--danger, #9C2A1F);
  background: var(--paper-sunken, #F7F3E8);
}

.post-item {
  scroll-margin-top: 84px;
}

.post-item--linked {
  background: var(--paper-sunken, #F7F3E8);
  box-shadow: inset 2px 0 0 var(--accent, #2F4F4E);
  transition:
    background 220ms var(--ease-out-quart),
    box-shadow 220ms var(--ease-out-quart);
}

.post-item--search-active {
  background: var(--paper-sunken, #F7F3E8);
  box-shadow: inset 2px 0 0 var(--accent, #2F4F4E);
}

.post-item--focused {
  outline: 2px solid var(--accent, #2F4F4E);
  outline-offset: -2px;
  background: var(--paper-sunken, #F7F3E8);
}

.post-backlinks {
  margin-top: var(--space-3);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.post-backlinks__label {
  font-size: 0.875rem;
  color: var(--ink-tertiary, #8A8273);
}

.post-backlinks .post-link {
  color: var(--accent, #2F4F4E);
  text-decoration: none;
  border-bottom: 1px dotted var(--rule, #D4CEB8);
  font-family: var(--font-body, 'Inter', sans-serif);
  font-size: 0.875rem;
}

.post-backlinks .post-link:hover {
  color: var(--accent-hover, #244140);
  text-decoration: underline;
}

.thread-dock {
  position: sticky;
  bottom: var(--space-4);
  z-index: 10;
  margin-top: var(--space-6);
}

/* P3-T5 — the reading space. Below the gutter breakpoint the wrapper is
   transparent: its children stay flex items of `.thread-page` and the page
   keeps the single-column flow (and the dock the bottom bar) it always had.
   At the breakpoint it becomes the reading column of the reader itself. */
.thread-body {
  display: contents;
}

/* ── the dock gutter (P3-T5) ───────────────────────────────────────────────
   On a wide screen the dock is not a strip laid over the reading: it lives in
   a column of its own at the left edge of the reader, and the posts live in
   the column beside it. A grid, so the two can never intersect at any width —
   the gutter is a real track, not an offset the sheet can outrun, and the
   posts never have to reserve room «just in case».

   Inside its gutter the dock stays sticky: it moors to the bottom of the
   viewport while the reader is on screen and settles at the end of the
   thread, exactly where it used to sit in the flow. Nothing about the link
   changes: the fiber still measures the dock's own rect, so its line and the
   sheet's leading edge keep meeting at the same place. */
@media (min-width: 1100px) {
  .thread-page {
    display: grid;
    grid-template-columns: var(--dock-col) minmax(0, 1fr);
    column-gap: var(--dock-gap);
  }

  /* the reading column: the very same stack, now in the second track */
  .thread-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    grid-area: 1 / 2;
    min-width: 0;
    /* the reserved gutter reads as a column, not as a lucky gap */
    border-left: 1px solid var(--rule, #D4CEB8);
  }

  .thread-dock {
    grid-area: 1 / 1;
    align-self: end;
    margin-top: 0;
    margin-right: 0;
    bottom: var(--space-5);
  }
}

/* on a phone the dock is a bottom SHEET: it bleeds to the screen edges and
   keeps its own safe-area inset, instead of floating inside the page gutters */
@media (max-width: 640px) {
  .thread-dock {
    margin: var(--space-4) calc(var(--space-4) * -1) calc(var(--space-8) * -1);
    bottom: 0;
  }
}

.thread-locked-hint {
  font-size: 0.875rem;
  color: var(--ink-secondary, #5B5547);
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--rule, #D4CEB8);
  border-radius: 0;
  text-align: center;
}

.post-item--located {
  background: var(--paper-sunken, #F7F3E8);
  box-shadow: inset 2px 0 0 var(--accent, #2F4F4E);
}

.report-notice {
  font-size: 0.875rem;
  color: var(--success, #2F4F4E);
  margin: 0;
}

.fade-enter-active {
  transition: opacity 0.3s var(--ease-out-quart);
}
.fade-leave-active {
  transition: opacity 0.2s ease-in;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .post-item {
    gap: var(--space-3);
  }

  .post-header {
    gap: var(--space-2);
  }

  .post-actions {
    gap: var(--space-1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .thread-search-toggle,
  .thread-search__nav,
  .thread-search__close {
    transition: none;
  }
}
</style>

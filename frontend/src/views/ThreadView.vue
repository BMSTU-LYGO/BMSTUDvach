<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import GenerativeAvatar from '@/components/ui/GenerativeAvatar.vue'
import SignalDock from '@/components/composer/SignalDock.vue'
import ContextFiber from '@/components/composer/ContextFiber.vue'
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
import { emitSceneEvent } from '@/three/sceneState'
import { apiErrorMessage } from '@/api/client'
import type { NewPostInput, Post, ReportReason } from '@/types'

const props = defineProps<{ threadId: number }>()
const store = useForumStore()
const { sounds } = useSound()

const posting = ref(false)
const postError = ref('')
const postSuccessToken = ref(0)
const reportNotice = ref('')
const reportSubmitting = ref(false)
const reportError = ref('')
const reportSuccessToken = ref(0)
const activeReportPostId = ref<number | null>(null)
const replyContext = ref<{ postId: number; source: HTMLElement | null } | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const postsRef = ref<HTMLElement | null>(null)
const dockRef = ref<InstanceType<typeof SignalDock> | null>(null)
const dockEl = ref<HTMLElement | null>(null)

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
  store.thread.thread ? collectBacklinks(store.thread.thread.posts) : new Map<number, number[]>(),
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

function toggleWatch() {
  const thread = store.thread.thread
  if (!thread) return
  watchlist.toggle(props.threadId, thread.title, thread.reply_count)
  watched.value = watchlist.isTracked(props.threadId)
}

async function handlePost(input: NewPostInput) {
  posting.value = true
  postError.value = ''
  try {
    await store.createPost(props.threadId, input)
    await store.fetchThread(props.threadId)
    // свой ответ тоже прочитан — разделитель пересчитывается по новой границе
    threadSeen.markSeen(threadIdValue.value, maxPostId())
    sounds.submit()
    // Spatial feedback: a signal packet flies through the network core.
    emitSceneEvent({ type: 'reply' })
    // Signal success to the dock — only now may it reset.
    postSuccessToken.value++
  } catch (err) {
    postError.value = apiErrorMessage(err, 'Не удалось отправить ответ.')
    sounds.error()
  } finally {
    posting.value = false
  }
}

async function handleReport(payload: {
  postId: number
  reason: ReportReason
  comment: string
}) {
  reportSubmitting.value = true
  reportError.value = ''
  reportNotice.value = ''
  try {
    await store.createReport(payload.postId, {
      reason: payload.reason,
      comment: payload.comment,
    })
    reportNotice.value = 'Жалоба отправлена.'
    sounds.submit()
    // Danger pulse travels back from the probe into the network.
    emitSceneEvent({ type: 'report-submit' })
    // Signal success to the probe — only now may it close.
    reportSuccessToken.value++
    activeReportPostId.value = null
  } catch (err) {
    reportError.value = apiErrorMessage(err, 'Не удалось отправить жалобу.')
    sounds.error()
  } finally {
    reportSubmitting.value = false
  }
}

function openReport(postId: number) {
  activeReportPostId.value = postId
  // Spatial feedback: a local danger node lights up at the core.
  emitSceneEvent({ type: 'report-open' })
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
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function handleReply(postId: number, event: Event) {
  const source = (event.currentTarget as HTMLElement).closest<HTMLElement>('.post-item') ?? null
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
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
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
  if (e.key === 'Escape') hidePreview()
}

function onScroll() {
  const doc = document.documentElement
  const max = doc.scrollHeight - window.innerHeight
  progress.value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
  if (previewVisible.value) hidePreview()
}
</script>

<template>
  <section class="thread-page">
    <ThreadProgress :progress="progress" />

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
      </div>

      <p v-if="store.thread.thread.is_locked" class="thread-locked">
        ● Тред закрыт
      </p>

      <div ref="postsRef" class="posts" :class="{ 'posts--probing': activeReportPostId !== null }">
        <template v-for="(post, index) in store.thread.thread.posts" :key="post.id">
          <NewPostsDivider v-if="dividerBeforeIndex === index" :count="newPosts" />
          <article
            :id="`post-${post.id}`"
            class="post-item"
            :class="{
              op: post.is_op,
              'post-item--probe': activeReportPostId === post.id,
            }"
            data-testid="post"
          >
            <GenerativeAvatar :seed="post.id" :is-op="post.is_op" />
            <div class="post-content">
              <div class="post-header">
                <span class="post-id">#{{ post.id }}</span>
                <span
                  v-if="post.sage"
                  class="post-sage"
                  title="Тихий сигнал — не поднимает тред"
                  data-testid="post-sage"
                >
                  <NetworkIcon name="sage" :size="12" />
                </span>
                <span class="post-time">{{ formatTime(post.created_at) }}</span>
                <button
                  class="btn-reply"
                  :title="`Ответить на пост #${post.id}`"
                  :aria-label="`Ответить на пост #${post.id}`"
                  @click="handleReply(post.id, $event)"
                >
                  <span class="btn-reply__glyph" aria-hidden="true">↳</span>
                  Ответить
                </button>
                <button
                  class="btn-report"
                  :title="`Пожаловаться на пост #${post.id}`"
                  :aria-label="`Пожаловаться на пост #${post.id}`"
                  @click="openReport(post.id)"
                >
                  !
                </button>
              </div>
              <PostBody
                :body="post.body"
                :known-ids="knownIds"
                :author="post.author"
                :tripcode="post.tripcode"
                :attachments="post.attachments"
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
                :submit-error="reportError"
                :success-token="reportSuccessToken"
                @close="activeReportPostId = null"
                @submit="(payload) => handleReport({ postId: post.id, ...payload })"
              />
            </div>
          </article>
        </template>
      </div>

      <EmptyState
        v-if="store.thread.thread.posts.length === 0"
        message="Сообщений пока нет."
      />

      <div class="thread-dock">
        <SignalDock
          v-if="!store.thread.thread.is_locked"
          ref="dockRef"
          :thread-id="props.threadId"
          :reply-context="replyContext"
          :submitting="posting"
          :submit-error="postError"
          :success-token="postSuccessToken"
          @submit="handlePost"
          @focus="onDockFocus"
          @blur="onDockBlur"
          @clear-context="clearReplyContext"
          @locate-context="locateReplySource"
        />
      </div>

      <Transition name="fade">
        <p v-if="reportNotice" class="report-notice" data-testid="report-notice">
          {{ reportNotice }}
        </p>
      </Transition>
    </template>

    <ContextFiber
      :source="replyContext?.source ?? null"
      :target="dockEl"
      :label="replyContext ? `#${replyContext.postId}` : ''"
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
}

/* Breadcrumb */
.thread-breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.85rem;
  color: var(--text-muted);
}

.breadcrumb-link {
  color: var(--text-muted);
  text-decoration: none;
}

.breadcrumb-link:hover {
  color: var(--accent);
}

.breadcrumb-sep {
  color: var(--border-medium);
}

.breadcrumb-current {
  font-family: var(--font-display);
  color: var(--accent-dim);
}

/* Title */
.thread-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.thread-title {
  font-size: clamp(1.5rem, 3vw, 2rem);
  margin: 0;
}

.watch-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 var(--space-3);
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: 0.64rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: color 160ms, border-color 160ms;
}

.watch-toggle:hover {
  color: var(--text-secondary);
  border-color: var(--border-medium);
}

.watch-toggle__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid currentColor;
}

.watch-toggle--on {
  color: var(--accent);
  border-color: color-mix(in oklab, var(--accent) 45%, transparent);
}

.watch-toggle--on .watch-toggle__dot {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}

.thread-locked {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0;
}

/* Posts */
.posts {
  display: flex;
  flex-direction: column;
}

/* while a probe is open, surrounding posts recede */
.posts--probing .post-item:not(.post-item--probe) {
  opacity: 0.45;
  transition: opacity 220ms var(--ease-out-quart);
}

.post-item--probe {
  background: color-mix(in oklab, var(--accent) 5%, transparent);
  box-shadow: inset 2px 0 0 var(--accent);
}

.post-item {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
  transition:
    background var(--duration-fast) var(--ease-out-quart),
    transform var(--duration-normal) var(--ease-out-expo),
    box-shadow var(--duration-normal) var(--ease-out-expo);
}

.post-item:hover {
  background: oklch(0.16 0.012 260 / 0.5);
  transform: perspective(900px) rotateX(1.5deg) translateY(-2px);
  box-shadow: 0 10px 30px oklch(0 0 0 / 0.35);
  position: relative;
  z-index: 2;
}

.post-item.op {
  background: oklch(0.72 0.16 65 / 0.06);
  border-left: 2px solid var(--accent-dim);
}

.post-content {
  flex: 1;
  min-width: 0;
}

.post-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
  flex-wrap: wrap;
}

.post-author {
  font-weight: 700;
  color: var(--accent);
  font-size: 0.9rem;
}

.post-id {
  font-family: var(--font-display);
  font-size: 0.75rem;
  color: var(--text-muted);
}

.post-sage {
  display: inline-flex;
  align-items: center;
  color: var(--text-muted);
  opacity: 0.75;
}

.post-time {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.btn-reply {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: 1px solid var(--border-subtle);
  color: var(--accent);
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    color var(--duration-fast),
    border-color var(--duration-fast),
    background var(--duration-fast);
}

.btn-reply__glyph {
  color: var(--accent-dim);
  font-size: 0.8rem;
  line-height: 1;
}

.btn-reply:hover {
  color: var(--text-primary);
  border-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 10%, transparent);
}

.btn-report {
  background: none;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    color var(--duration-fast),
    border-color var(--duration-fast),
    background var(--duration-fast);
}

.btn-report:hover {
  color: var(--danger);
  border-color: var(--danger-dim);
  background: oklch(0.55 0.20 25 / 0.1);
}

/* anchor navigation target + temporary link highlight */
.post-item {
  scroll-margin-top: 84px;
}

.post-item--linked {
  background: color-mix(in oklab, var(--accent) 14%, transparent);
  box-shadow: inset 2px 0 0 var(--accent);
  transition:
    background 220ms var(--ease-out-quart),
    box-shadow 220ms var(--ease-out-quart);
}

/* backlinks under a post */
.post-backlinks {
  margin-top: var(--space-3);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.post-backlinks__label {
  font-size: 0.74rem;
  color: var(--text-muted);
}

.post-backlinks .post-link {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px dotted color-mix(in oklab, var(--accent) 55%, transparent);
  font-family: var(--font-display);
  font-size: 0.8rem;
}

.post-backlinks .post-link:hover {
  color: var(--text-primary);
}

/* Signal Dock — sticky bottom station */
.thread-dock {
  position: sticky;
  bottom: var(--space-4);
  z-index: 10;
  margin-top: var(--space-6);
}

.thread-locked-hint {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--border-medium);
  border-radius: var(--radius-lg);
  text-align: center;
}

.post-item--located {
  background: color-mix(in oklab, var(--accent) 12%, transparent);
  box-shadow: inset 2px 0 0 var(--accent);
}

.report-notice {
  font-size: 0.85rem;
  color: var(--success);
  margin: 0;
}

/* Transitions */
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
    padding: var(--space-3);
    gap: var(--space-3);
  }

  .post-item:hover {
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .post-item:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>

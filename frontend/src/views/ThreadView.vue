<script setup lang="ts">
import { onMounted, ref } from 'vue'
import GlowBorder from '@/components/ui/GlowBorder.vue'
import GenerativeAvatar from '@/components/ui/GenerativeAvatar.vue'
import CreatePostForm from '@/components/CreatePostForm.vue'
import AttachmentPreview from '@/components/AttachmentPreview.vue'
import ReportDialog from '@/components/ReportDialog.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useForumStore } from '@/stores/forum'
import type { NewPostInput, ReportReason } from '@/types'

const props = defineProps<{ threadId: number }>()
const store = useForumStore()

const posting = ref(false)
const postError = ref('')
const reportNotice = ref('')
const formKey = ref(0)
const activeReportPostId = ref<number | null>(null)

onMounted(() => {
  void store.fetchThread(props.threadId)
})

async function handlePost(input: NewPostInput) {
  posting.value = true
  postError.value = ''
  try {
    await store.createPost(props.threadId, input)
    formKey.value += 1
    await store.fetchThread(props.threadId)
  } catch (err) {
    postError.value = err instanceof Error ? err.message : 'Не удалось отправить ответ.'
  } finally {
    posting.value = false
  }
}

async function handleReport(payload: {
  postId: number
  reason: ReportReason
  comment: string
}) {
  reportNotice.value = ''
  activeReportPostId.value = null
  try {
    await store.createReport(payload.postId, {
      reason: payload.reason,
      comment: payload.comment,
    })
    reportNotice.value = 'Жалоба отправлена.'
  } catch (err) {
    reportNotice.value =
      err instanceof Error ? err.message : 'Не удалось отправить жалобу.'
  }
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
</script>

<template>
  <section class="thread-page">
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
      <h1 class="thread-title">{{ store.thread.thread.title }}</h1>

      <p v-if="store.thread.thread.is_locked" class="thread-locked">
        ● Тред закрыт
      </p>

      <div class="posts">
        <article
          v-for="post in store.thread.thread.posts"
          :key="post.id"
          class="post-item"
          :class="{ op: post.is_op }"
          data-testid="post"
        >
          <GenerativeAvatar :seed="post.id" :is-op="post.is_op" />
          <div class="post-content">
            <div class="post-header">
              <span class="post-author">{{ post.author }}</span>
              <span class="post-id">#{{ post.id }}</span>
              <span class="post-time">{{ formatTime(post.created_at) }}</span>
              <button
                class="btn-report"
                title="Пожаловаться"
                @click="activeReportPostId = post.id"
              >
                !
              </button>
            </div>
            <div class="post-body">{{ post.body }}</div>
            <div v-if="post.attachments.length" class="post-attachments">
              <AttachmentPreview
                v-for="attachment in post.attachments"
                :key="attachment.id"
                :attachment="attachment"
              />
            </div>
          </div>

          <ReportDialog
            v-if="activeReportPostId === post.id"
            @close="activeReportPostId = null"
            @submit="(payload) => handleReport({ postId: post.id, ...payload })"
          />
        </article>
      </div>

      <EmptyState
        v-if="store.thread.thread.posts.length === 0"
        message="Сообщений пока нет."
      />

      <div v-if="!store.thread.thread.is_locked" class="reply-section">
        <GlowBorder>
          <CreatePostForm :key="formKey" @submit="handlePost" />
        </GlowBorder>
      </div>

      <p v-if="postError" class="text-danger" data-testid="post-error">
        {{ postError }}
      </p>
      <Transition name="fade">
        <p v-if="reportNotice" class="report-notice" data-testid="report-notice">
          {{ reportNotice }}
        </p>
      </Transition>
    </template>
  </section>
</template>

<style scoped>
.thread-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
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
.thread-title {
  font-size: clamp(1.5rem, 3vw, 2rem);
  margin: 0;
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

.post-item {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
  transition: background var(--duration-fast) var(--ease-out-quart);
}

.post-item:hover {
  background: oklch(0.16 0.012 260 / 0.5);
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

.post-time {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.btn-report {
  margin-left: auto;
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

.post-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  color: var(--text-primary);
}

.post-attachments {
  margin-top: var(--space-3);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* Reply section */
.reply-section {
  margin-top: var(--space-4);
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

  .post-avatar {
    width: 32px;
    height: 32px;
    font-size: 0.6rem;
  }
}
</style>

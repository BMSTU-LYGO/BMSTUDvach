<script setup lang="ts">
import { onMounted, ref } from 'vue'

import CreatePostForm from '@/components/CreatePostForm.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import LoadingState from '@/components/LoadingState.vue'
import PostCard from '@/components/PostCard.vue'
import { useForumStore } from '@/stores/forum'
import type { NewPostInput } from '@/types'

const props = defineProps<{ threadId: number }>()

const store = useForumStore()

const posting = ref(false)
const postError = ref('')
const reportNotice = ref('')
const formKey = ref(0)

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
  reason: string
  comment: string
}) {
  reportNotice.value = ''
  try {
    await store.createReport(payload.postId, {
      reason: payload.reason as never,
      comment: payload.comment,
    })
    reportNotice.value = 'Жалоба отправлена.'
  } catch (err) {
    reportNotice.value =
      err instanceof Error ? err.message : 'Не удалось отправить жалобу.'
  }
}
</script>

<template>
  <section>
    <h2 v-if="store.thread.thread">{{ store.thread.thread.title }}</h2>

    <LoadingState v-if="store.thread.loading" />
    <ErrorState
      v-else-if="store.thread.error"
      :message="store.thread.error"
      :on-retry="() => store.fetchThread(props.threadId)"
    />
    <template v-else-if="store.thread.thread">
      <p v-if="store.thread.thread.is_locked" class="notice">Тред закрыт.</p>

      <div class="posts">
        <PostCard
          v-for="post in store.thread.thread.posts"
          :key="post.id"
          :post="post"
          @report="handleReport"
        />
      </div>
      <EmptyState
        v-if="store.thread.thread.posts.length === 0"
        message="Сообщений пока нет."
      />

      <CreatePostForm
        v-if="!store.thread.thread.is_locked"
        :key="formKey"
        @submit="handlePost"
      />
      <p v-if="postError" class="form-error" data-testid="post-error">
        {{ postError }}
      </p>
      <p v-if="reportNotice" class="notice" data-testid="report-notice">
        {{ reportNotice }}
      </p>
    </template>
  </section>
</template>

<style scoped>
.posts {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 1rem;
}
.form-error {
  color: #b00;
}
.notice {
  color: #666;
}
</style>
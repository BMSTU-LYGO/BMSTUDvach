<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import CreateThreadForm from '@/components/CreateThreadForm.vue'
import ErrorState from '@/components/ErrorState.vue'
import LoadingState from '@/components/LoadingState.vue'
import ThreadList from '@/components/ThreadList.vue'
import { useForumStore } from '@/stores/forum'
import type { NewThreadInput } from '@/types'

const props = defineProps<{ boardSlug: string }>()

const store = useForumStore()

const creating = ref(false)
const createdError = ref('')

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
    await store.fetchThreads(props.boardSlug)
  } catch (err) {
    createdError.value = err instanceof Error ? err.message : 'Не удалось создать тред.'
  } finally {
    creating.value = false
  }
}

const formKey = ref(0)
</script>

<template>
  <section>
    <h2>/{{ boardSlug }}/</h2>
    <CreateThreadForm :key="formKey" @submit="handleCreate" />
    <p v-if="createdError" class="form-error" data-testid="create-error">
      {{ createdError }}
    </p>

    <LoadingState v-if="store.threadList.loading" />
    <ErrorState
      v-else-if="store.threadList.error"
      :message="store.threadList.error"
      :on-retry="() => store.fetchThreads(props.boardSlug)"
    />
    <ThreadList v-else :threads="threads" />
  </section>
</template>

<style scoped>
.form-error {
  color: #b00;
}
</style>
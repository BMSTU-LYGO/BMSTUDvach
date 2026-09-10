<script setup lang="ts">
import type { NewThreadInput } from '@/types'
import { ref } from 'vue'

const emit = defineEmits<{ submit: [input: NewThreadInput] }>()

const title = ref('')
const body = ref('')
const files = ref<File[]>([])
const error = ref('')

function pickFiles(event: Event) {
  const target = event.target as HTMLInputElement
  files.value = Array.from(target.files ?? [])
}

function submit() {
  if (!title.value.trim() || !body.value.trim()) {
    error.value = 'Заполните заголовок и текст треда.'
    return
  }
  error.value = ''
  emit('submit', {
    title: title.value,
    body: body.value,
    attachments: files.value,
  })
}

function reset() {
  title.value = ''
  body.value = ''
  files.value = []
  error.value = ''
}

defineExpose({ reset })
</script>

<template>
  <form class="create-form" data-testid="create-thread-form" @submit.prevent="submit">
    <h3 class="form-title">Создать тред</h3>
    <label class="field">
      <span>Заголовок</span>
      <input v-model="title" type="text" maxlength="200" placeholder="О чём тред?" />
    </label>
    <label class="field">
      <span>Текст</span>
      <textarea v-model="body" rows="5" maxlength="20000" placeholder="Текст первого поста..."></textarea>
    </label>
    <label class="field">
      <span>Вложения</span>
      <input type="file" multiple @change="pickFiles" />
    </label>
    <p v-if="error" class="form-error">{{ error }}</p>
    <div class="actions">
      <button type="submit" class="btn btn-primary">Создать тред</button>
    </div>
  </form>
</template>

<style scoped>
.create-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.form-title {
  margin: 0;
  font-size: 1rem;
  color: var(--accent);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field span {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-error {
  color: var(--danger);
  margin: 0;
  font-size: 0.9rem;
}

input[type="file"] {
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>

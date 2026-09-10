<script setup lang="ts">
import type { NewPostInput } from '@/types'
import { ref } from 'vue'

const emit = defineEmits<{ submit: [input: NewPostInput] }>()

const body = ref('')
const files = ref<File[]>([])
const error = ref('')

function pickFiles(event: Event) {
  const target = event.target as HTMLInputElement
  files.value = Array.from(target.files ?? [])
}

function submit() {
  if (!body.value.trim()) {
    error.value = 'Текст сообщения не может быть пустым.'
    return
  }
  error.value = ''
  emit('submit', { body: body.value, attachments: files.value })
}

function reset() {
  body.value = ''
  files.value = []
  error.value = ''
}

defineExpose({ reset })
</script>

<template>
  <form class="create-form" data-testid="create-post-form" @submit.prevent="submit">
    <h3 class="form-title">Ответить</h3>
    <label class="field">
      <span>Текст</span>
      <textarea v-model="body" rows="4" maxlength="20000" placeholder="Ваш ответ..."></textarea>
    </label>
    <label class="field">
      <span>Вложения</span>
      <input type="file" multiple @change="pickFiles" />
    </label>
    <p v-if="error" class="form-error">{{ error }}</p>
    <div class="actions">
      <button type="submit" class="btn btn-primary">Отправить</button>
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

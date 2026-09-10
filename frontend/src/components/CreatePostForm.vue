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
    <h3>Ответить</h3>
    <label class="field">
      <span>Текст</span>
      <textarea v-model="body" rows="4" maxlength="20000"></textarea>
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
  gap: 0.8rem;
  padding: 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fff;
}
.create-form h3 {
  margin: 0;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.field span {
  font-size: 0.85rem;
  color: #666;
}
.field textarea {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font: inherit;
}
.form-error {
  color: #b00;
  margin: 0;
}
</style>
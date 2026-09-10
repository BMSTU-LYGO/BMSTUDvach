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
    <h3>Создать тред</h3>
    <label class="field">
      <span>Заголовок</span>
      <input v-model="title" type="text" maxlength="200" />
    </label>
    <label class="field">
      <span>Текст</span>
      <textarea v-model="body" rows="5" maxlength="20000"></textarea>
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
.field input,
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
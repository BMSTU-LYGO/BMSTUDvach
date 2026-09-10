<script setup lang="ts">
import type { ReportReason } from '@/types'
import { ref } from 'vue'

const emit = defineEmits<{
  close: []
  submit: [payload: { reason: ReportReason; comment: string }]
}>()

const reasons: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Спам' },
  { value: 'abuse', label: 'Оскорбление' },
  { value: 'illegal', label: 'Незаконный контент' },
  { value: 'offtopic', label: 'Оффтоп' },
  { value: 'other', label: 'Другое' },
]

const reason = ref<ReportReason>('spam')
const comment = ref('')

function submit() {
  emit('submit', { reason: reason.value, comment: comment.value })
}
</script>

<template>
  <div class="report-overlay" data-testid="report-dialog" @click.self="emit('close')">
    <form class="report-dialog" @submit.prevent="submit">
      <h3>Пожаловаться на пост</h3>
      <label class="field">
        <span>Причина</span>
        <select v-model="reason">
          <option v-for="r in reasons" :key="r.value" :value="r.value">
            {{ r.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>Комментарий</span>
        <textarea v-model="comment" rows="3" maxlength="1000"></textarea>
      </label>
      <div class="actions">
        <button type="button" class="btn" @click="emit('close')">Отмена</button>
        <button type="submit" class="btn btn-primary">Отправить жалобу</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.report-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.report-dialog {
  background: #fff;
  padding: 1.2rem;
  border-radius: 8px;
  width: min(420px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.report-dialog h3 {
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
.field select,
.field textarea {
  padding: 0.4rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font: inherit;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}
</style>
<script setup lang="ts">
import type { ReportReason } from '@/types'
import { ref, onMounted, onUnmounted } from 'vue'

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
const dialogRef = ref<HTMLElement | null>(null)

function submit() {
  emit('submit', { reason: reason.value, comment: comment.value })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  if (event.key === 'Tab' && dialogRef.value) {
    // Simple focus trap inside the dialog.
    const focusables = dialogRef.value.querySelectorAll<HTMLElement>(
      'button, select, textarea, input, [tabindex]:not([tabindex="-1"])',
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement as HTMLElement | null
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  // Move focus into the dialog on open.
  requestAnimationFrame(() => {
    dialogRef.value?.querySelector<HTMLElement>('select')?.focus()
  })
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="report-overlay" @click.self="emit('close')">
      <form
        ref="dialogRef"
        class="report-dialog"
        data-testid="report-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Пожаловаться на пост"
        @submit.prevent="submit"
      >
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
          <textarea v-model="comment" rows="3" maxlength="1000" placeholder="Опционально"></textarea>
        </label>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="emit('close')">Отмена</button>
          <button type="submit" class="btn btn-danger">Отправить жалобу</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.report-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal-backdrop);
  animation: fadeIn 0.2s var(--ease-out-quart);
}

.report-dialog {
  background: var(--bg-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  width: min(420px, 90vw);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  box-shadow: var(--shadow-lg);
  animation: fadeInUp 0.3s var(--ease-out-expo);
}

.report-dialog h3 {
  margin: 0;
  font-size: 1.1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

@media (prefers-reduced-motion: reduce) {
  .report-overlay,
  .report-dialog {
    animation: none;
  }
}
</style>

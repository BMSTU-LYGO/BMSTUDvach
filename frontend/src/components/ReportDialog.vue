<script setup lang="ts">
import type { ReportReason } from '@/types'
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  FormField,
  FormTextarea,
  FormButton,
  FormNotice,
  ReasonPicker,
  CharacterCounter,
} from '@/components/form'

const emit = defineEmits<{
  close: []
  submit: [payload: { reason: ReportReason; comment: string }]
}>()

const reason = ref<ReportReason>('spam')
const comment = ref('')
const dialogRef = ref<HTMLElement | null>(null)
const isSubmitting = ref(false)
const error = ref('')

const MAX_COMMENT_LENGTH = 1000
const WARNING_THRESHOLD = 0.9

const commentError = computed(() => {
  if (comment.value.length > MAX_COMMENT_LENGTH) {
    return `Превышен лимит символов (${MAX_COMMENT_LENGTH})`
  }
  return ''
})

const canSubmit = computed(() => {
  return reason.value && comment.value.length <= MAX_COMMENT_LENGTH && !isSubmitting.value
})

function submit() {
  if (!canSubmit.value) return

  error.value = ''
  isSubmitting.value = true

  try {
    emit('submit', { reason: reason.value, comment: comment.value })
    // Close immediately after submit
    emit('close')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Произошла ошибка при отправке жалобы'
  } finally {
    isSubmitting.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  if (event.key === 'Tab' && dialogRef.value) {
    // Simple focus trap inside the dialog.
    const focusables = dialogRef.value.querySelectorAll<HTMLElement>(
      'button, [role="radio"], textarea, input, [tabindex]:not([tabindex="-1"])',
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
    dialogRef.value?.querySelector<HTMLElement>('[role="radio"]')?.focus()
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

        <!-- Error notice -->
        <FormNotice v-if="error" type="error" dismissible @dismiss="error = ''">
          {{ error }}
        </FormNotice>

        <!-- Reason picker -->
        <FormField label="Причина жалобы" required>
          <template #default>
            <ReasonPicker v-model="reason" />
          </template>
        </FormField>

        <!-- Comment field -->
        <FormField label="Комментарий" :error="commentError">
          <template #default="{ id, ariaDescribedby, ariaInvalid }">
            <div class="report-dialog__textarea-wrapper">
              <FormTextarea
                :id="id"
                v-model="comment"
                placeholder="Опционально: опишите проблему подробнее..."
                :maxlength="MAX_COMMENT_LENGTH"
                :min-rows="3"
                :max-rows="6"
                :aria-describedby="ariaDescribedby || 'comment-counter'"
                :aria-invalid="ariaInvalid"
              />
              <div class="report-dialog__counter" id="comment-counter">
                <CharacterCounter
                  :current="comment.length"
                  :max="MAX_COMMENT_LENGTH"
                  :warning-threshold="WARNING_THRESHOLD"
                />
              </div>
            </div>
          </template>
        </FormField>

        <!-- Actions -->
        <div class="report-dialog__actions">
          <FormButton
            variant="ghost"
            @click="emit('close')"
          >
            Отмена
          </FormButton>
          <FormButton
            variant="danger"
            :disabled="!canSubmit"
            :loading="isSubmitting"
            @click="submit"
          >
            {{ isSubmitting ? 'Отправка...' : 'Отправить жалобу' }}
          </FormButton>
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
  width: min(480px, 90vw);
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

.report-dialog__textarea-wrapper {
  position: relative;
}

.report-dialog__counter {
  position: absolute;
  bottom: var(--space-2);
  right: var(--space-3);
  pointer-events: none;
}

.report-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

@media (max-width: 640px) {
  .report-dialog {
    width: 95vw;
    max-height: 90vh;
    overflow-y: auto;
  }
  
  .report-dialog__actions {
    flex-direction: column-reverse;
  }
  
  .report-dialog__actions .form-button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .report-overlay,
  .report-dialog {
    animation: none;
  }
}
</style>

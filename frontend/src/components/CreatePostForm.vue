<script setup lang="ts">
import type { NewPostInput } from '@/types'
import { ref, computed, watch, onMounted } from 'vue'
import {
  ComposerShell,
  FormTextarea,
  FormField,
  CharacterCounter,
  AttachmentDropzone,
  ComposerToolbar,
  FormButton,
  FormNotice,
} from '@/components/form'
import { useDraft } from '@/composables/useDraft'

const emit = defineEmits<{ submit: [input: NewPostInput] }>()

const props = defineProps<{
  threadId: number
  replyContext?: { postId: number; postPreview?: string } | null
}>()

const body = ref('')
const files = ref<File[]>([])
const error = ref('')
const isExpanded = ref(false)
const isSubmitting = ref(false)
const isSuccess = ref(false)

const MAX_LENGTH = 20000
const WARNING_THRESHOLD = 0.9

// Draft management
const { draft, hasDraft, saveDraft, clearDraft } = useDraft(`post-${props.threadId}`)

// Load draft on mount
onMounted(() => {
  if (hasDraft.value && draft.value) {
    body.value = draft.value.body
    isExpanded.value = true
  }
})

// Initialize body with reply context if provided
watch(() => props.replyContext, (newContext) => {
  if (newContext && !body.value.includes(`>>${newContext.postId}`)) {
    body.value = `>>${newContext.postId}\n${body.value}`
    isExpanded.value = true
  }
}, { immediate: true })

// Save draft when body changes
watch(body, (newBody) => {
  if (newBody.trim().length > 0) {
    saveDraft(newBody)
  } else if (hasDraft.value) {
    clearDraft()
  }
})

const bodyError = computed(() => {
  if (!isExpanded.value) return ''
  if (body.value.length === 0) return ''
  if (body.value.length > MAX_LENGTH) {
    return `Превышен лимит символов (${MAX_LENGTH})`
  }
  return ''
})

const canSubmit = computed(() => {
  return body.value.trim().length > 0 && 
         body.value.length <= MAX_LENGTH && 
         !isSubmitting.value
})

function handleCollapse() {
  if (body.value.trim() === '' && files.value.length === 0) {
    isExpanded.value = false
    error.value = ''
  }
}

function handleKeydown(event: KeyboardEvent) {
  // Ctrl+Enter or Cmd+Enter to submit
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    if (canSubmit.value) {
      submit()
    }
  }
  
  // Escape to collapse if empty
  if (event.key === 'Escape' && isExpanded.value) {
    if (body.value.trim() === '' && files.value.length === 0) {
      handleCollapse()
    }
  }
}

async function submit() {
  if (!canSubmit.value) return

  if (body.value.trim().length === 0) {
    error.value = 'Текст сообщения не может быть пустым.'
    return
  }

  error.value = ''
  isSubmitting.value = true

  try {
    emit('submit', { body: body.value, attachments: files.value })
    
    // Clear draft on successful submit
    clearDraft()
    
    // Show success state
    isSuccess.value = true
    setTimeout(() => {
      reset()
      isSuccess.value = false
    }, 1500)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Произошла ошибка при отправке'
  } finally {
    isSubmitting.value = false
  }
}

function reset() {
  body.value = ''
  files.value = []
  error.value = ''
  isExpanded.value = false
  isSubmitting.value = false
  isSuccess.value = false
  clearDraft()
}

function handleAttach() {
  // Trigger file input click
  const input = document.querySelector('.attachment-dropzone__input') as HTMLInputElement
  input?.click()
}

function handleClear() {
  body.value = ''
  files.value = []
  error.value = ''
}

function removeReplyContext() {
  if (props.replyContext) {
    const pattern = `>>${props.replyContext.postId}\n`
    body.value = body.value.replace(pattern, '')
  }
}

defineExpose({ reset })
</script>

<template>
  <div 
    class="create-post-form"
    @keydown="handleKeydown"
  >
    <ComposerShell
      v-model:expanded="isExpanded"
      :submitting="isSubmitting"
      :success="isSuccess"
      @submit="submit"
      @cancel="handleCollapse"
    >
      <template #title>
        <span v-if="!isExpanded">Ответить в тред...</span>
        <span v-else>Новый ответ</span>
      </template>

      <div class="create-post-form__content">
        <!-- Reply context chip -->
        <div v-if="replyContext" class="create-post-form__context">
          <span class="create-post-form__context-label">↳ Ответ на #{{ replyContext.postId }}</span>
          <button
            type="button"
            class="create-post-form__context-remove"
            aria-label="Убрать контекст ответа"
            @click="removeReplyContext"
          >
            ✕
          </button>
        </div>

        <!-- Error notice -->
        <FormNotice v-if="error" type="error" dismissible @dismiss="error = ''">
          {{ error }}
        </FormNotice>

        <!-- Body field -->
        <FormField
          label="Сообщение"
          :error="bodyError"
          required
        >
          <template #default="{ id }">
            <div class="create-post-form__textarea-wrapper">
              <FormTextarea
                :id="id"
                v-model="body"
                placeholder="Введите ваше сообщение..."
                :maxlength="MAX_LENGTH"
                :min-rows="3"
                :max-rows="10"
                aria-describedby="body-counter"
              />
              <div class="create-post-form__counter" id="body-counter">
                <CharacterCounter
                  :current="body.length"
                  :max="MAX_LENGTH"
                  :warning-threshold="WARNING_THRESHOLD"
                />
              </div>
            </div>
          </template>
        </FormField>

        <!-- Attachments -->
        <FormField label="Вложения">
          <template #default>
            <AttachmentDropzone
              v-model:files="files"
              :max-files="4"
              :max-size="10 * 1024 * 1024"
              accept="image/*,application/pdf,text/plain"
              @error="(msg) => error = msg"
            />
          </template>
        </FormField>

        <!-- Toolbar -->
        <ComposerToolbar
          :can-attach="true"
          :can-clear="body.length > 0 || files.length > 0"
          @attach="handleAttach"
          @clear="handleClear"
        />
      </div>

      <template #footer>
        <div class="create-post-form__actions">
          <FormButton
            variant="ghost"
            @click="handleCollapse"
          >
            Отмена
          </FormButton>
          <FormButton
            variant="primary"
            :disabled="!canSubmit"
            :loading="isSubmitting"
            :success="isSuccess"
            @click="submit"
          >
            {{ isSubmitting ? 'Отправка...' : isSuccess ? 'Отправлено!' : 'Отправить' }}
          </FormButton>
        </div>
      </template>
    </ComposerShell>
  </div>
</template>

<style scoped>
.create-post-form {
  width: 100%;
}

.create-post-form__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.create-post-form__context {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: color-mix(in oklab, var(--accent) 10%, var(--bg-surface));
  border: 1px solid color-mix(in oklab, var(--accent) 30%, transparent);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
}

.create-post-form__context-label {
  color: var(--accent);
  font-weight: 500;
}

.create-post-form__context-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  font-size: 1rem;
  line-height: 1;
  transition: color var(--transition-fast);
}

.create-post-form__context-remove:hover {
  color: var(--text-primary);
}

.create-post-form__textarea-wrapper {
  position: relative;
}

.create-post-form__counter {
  position: absolute;
  bottom: var(--space-2);
  right: var(--space-3);
  pointer-events: none;
}

.create-post-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}
</style>

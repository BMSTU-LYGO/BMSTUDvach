<script setup lang="ts">
import type { NewThreadInput } from '@/types'
import { ref, computed, watch, onMounted } from 'vue'
import {
  ComposerShell,
  FormInput,
  FormTextarea,
  FormField,
  CharacterCounter,
  AttachmentDropzone,
  ComposerToolbar,
  FormButton,
  FormNotice,
} from '@/components/form'
import { useDraft } from '@/composables/useDraft'

const emit = defineEmits<{ submit: [input: NewThreadInput] }>()

const props = defineProps<{
  boardSlug: string
}>()

const title = ref('')
const body = ref('')
const files = ref<File[]>([])
const error = ref('')
const isExpanded = ref(false)
const isSubmitting = ref(false)
const isSuccess = ref(false)

const MAX_TITLE_LENGTH = 200
const MAX_BODY_LENGTH = 20000
const WARNING_THRESHOLD = 0.9

// Draft management
const { draft, hasDraft, saveDraft, clearDraft } = useDraft(`thread-${props.boardSlug}`)

// Load draft on mount
onMounted(() => {
  if (hasDraft.value && draft.value) {
    title.value = draft.value.title || ''
    body.value = draft.value.body || ''
    isExpanded.value = true
  }
})

// Save draft when title or body changes
watch([title, body], ([newTitle, newBody]) => {
  if (newTitle.trim().length > 0 || newBody.trim().length > 0) {
    saveDraft({ title: newTitle, body: newBody })
  } else if (hasDraft.value) {
    clearDraft()
  }
})

const titleError = computed(() => {
  if (!isExpanded.value) return ''
  if (title.value.length === 0) return ''
  if (title.value.length > MAX_TITLE_LENGTH) {
    return `Превышен лимит символов (${MAX_TITLE_LENGTH})`
  }
  return ''
})

const bodyError = computed(() => {
  if (!isExpanded.value) return ''
  if (body.value.length === 0) return ''
  if (body.value.length > MAX_BODY_LENGTH) {
    return `Превышен лимит символов (${MAX_BODY_LENGTH})`
  }
  return ''
})

const canSubmit = computed(() => {
  return title.value.trim().length > 0 && 
         body.value.trim().length > 0 &&
         title.value.length <= MAX_TITLE_LENGTH &&
         body.value.length <= MAX_BODY_LENGTH &&
         !isSubmitting.value
})

function handleCollapse() {
  if (title.value.trim() === '' && body.value.trim() === '' && files.value.length === 0) {
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
    if (title.value.trim() === '' && body.value.trim() === '' && files.value.length === 0) {
      handleCollapse()
    }
  }
}

async function submit() {
  if (!canSubmit.value) return

  if (title.value.trim().length === 0) {
    error.value = 'Заголовок не может быть пустым.'
    return
  }

  if (body.value.trim().length === 0) {
    error.value = 'Текст треда не может быть пустым.'
    return
  }

  error.value = ''
  isSubmitting.value = true

  try {
    emit('submit', { 
      title: title.value, 
      body: body.value, 
      attachments: files.value 
    })
    
    // Clear draft on successful submit
    clearDraft()
    
    // Show success state
    isSuccess.value = true
    setTimeout(() => {
      reset()
      isSuccess.value = false
    }, 1500)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Произошла ошибка при создании треда'
  } finally {
    isSubmitting.value = false
  }
}

function reset() {
  title.value = ''
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
  title.value = ''
  body.value = ''
  files.value = []
  error.value = ''
}

defineExpose({ reset })
</script>

<template>
  <div 
    class="create-thread-form"
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
        <span v-if="!isExpanded">Создать новый тред...</span>
        <span v-else>NEW THREAD /{{ boardSlug }}/</span>
      </template>

      <div class="create-thread-form__content">
        <!-- Error notice -->
        <FormNotice v-if="error" type="error" dismissible @dismiss="error = ''">
          {{ error }}
        </FormNotice>

        <!-- Title field -->
        <FormField
          label="Заголовок треда"
          :error="titleError"
          required
        >
          <template #default="{ id }">
            <div class="create-thread-form__input-wrapper">
              <FormInput
                :id="id"
                v-model="title"
                placeholder="О чём этот тред?"
                :maxlength="MAX_TITLE_LENGTH"
                aria-describedby="title-counter"
              />
              <div class="create-thread-form__counter" id="title-counter">
                <CharacterCounter
                  :current="title.length"
                  :max="MAX_TITLE_LENGTH"
                  :warning-threshold="WARNING_THRESHOLD"
                />
              </div>
            </div>
          </template>
        </FormField>

        <!-- Body field -->
        <FormField
          label="Текст треда"
          :error="bodyError"
          required
        >
          <template #default="{ id }">
            <div class="create-thread-form__textarea-wrapper">
              <FormTextarea
                :id="id"
                v-model="body"
                placeholder="Опишите тему треда..."
                :maxlength="MAX_BODY_LENGTH"
                :min-rows="5"
                :max-rows="15"
                aria-describedby="body-counter"
              />
              <div class="create-thread-form__counter" id="body-counter">
                <CharacterCounter
                  :current="body.length"
                  :max="MAX_BODY_LENGTH"
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
          :can-clear="title.length > 0 || body.length > 0 || files.length > 0"
          @attach="handleAttach"
          @clear="handleClear"
        />
      </div>

      <template #footer>
        <div class="create-thread-form__actions">
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
            {{ isSubmitting ? 'Создание...' : isSuccess ? 'Создано!' : 'Создать тред' }}
          </FormButton>
        </div>
      </template>
    </ComposerShell>
  </div>
</template>

<style scoped>
.create-thread-form {
  width: 100%;
}

.create-thread-form__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.create-thread-form__input-wrapper,
.create-thread-form__textarea-wrapper {
  position: relative;
}

.create-thread-form__counter {
  position: absolute;
  bottom: var(--space-2);
  right: var(--space-3);
  pointer-events: none;
}

.create-thread-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}
</style>

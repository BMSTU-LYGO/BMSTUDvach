<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  files: File[]
  maxFiles?: number
  maxSize?: number
  accept?: string
}>()

const emit = defineEmits<{
  'update:files': [files: File[]]
  error: [message: string]
}>()

const isDragging = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const maxFiles = props.maxFiles ?? 4
const maxSize = props.maxSize ?? 10 * 1024 * 1024 // 10MB

const canAddMore = computed(() => props.files.length < maxFiles)

function handleFiles(fileList: FileList | File[]) {
  const newFiles = Array.from(fileList)
  const validFiles: File[] = []

  for (const file of newFiles) {
    if (file.size > maxSize) {
      emit('error', `Файл "${file.name}" слишком большой (макс. ${formatSize(maxSize)})`)
      continue
    }

    if (props.accept) {
      const acceptedTypes = props.accept.split(',').map(t => t.trim())
      const isAccepted = acceptedTypes.some(type => {
        if (type.startsWith('.')) {
          return file.name.toLowerCase().endsWith(type.toLowerCase())
        }
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.slice(0, -1))
        }
        return file.type === type
      })

      if (!isAccepted) {
        emit('error', `Файл "${file.name}" имеет неподдерживаемый формат`)
        continue
      }
    }

    validFiles.push(file)
  }

  if (validFiles.length > 0) {
    const combined = [...props.files, ...validFiles].slice(0, maxFiles)
    emit('update:files', combined)
  }
}

function handleDragEnter(event: DragEvent) {
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false

  if (event.dataTransfer?.files) {
    handleFiles(event.dataTransfer.files)
  }
}

function handlePaste(event: ClipboardEvent) {
  if (event.clipboardData?.files) {
    handleFiles(event.clipboardData.files)
  }
}

function handleClick() {
  if (canAddMore.value) {
    inputRef.value?.click()
  }
}

function handleInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) {
    handleFiles(input.files)
    input.value = '' // Reset input
  }
}

function removeFile(index: number) {
  const newFiles = [...props.files]
  newFiles.splice(index, 1)
  emit('update:files', newFiles)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div
    class="attachment-dropzone"
    :class="{
      'attachment-dropzone--dragging': isDragging,
      'attachment-dropzone--disabled': !canAddMore,
    }"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @dragover="handleDragOver"
    @drop="handleDrop"
    @paste="handlePaste"
    @click="handleClick"
    tabindex="0"
    role="button"
    :aria-label="canAddMore ? 'Прикрепить файлы' : 'Достигнут лимит файлов'"
  >
    <input
      ref="inputRef"
      type="file"
      multiple
      :accept="accept"
      class="attachment-dropzone__input"
      @change="handleInputChange"
    />

    <div class="attachment-dropzone__content">
      <div class="attachment-dropzone__icon">📎</div>
      <div class="attachment-dropzone__text">
        <template v-if="isDragging">
          Отпустите файлы для загрузки
        </template>
        <template v-else-if="!canAddMore">
          Достигнут лимит ({{ maxFiles }} файлов)
        </template>
        <template v-else>
          Перетащите файлы сюда или нажмите для выбора<br />
          <span class="attachment-dropzone__hint">
            Также можно вставить из буфера обмена (Ctrl+V)
          </span>
        </template>
      </div>
    </div>

    <div v-if="files.length > 0" class="attachment-dropzone__list">
      <div
        v-for="(file, index) in files"
        :key="index"
        class="attachment-dropzone__item"
      >
        <div class="attachment-dropzone__item-info">
          <span class="attachment-dropzone__item-name">{{ file.name }}</span>
          <span class="attachment-dropzone__item-size">{{ formatSize(file.size) }}</span>
        </div>
        <button
          type="button"
          class="attachment-dropzone__item-remove"
          aria-label="Удалить файл"
          @click.stop="removeFile(index)"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.attachment-dropzone {
  position: relative;
  border: 2px dashed var(--border-medium);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  text-align: center;
  cursor: pointer;
  transition: all var(--transition-fast);
  background: var(--bg-surface);
}

.attachment-dropzone:hover:not(.attachment-dropzone--disabled) {
  border-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 5%, var(--bg-surface));
}

.attachment-dropzone--dragging {
  border-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 10%, var(--bg-surface));
  border-style: solid;
}

.attachment-dropzone--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.attachment-dropzone__input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.attachment-dropzone__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.attachment-dropzone__icon {
  font-size: 2rem;
  opacity: 0.5;
}

.attachment-dropzone__text {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.attachment-dropzone__hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: var(--space-1);
}

.attachment-dropzone__list {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.attachment-dropzone__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--bg-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  text-align: left;
}

.attachment-dropzone__item-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  flex: 1;
}

.attachment-dropzone__item-name {
  font-size: 0.8125rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attachment-dropzone__item-size {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.attachment-dropzone__item-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: var(--space-1);
  font-size: 1rem;
  line-height: 1;
  transition: color var(--transition-fast);
  flex-shrink: 0;
}

.attachment-dropzone__item-remove:hover {
  color: var(--danger);
}
</style>

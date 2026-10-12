<script setup lang="ts">
import { ref } from 'vue'

import AttachmentCapsule from './AttachmentCapsule.vue'

/**
 * Cargo Rail (SIGNAL-10). Horizontal film-strip of attachments above the
 * text surface. Empty state = nothing shown; intake is the whole dock.
 */
const props = defineProps<{
  files: File[]
  maxFiles?: number
  maxSize?: number
  accepted?: string
}>()

const emit = defineEmits<{
  'update:files': [files: File[]]
  error: [message: string]
}>()

interface Reject {
  file: File
  reason: string
}
const rejects = ref<Reject[]>([])
const inputRef = ref<HTMLInputElement | null>(null)

const maxFiles = props.maxFiles ?? 4
const maxSize = props.maxSize ?? 10 * 1024 * 1024

function openPicker() {
  inputRef.value?.click()
}

function accept(file: File): string | null {
  if (file.size > maxSize) return `превышает ${(maxSize / (1024 * 1024)).toFixed(0)} MB`
  if (props.accepted) {
    const accepted = props.accepted.split(',').map((t) => t.trim())
    const ok = accepted.some((type) => {
      if (type.endsWith('/*')) return file.type.startsWith(type.slice(0, -1))
      return file.type === type
    })
    if (!ok) return 'неподдерживаемый формат'
  }
  return null
}

function addFiles(list: File[] | FileList) {
  const next = [...props.files]
  const rejectsOut: Reject[] = []
  for (const file of Array.from(list)) {
    if (next.length >= maxFiles) {
      rejectsOut.push({ file, reason: 'достигнут лимит файлов' })
      continue
    }
    const why = accept(file)
    if (why) rejectsOut.push({ file, reason: why })
    else next.push(file)
  }
  if (rejectsOut.length) {
    rejects.value = rejectsOut
    emit('error', rejectsOut[0].reason)
    window.setTimeout(() => (rejects.value = []), 4000)
  }
  if (next.length !== props.files.length) emit('update:files', next)
}

function handleInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) addFiles(input.files)
  input.value = ''
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files)
}

function removeAt(i: number) {
  const next = [...props.files]
  next.splice(i, 1)
  emit('update:files', next)
}

function handlePaste(e: ClipboardEvent) {
  if (e.clipboardData?.files?.length) {
    addFiles(e.clipboardData.files)
  }
}

defineExpose({ openPicker, addFiles })
</script>

<template>
  <div class="cargo-rail" @dragover.prevent @drop="handleDrop" @paste="handlePaste">
    <input
      ref="inputRef"
      type="file"
      multiple
      class="cargo-rail__input"
      :accept="accepted"
      aria-hidden="true"
      tabindex="-1"
      @change="handleInput"
    />

    <div v-if="files.length || rejects.length" class="cargo-rail__strip">
      <AttachmentCapsule
        v-for="(file, i) in files"
        :key="`f-${i}-${file.name}`"
        :file="file"
        @remove="removeAt(i)"
      />
      <AttachmentCapsule
        v-for="(r, i) in rejects"
        :key="`r-${i}-${r.file.name}`"
        :file="r.file"
        rejected
        :reject-reason="r.reason"
      />
    </div>
  </div>
</template>

<style scoped>
.cargo-rail {
  position: relative;
}

.cargo-rail__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.cargo-rail__strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0;
  scrollbar-width: thin;
}

.cargo-rail__strip::-webkit-scrollbar {
  height: 3px;
}
</style>

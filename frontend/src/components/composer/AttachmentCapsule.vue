<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

/**
 * One attachment in the Cargo Rail (SIGNAL-10).
 * Images → thumbnail mosaic card. Other types → compact capsule.
 */
const props = defineProps<{
  file: File
  rejected?: boolean
  rejectReason?: string
}>()

const emit = defineEmits<{ remove: [] }>()

const isImage = computed(() => props.file.type.startsWith('image/'))
const previewUrl = ref<string | null>(null)
const previewFailed = ref(false)

if (isImage.value) {
  try {
    previewUrl.value = URL.createObjectURL(props.file)
  } catch {
    previewFailed.value = true
  }
}

onUnmounted(() => {
  // Never leak blob URLs — revoke on removal/unmount.
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

function ext() {
  const dot = props.file.name.lastIndexOf('.')
  return dot >= 0 ? props.file.name.slice(dot + 1).toUpperCase() : 'FILE'
}

function size() {
  const b = props.file.size
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div
    class="capsule"
    :class="{
      'capsule--image': isImage && !rejected,
      'capsule--rejected': rejected,
    }"
    data-testid="attachment-capsule"
  >
    <template v-if="rejected">
      <div class="capsule__rejected">
        <span class="capsule__rejected-label">REJECTED</span>
        <span class="capsule__rejected-reason">{{ rejectReason }}</span>
      </div>
    </template>

    <template v-else-if="isImage">
      <div class="capsule__thumb">
        <img v-if="previewUrl && !previewFailed" :src="previewUrl" :alt="file.name" />
        <span v-else class="capsule__fallback" aria-hidden="true">IMG</span>
      </div>
      <div class="capsule__meta">
        <span class="capsule__name">{{ file.name }}</span>
        <span class="capsule__size">{{ size() }}</span>
      </div>
    </template>

    <template v-else>
      <div class="capsule__file">
        <span class="capsule__ext" aria-hidden="true">{{ ext() }}</span>
        <div class="capsule__meta">
          <span class="capsule__name">{{ file.name }}</span>
          <span class="capsule__size">{{ size() }}</span>
        </div>
      </div>
    </template>

    <button
      type="button"
      class="capsule__remove"
      aria-label="Убрать вложение"
      @click="emit('remove')"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </div>
</template>

<style scoped>
.capsule {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--bg-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  max-width: 220px;
}

.capsule--image {
  padding: 4px;
}

.capsule__thumb {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-deep);
  display: grid;
  place-items: center;
}

.capsule__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.capsule__fallback {
  font-family: var(--font-display);
  font-size: 0.6rem;
  color: var(--text-muted);
}

.capsule__file {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.capsule__ext {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-medium);
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 0.55rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.capsule__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.capsule__name {
  font-size: 0.72rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
}

.capsule__size {
  font-size: 0.62rem;
  color: var(--text-muted);
}

.capsule__remove {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  background: none;
  border: none;
  border-radius: 50%;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 160ms, color 160ms;
}

.capsule:hover .capsule__remove,
.capsule__remove:focus-visible {
  opacity: 1;
}

.capsule__remove:hover {
  color: var(--danger);
}

.capsule--rejected {
  border-color: var(--danger-dim);
  background: color-mix(in oklab, var(--danger) 8%, var(--bg-raised));
}

.capsule__rejected {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.capsule__rejected-label {
  font-family: var(--font-display);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  color: var(--danger);
}

.capsule__rejected-reason {
  font-size: 0.64rem;
  color: var(--text-muted);
}
</style>
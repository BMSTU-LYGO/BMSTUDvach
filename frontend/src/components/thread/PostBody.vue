<script setup lang="ts">
import { computed, ref } from 'vue'

import { parsePostLinks } from '@/composables/usePostLinks'
import AttachmentLightbox from './AttachmentLightbox.vue'
import type { Attachment } from '@/types'

/**
 * Post body with `>>123` links rendered as real anchors (native keyboard,
 * middle-click and copy-link still work). Links to ids that do not exist
 * in the thread stay visible but marked dead — honest over pretending.
 *
 * Optional author signature: the display name plus the server-computed
 * tripcode, so a poster stays recognisable across posts without accounts.
 */
const props = defineProps<{
  body: string
  knownIds: Set<number>
  author?: string
  tripcode?: string
  attachments?: Attachment[]
}>()

const emit = defineEmits<{
  navigate: [id: number]
  preview: [id: number, event: MouseEvent]
  'preview-leave': []
}>()

const tokens = computed(() => parsePostLinks(props.body))

const attachments = computed(() => props.attachments ?? [])
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)

function openLightbox(index: number) {
  lightboxIndex.value = index
  lightboxOpen.value = true
}

const isImage = (mime: string) => mime.startsWith('image/')

const authorLabel = computed(() => (props.author ?? '').trim() || 'Аноним')
const trip = computed(() => (props.tripcode ?? '').trim())
const showSignature = computed(() => Boolean((props.author ?? '').trim() || trip.value))
const signature = computed(() =>
  trip.value ? `${authorLabel.value} ${trip.value}` : authorLabel.value,
)
</script>

<template>
  <p
    v-if="showSignature"
    class="post-signature"
    :aria-label="`Автор: ${signature}`"
    data-testid="post-signature"
  >
    <span class="post-signature__author">{{ authorLabel }}</span>
    <span v-if="trip" class="post-signature__tripcode" data-testid="post-tripcode">{{
      trip
    }}</span>
  </p>
  <div class="post-body">
    <template v-for="(token, i) in tokens" :key="i">
      <span v-if="token.type === 'text'">{{ token.value }}</span>
      <a
        v-else
        class="post-link"
        :class="{ 'post-link--dead': !knownIds.has(token.id) }"
        :href="`#post-${token.id}`"
        :data-target="token.id"
        :aria-disabled="!knownIds.has(token.id) || undefined"
        :title="knownIds.has(token.id) ? `Пост #${token.id}` : 'Пост не найден'"
        @click.prevent="knownIds.has(token.id) && emit('navigate', token.id)"
        @mouseenter="knownIds.has(token.id) && emit('preview', token.id, $event)"
        @mouseleave="emit('preview-leave')"
        >&gt;&gt;{{ token.id }}</a
      >
    </template>
  </div>

  <div
    v-if="attachments.length"
    class="post-attachments"
    data-testid="post-attachments"
  >
    <button
      v-for="(attachment, index) in attachments"
      :key="attachment.id"
      type="button"
      class="post-attachment"
      :data-testid="`post-attachment-${index}`"
      :aria-label="`Открыть вложение ${attachment.original_name || index + 1}`"
      @click="openLightbox(index)"
    >
      <img
        v-if="isImage(attachment.mime_type)"
        class="post-attachment__img"
        :src="attachment.url"
        :alt="attachment.original_name"
        loading="lazy"
      />
      <span v-else class="post-attachment__file">{{ attachment.original_name }}</span>
    </button>
  </div>

  <AttachmentLightbox
    v-model="lightboxOpen"
    :attachments="attachments"
    :start-index="lightboxIndex"
  />
</template>

<style scoped>
.post-signature {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin: 0 0 var(--space-1);
  flex-wrap: wrap;
}

.post-signature__author {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--accent);
}

.post-signature__tripcode {
  font-family: var(--font-display);
  font-size: 0.75rem;
  color: var(--accent-dim);
}

.post-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  color: var(--text-primary);
}

.post-link {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px dotted color-mix(in oklab, var(--accent) 55%, transparent);
  font-family: var(--font-display);
  font-size: 0.86em;
  transition: color var(--duration-fast), border-color var(--duration-fast);
}

.post-link:hover {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}

.post-link--dead {
  color: var(--text-muted);
  border-bottom-color: transparent;
  cursor: default;
}

.post-link--dead:hover {
  color: var(--text-muted);
}

.post-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.post-attachment {
  padding: 0;
  overflow: hidden;
  background: var(--bg-deep);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  cursor: zoom-in;
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    box-shadow var(--duration-fast) var(--ease-out-quart);
}

.post-attachment:hover {
  border-color: var(--border-accent);
  box-shadow: var(--shadow-glow);
}

.post-attachment__img {
  display: block;
  max-width: 180px;
  max-height: 180px;
  object-fit: cover;
}

.post-attachment__file {
  display: block;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-display);
  font-size: 0.75rem;
  color: var(--text-secondary);
}
</style>

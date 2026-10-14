<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

import { parsePostLinks } from '@/composables/usePostLinks'
import type { PostToken } from '@/composables/usePostLinks'
import { useQuoteThreadId } from '@/composables/useQuoteInsert'
import { useDraftQuoteStore } from '@/stores/draftQuote'
import AttachmentLightbox from './AttachmentLightbox.vue'
import type { Attachment } from '@/types'

/**
 * Post body with `>>123` links rendered as real anchors (native keyboard,
 * middle-click and copy-link still work). Links to ids that do not exist
 * in the thread stay visible but marked dead — honest over pretending.
 *
 * Optional author signature: the display name plus the server-computed
 * tripcode, so a poster stays recognisable across posts without accounts.
 *
 * A plain click on a live link quotes the post into the Signal Dock draft
 * (QUOTE-01) on top of navigating; modified clicks stay native.
 *
 * Reading typography: the body is split into line blocks grouped into
 * paragraphs and greentext quotes, so a wall of text keeps a comfortable
 * measure and rhythm instead of one unbroken `pre-wrap` run. Lines that start
 * with `>` (after trim) are the imageboard greentext — a quoted line rendered
 * with a left rule, an indent and a dimmed readable green from the tokens.
 * The raw text, line breaks included, stays in the DOM: the rendered text
 * content is the post body verbatim, so copying a post keeps its shape.
 */
const props = defineProps<{
  body: string
  knownIds: Set<number>
  author?: string
  tripcode?: string
  attachments?: Attachment[]
  threadId?: number
}>()

const emit = defineEmits<{
  navigate: [id: number]
  preview: [id: number, event: MouseEvent]
  'preview-leave': []
}>()

const quoteStore = useDraftQuoteStore()
const routeThreadId = useQuoteThreadId()
const quoteThreadId = computed(() => props.threadId ?? routeThreadId.value)
const quotedId = ref<number | null>(null)
let quotedTimer: number | undefined

onUnmounted(() => {
  if (quotedTimer) window.clearTimeout(quotedTimer)
})

interface BodyLine {
  tokens: PostToken[]
  greentext: boolean
  blank: boolean
  eol: string
}

type BodyBlock =
  | { kind: 'quote'; lines: BodyLine[] }
  | { kind: 'paragraph'; lines: BodyLine[] }
  | { kind: 'gap'; eol: string }

const bodyLines = computed<BodyLine[]>(() => {
  const raw = props.body.split('\n')
  return raw.map((text, index) => {
    const trimmed = text.trim()
    return {
      tokens: parsePostLinks(text),
      greentext: trimmed.startsWith('>'),
      blank: trimmed.length === 0,
      eol: index < raw.length - 1 ? '\n' : '',
    }
  })
})

/**
 * Consecutive greentext lines collapse into a single quote block so a multi
 * line quote carries one continuous left rule. Blank lines never join a run:
 * they only carry their own line breaks, so a paragraph break stays a break
 * instead of stretching the spacing.
 */
const blocks = computed<BodyBlock[]>(() => {
  const out: BodyBlock[] = []

  for (const line of bodyLines.value) {
    const kind: BodyBlock['kind'] = line.blank
      ? 'gap'
      : line.greentext
        ? 'quote'
        : 'paragraph'
    const previous = out[out.length - 1]

    if (previous?.kind === kind) {
      if (previous.kind === 'gap') previous.eol += line.eol
      else previous.lines.push(line)
      continue
    }

    if (kind === 'gap') out.push({ kind: 'gap', eol: line.eol })
    else out.push({ kind, lines: [line] })
  }

  return out.filter((block) => block.kind !== 'gap' || block.eol.length > 0)
})

const attachments = computed(() => props.attachments ?? [])
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)

function openLightbox(index: number) {
  lightboxIndex.value = index
  lightboxOpen.value = true
}

const isImage = (mime: string) => mime.startsWith('image/')

function linkTitle(id: number): string {
  if (!props.knownIds.has(id)) return 'Пост не найден'
  return `Пост #${id}: клик вставит цитату >>${id} в черновик, Ctrl/Cmd+клик — новая вкладка`
}

function flashQuote(id: number) {
  quotedId.value = id
  if (quotedTimer) window.clearTimeout(quotedTimer)
  quotedTimer = window.setTimeout(() => {
    quotedId.value = null
  }, 900)
}

function requestQuote(postId: number) {
  const threadId = quoteThreadId.value
  if (threadId !== null) {
    quoteStore.requestQuote(threadId, postId)
    flashQuote(postId)
  }
}

function opensInBackground(mods: {
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}): boolean {
  return mods.ctrlKey || mods.metaKey || mods.shiftKey || mods.altKey
}

function targetOpensNewTab(event: Event): boolean {
  const target = event.currentTarget as HTMLElement | null
  return target?.getAttribute('target') === '_blank'
}

function hoverPreview(id: number, event: MouseEvent) {
  if (props.knownIds.has(id)) emit('preview', id, event)
}

function onLinkClick(id: number, event: MouseEvent) {
  const native =
    event.button !== 0 || opensInBackground(event) || targetOpensNewTab(event)
  activateLink(id, native, () => event.preventDefault())
}

function onLinkEnter(id: number, event: KeyboardEvent) {
  const native = opensInBackground(event) || targetOpensNewTab(event)
  activateLink(id, native, () => event.preventDefault())
}

function activateLink(id: number, native: boolean, preventDefault: () => void) {
  if (!props.knownIds.has(id)) {
    preventDefault()
    return
  }
  // Ctrl/Cmd/Shift/middle clicks and target=_blank keep the browser's own
  // behaviour — the quote belongs to the plain activation only.
  if (!native) {
    preventDefault()
    requestQuote(id)
  }
  emit('navigate', id)
}

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
    <template v-for="(block, blockIndex) in blocks" :key="blockIndex">
      <span v-if="block.kind === 'gap'" class="post-gap">{{ block.eol }}</span>
      <div
        v-else
        class="post-block"
        :class="block.kind === 'quote' ? 'post-quote' : 'post-paragraph'"
        :data-testid="block.kind === 'quote' ? 'greentext' : undefined"
      >
        <template v-for="(line, lineIndex) in block.lines" :key="lineIndex">
          <span class="post-line">
            <template v-for="(token, tokenIndex) in line.tokens" :key="tokenIndex">
              <span v-if="token.type === 'text'">{{ token.value }}</span>
              <a
                v-else
                class="post-link"
                :class="{
                  'post-link--dead': !knownIds.has(token.id),
                  'post-link--quoted': quotedId === token.id,
                }"
                :href="`#post-${token.id}`"
                :data-target="token.id"
                :aria-disabled="!knownIds.has(token.id) || undefined"
                :title="linkTitle(token.id)"
                @click="onLinkClick(token.id, $event)"
                @keydown.enter="onLinkEnter(token.id, $event)"
                @mouseenter="hoverPreview(token.id, $event)"
                @mouseleave="emit('preview-leave')"
                >&gt;&gt;{{ token.id }}</a
              >
            </template>
          </span>
          <span v-if="line.eol" class="post-line__eol">{{ line.eol }}</span>
        </template>
      </div>
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
  font-family: var(--font-display);
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
  max-width: 78ch;
  overflow-wrap: anywhere;
  line-height: 1.65;
  color: var(--text-primary);
  font-family: var(--font-body);
}

.post-block:not(:last-child) {
  margin-bottom: var(--space-4);
}

.post-line {
  display: block;
  white-space: pre-wrap;
  text-wrap: pretty;
}

.post-quote {
  padding-left: var(--space-3);
  border-left: 2px solid color-mix(in oklab, var(--success) 60%, transparent);
  color: color-mix(in oklab, var(--success) 88%, var(--bg-surface));
}

.post-link {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px dotted color-mix(in oklab, var(--accent) 55%, transparent);
  font-family: var(--font-display);
  font-size: 0.86em;
  border-radius: var(--radius-sm);
  transition:
    color var(--duration-fast),
    border-color var(--duration-fast);
}

.post-link:hover {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 12%, transparent);
}

.post-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  color: var(--text-primary);
  background: color-mix(in oklab, var(--accent) 16%, transparent);
}

.post-quote .post-link:hover,
.post-quote .post-link:focus-visible {
  background: color-mix(in oklab, var(--success) 18%, transparent);
}

.post-link--dead {
  color: var(--text-muted);
  border-bottom-color: transparent;
  cursor: default;
}

.post-link--dead:hover,
.post-link--dead:focus-visible {
  color: var(--text-muted);
  background: none;
}

.post-link--quoted {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
  animation: post-link-quoted 900ms var(--ease-out-quart);
}

@keyframes post-link-quoted {
  0% {
    background: color-mix(in oklab, var(--accent) 30%, transparent);
  }
  100% {
    background: color-mix(in oklab, var(--accent) 0%, transparent);
  }
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

@media (prefers-reduced-motion: reduce) {
  .post-link,
  .post-attachment {
    transition: none;
  }

  .post-link--quoted {
    animation: none;
    background: color-mix(in oklab, var(--accent) 20%, transparent);
  }
}
</style>

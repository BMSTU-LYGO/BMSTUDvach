<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

import { parsePostLinks } from '@/composables/usePostLinks'
import type { PostToken } from '@/composables/usePostLinks'
import { splitHighlight } from '@/composables/useThreadSearch'
import type { HighlightSegment } from '@/composables/useThreadSearch'
import { useQuoteThreadId } from '@/composables/useQuoteInsert'
import { useDraftQuoteStore } from '@/stores/draftQuote'
import AttachmentLightbox from './AttachmentLightbox.vue'
import NetworkIcon from '../composer/NetworkIcon.vue'
import type { Attachment } from '@/types'

/**
 * Post body with `>>123` links rendered as real anchors (native keyboard,
 * middle-click and copy-link still work). Links to ids that do not exist
 * in the thread stay visible but marked dead — honest over pretending.
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
 *
 * An optional `highlight` query wraps every case-insensitive occurrence in
 * the text segments with `<mark>` (FINDPOST-01); text stays verbatim, so the
 * DOM contract above is untouched.
 */
const props = defineProps<{
  body: string
  knownIds: Set<number>
  attachments?: Attachment[]
  threadId?: number
  highlight?: string
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
  /** The line belongs to a fenced code block. */
  code: boolean
  /** The line IS a fence marker (` ``` ` or ` ```lang `). */
  fence: boolean
  /** The quote marker at the head of a greentext line — drawn, not dumped. */
  marker: string
}

type BodyBlock =
  | { kind: 'quote'; lines: BodyLine[] }
  | { kind: 'paragraph'; lines: BodyLine[] }
  | { kind: 'code'; lines: BodyLine[] }
  | { kind: 'gap'; eol: string }

/**
 * The quote marker of a greentext line: a run of `>` that does not open a
 * post link (`>>42` is a link, not a marker). The marker is only taken from
 * a line that starts with it — an indented quote keeps its indentation, and
 * the text stays verbatim in the DOM either way.
 */
const QUOTE_MARKER = /^>+/

/** Текст строки блока кода: маркеры и содержимое идут как есть. */
function lineText(line: BodyLine): string {
  const token = line.tokens[0]
  return token && token.type === 'text' ? token.value : ''
}

const bodyLines = computed<BodyLine[]>(() => {
  const raw = props.body.split('\n')
  let inCode = false
  return raw.map((text, index) => {
    const trimmed = text.trim()
    const isFence = trimmed.startsWith('```')
    // a fence opens or closes a code block; the state machine is the parser
    if (isFence) inCode = !inCode
    const code = isFence || inCode
    const greentext = !code && trimmed.startsWith('>')
    const run = greentext ? QUOTE_MARKER.exec(text)?.[0] ?? '' : ''
    // `>>42` opens a post link — that is a link, not a quote marker
    const marker = run && !/\d/.test(text[run.length] ?? '') ? run : ''
    // the marker is drawn apart from the text, but it stays part of it
    const rest = marker ? text.slice(marker.length) : text
    return {
      tokens: code ? [{ type: 'text', value: text }] : parsePostLinks(rest),
      greentext,
      blank: trimmed.length === 0,
      eol: index < raw.length - 1 ? '\n' : '',
      code,
      fence: isFence,
      marker,
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
    const kind: BodyBlock['kind'] = line.code
      ? 'code'
      : line.blank
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

/** Text token → highlight segments; links stay links, never highlighted. */
function highlightSegments(text: string): HighlightSegment[] {
  if (!props.highlight) return [{ text, hit: false }]
  return splitHighlight(text, props.highlight)
}

const attachments = computed(() => props.attachments ?? [])
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)

function openLightbox(index: number) {
  lightboxIndex.value = index
  lightboxOpen.value = true
}

const isImage = (mime: string) => mime.startsWith('image/')

/** Attachment size as a compact KB/MB pair — bytes lie on small files. */
function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Intrinsic pixel dimensions, when the server knows them. */
function formatDimensions(attachment: Attachment): string | null {
  if (attachment.width && attachment.height) {
    return `${attachment.width} × ${attachment.height}`
  }
  return null
}

/** Lowercase extension pulled from the name or the MIME type, no dot. */
function fileExtension(attachment: Attachment): string {
  const name = attachment.original_name || ''
  const dot = name.lastIndexOf('.')
  if (dot > 0 && dot < name.length - 1) {
    return name.slice(dot + 1).toUpperCase()
  }
  const slash = attachment.mime_type.indexOf('/')
  if (slash > 0 && slash < attachment.mime_type.length - 1) {
    return attachment.mime_type.slice(slash + 1).toUpperCase()
  }
  return 'FILE'
}

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
</script>

<template>
  <div class="post-body">
    <template v-for="(block, blockIndex) in blocks" :key="blockIndex">
      <span v-if="block.kind === 'gap'" class="post-gap">{{ block.eol }}</span>
      <!-- Код — отдельным блоком: подложка, кромка, моноширинный набор.
           Маркеры ограждения остаются в DOM (текст поста дословен), но
           начертанием не видны — их дело быть разметкой, а не текстом. -->
      <pre
        v-else-if="block.kind === 'code'"
        class="post-block post-code"
        data-testid="post-code"
      ><code><template v-for="(line, lineIndex) in block.lines" :key="lineIndex"><span
          v-if="line.fence"
          class="post-code__fence"
          aria-hidden="true"
          >{{ lineText(line) }}</span
        ><span v-else class="post-code__line">{{ lineText(line) }}</span><span
          v-if="line.eol"
          class="post-code__eol"
          >{{ line.eol }}</span
        ></template></code></pre>
      <div
        v-else
        class="post-block"
        :class="block.kind === 'quote' ? 'post-quote' : 'post-paragraph'"
        :data-testid="block.kind === 'quote' ? 'greentext' : undefined"
      >
        <template v-for="(line, lineIndex) in block.lines" :key="lineIndex">
          <span class="post-line">
            <span
              v-if="line.marker"
              class="post-quote__marker"
              aria-hidden="true"
              >{{ line.marker }}</span
            >
            <template v-for="(token, tokenIndex) in line.tokens" :key="tokenIndex">
              <span v-if="token.type === 'text'">
                <template
                  v-for="(segment, segmentIndex) in highlightSegments(token.value)"
                  :key="segmentIndex"
                >
                  <mark v-if="segment.hit" class="post-highlight">{{
                    segment.text
                  }}</mark>
                  <template v-else>{{ segment.text }}</template>
                </template>
              </span>
              <a
                v-else
                class="post-link react-ink"
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
      class="post-attachment react-lift--quiet react-press--flat"
      :data-testid="`post-attachment-${index}`"
      :aria-label="`Открыть вложение ${attachment.original_name || index + 1}`"
      @click="openLightbox(index)"
    >
      <template v-if="isImage(attachment.mime_type)">
        <img
          class="post-attachment__img"
          :src="attachment.url"
          :alt="attachment.original_name"
          :width="attachment.width ?? undefined"
          :height="attachment.height ?? undefined"
          loading="lazy"
        />
        <div class="post-attachment__meta">
          <span v-if="attachment.original_name" class="post-attachment__name">{{
            attachment.original_name
          }}</span>
          <span class="post-attachment__size">{{ formatSize(attachment.size) }}</span>
          <span
            v-if="formatDimensions(attachment)"
            class="post-attachment__dimensions"
            >{{ formatDimensions(attachment) }}</span
          >
        </div>
      </template>
      <div v-else class="post-attachment__file-info">
        <span class="post-attachment__glyph" aria-hidden="true">
          <NetworkIcon name="attach" :size="16" />
        </span>
        <span class="post-attachment__file-text">
          <span class="post-attachment__name">{{
            attachment.original_name || `вложение.${fileExtension(attachment)}`
          }}</span>
          <span class="post-attachment__size">{{ formatSize(attachment.size) }}</span>
        </span>
      </div>
    </button>
  </div>

  <AttachmentLightbox
    v-model="lightboxOpen"
    :attachments="attachments"
    :start-index="lightboxIndex"
  />
</template>

<style scoped>
.post-body {
  max-width: 65ch;
  overflow-wrap: anywhere;
  line-height: 1.6;
  color: var(--ink, #1c1a14);
  font-family: var(--font-body, 'Inter', sans-serif);
  font-size: 1rem;
}

.post-block:not(:last-child) {
  margin-bottom: var(--space-5);
}

.post-line {
  display: block;
  white-space: pre-wrap;
  text-wrap: pretty;
}

/* Цитата — только чтение: у цитат нет появления и нет реакции,
   иначе цитируемое перестаёт быть тихим. Цитата читается как блок:
   отступ, кромка акцентом и подложка — «>» в начале строки был служебным
   знаком, а теперь это тихая типографская метка, а не мусор в тексте. */
.post-quote {
  padding: var(--space-2) var(--space-4);
  border-left: 2px solid var(--accent, #2f4f4e);
  background: var(--paper-sunken, #f7f3e8);
  color: var(--ink-secondary, #5b5547);
  font-style: italic;
}

.post-quote__marker {
  margin-right: 0.35em;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.85em;
  font-style: normal;
  color: var(--ink-tertiary, #8a8273);
  letter-spacing: 0;
}

/* Код — лист с подложкой и кромкой: моноширинный набор, никакого
   ограждения в тексте. Длинная строка уезжает вбок, а не ломает
   соседние абзацы. */
.post-code {
  margin: 0;
  padding: var(--space-3);
  overflow-x: auto;
  background: var(--paper-sunken, #f7f3e8);
  border: 1px solid var(--rule, #d4ceb8);
  border-left: 2px solid var(--ink-tertiary, #8a8273);
  border-radius: 0;
  color: var(--ink, #1c1a14);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.875rem;
  line-height: 1.6;
  tab-size: 2;
}

.post-code code {
  font: inherit;
}

/* Ограждение — разметка, а не текст поста: в DOM оно остаётся (текст
   дословен), но глазом не читается. */
.post-code__fence {
  display: none;
}

/* Ссылка на пост: чтение, а не украшение. Чернильный след проступает
   от левого края — сама бумага отмечает, куда ведёт ссылка. */
.post-link {
  color: var(--accent, #2f4f4e);
  text-decoration: none;
  font-family: var(--font-body, 'Inter', sans-serif);
  font-size: 1em;
  transition: color var(--motion-hover);
}

.post-link:hover {
  color: var(--accent-hover, #244140);
}

.post-link:focus-visible {
  outline: 2px solid var(--accent, #2f4f4e);
  outline-offset: 2px;
}

.post-quote .post-link:hover,
.post-quote .post-link:focus-visible {
  color: var(--accent-hover, #244140);
}

/* Мёртвая ссылка — не след: её некуда вести, чернил не будет. */
.post-link--dead {
  color: var(--ink-tertiary, #8a8273);
  cursor: default;
}

.post-link--dead::after {
  display: none;
}

.post-link--dead:hover,
.post-link--dead:focus-visible {
  color: var(--ink-tertiary, #8a8273);
}

.post-link--quoted {
  color: var(--ink, #1c1a14);
  animation: post-link-quoted var(--motion-cinematic);
}

@keyframes post-link-quoted {
  0% {
    background: var(--paper-sunken, #f7f3e8);
  }
  100% {
    background: transparent;
  }
}

.post-highlight {
  background: var(--paper-sunken, #f7f3e8);
  color: var(--ink, #1c1a14);
  border-radius: 0;
  padding: 0 1px;
}

/**
 * Mosaic: one tile per grid cell, so three or more attachments read as a
 * field of thumbnails instead of a cramped row. `auto-fill` collapses the
 * grid to a single column on a 320px screen without a media query.
 */
.post-attachments {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  justify-items: start;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

/* Вложение — лист бумаги: кромка ловит свет, нажатие вдавливает плитку.
   Плитка крупная (четверть экрана), поэтому тень не пересчитывается
   каждый кадр: материальный слой берёт тихую реакцию — только кромка. */
.post-attachment {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 240px;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  text-align: left;
  background: var(--paper-raised, #eae4d4);
  border: 1px solid var(--rule, #d4ceb8);
  border-radius: 0;
  cursor: zoom-in;
  font: inherit;
}

/* Превью показывает картинку целиком: `contain` в рамке 16:9 не режет
   содержимое (обрезка молча теряла данные — половину скриншота). */
.post-attachment__img {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 240px;
  object-fit: contain;
  background: var(--paper-sunken, #f7f3e8);
}

.post-attachment__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--ink-tertiary, #8a8273);
}

.post-attachment__name {
  color: var(--ink-secondary, #5b5547);
  overflow-wrap: anywhere;
}

.post-attachment__file-info {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
}

.post-attachment__glyph {
  display: grid;
  place-items: center;
  flex: none;
  color: var(--ink-secondary, #5b5547);
}

.post-attachment__file-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--ink-tertiary, #8a8273);
}

@media (prefers-reduced-motion: reduce) {
  .post-link {
    transition: none;
  }

  .post-link--quoted {
    animation: none;
    background: var(--paper-sunken, #f7f3e8);
  }
}
</style>

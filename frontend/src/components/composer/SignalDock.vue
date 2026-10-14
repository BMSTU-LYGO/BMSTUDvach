<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import type { NewPostInput } from '@/types'
import { useDraft } from '@/composables/useDraft'
import { useIdentity } from '@/composables/useIdentity'
import { useQuoteInsert } from '@/composables/useQuoteInsert'
import { parsePostLinks } from '@/composables/usePostLinks'
import SignalSurface from './SignalSurface.vue'
import AttachmentRail from './AttachmentRail.vue'
import IdentityCapsule from './IdentityCapsule.vue'
import CommandLens, { type LensCommand } from './CommandLens.vue'
import DraftBeacon from './DraftBeacon.vue'
import SignalMeter from './SignalMeter.vue'
import TransmitControl from './TransmitControl.vue'
import NetworkIcon from './NetworkIcon.vue'

const MAX_BODY = 20000
// Must mirror the backend allow-list exactly (SEC-01): image/* would let
// the file picker offer SVG, which the API rejects on magic bytes.
const ACCEPTED = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain'
const MAX_FILES = 4
const MAX_SIZE = 10 * 1024 * 1024

/**
 * SIGNAL DOCK (SIGNAL-03..12) — the persistent transmission station.
 *
 * Not an accordion. The textarea always exists; focus expands the working
 * surface upward, the action rail stays put. The dock never clears itself:
 * it emits intent, the parent awaits the API and answers with
 * successToken / submitError (SIGNAL-01 contract).
 */
const props = defineProps<{
  threadId: number
  replyContext?: { postId: number } | null
  submitting?: boolean
  submitError?: string | null
  successToken?: number
}>()

const emit = defineEmits<{
  submit: [input: NewPostInput]
  focus: []
  blur: []
  'clear-context': []
  'locate-context': []
}>()

const body = ref('')
const files = ref<File[]>([])
const error = ref('')
const expanded = ref(false)
const lensOpen = ref(false)
const lensFilter = ref('')
const helpOpen = ref(false)
const dragDepth = ref(0)
const sage = ref(false)
const previewOpen = ref(false)

const surfaceRef = ref<InstanceType<typeof SignalSurface> | null>(null)
const railRef = ref<InstanceType<typeof AttachmentRail> | null>(null)
const lensRef = ref<InstanceType<typeof CommandLens> | null>(null)

const { draft, hasDraft, status, savedAt, saveDraft, clearDraft } = useDraft(`signal-${props.threadId}`)
const identity = useIdentity()

// QUOTE-01: clicks on `>>id` in post bodies land in this draft.
const { watchQuotes } = useQuoteInsert()
const stopQuotes = watchQuotes(body, props.threadId, () => {
  expanded.value = true
  void nextTick(() => surfaceRef.value?.focus())
})
onUnmounted(stopQuotes)

const previewTokens = computed(() => parsePostLinks(body.value))

// The session tag mirrors the stored identity: the display half of
// «Имя#секрет», or the honest default when no name is saved.
const identityDisplay = computed(
  () => identity.name.value.split('#')[0].trim() || 'ANON',
)

const canSubmit = computed(
  () => body.value.trim().length > 0 && body.value.length <= MAX_BODY && !props.submitting,
)

// Restore a buffered draft silently — no "restore?" modal.
onMounted(() => {
  if (hasDraft.value && draft.value) {
    body.value = draft.value.body
    if (body.value.trim()) expanded.value = true
  }
})

// Reply context → prefix >>id and take focus.
watch(
  () => props.replyContext?.postId,
  (postId) => {
    if (!postId) return
    if (!body.value.split('\n')[0].includes(`>>${postId}`)) {
      body.value = `>>${postId}\n${body.value}`
    }
    expanded.value = true
    void nextTick(() => surfaceRef.value?.focus())
  },
  { immediate: true },
)

// Draft buffer: write while typing, clear when empty.
watch(body, (value) => {
  if (value.trim().length > 0) saveDraft(value)
  else if (hasDraft.value) clearDraft()
})

// Parent-controlled API lifecycle (SIGNAL-01).
watch(
  () => props.successToken,
  (n, o) => {
    if (n === undefined || n === o) return
    resetAfterSuccess()
  },
)

const transmitErrorToken = ref(0)
watch(
  () => props.submitError,
  (message) => {
    error.value = message ?? ''
    if (message) transmitErrorToken.value++
  },
)

function resetAfterSuccess() {
  body.value = ''
  files.value = []
  error.value = ''
  sage.value = false
  previewOpen.value = false
  expanded.value = false
  lensOpen.value = false
  helpOpen.value = false
  clearDraft()
}

function focusSurface() {
  surfaceRef.value?.focus()
}

function onSurfaceFocus() {
  expanded.value = true
  emit('focus')
}

function onSurfaceBlur() {
  if (body.value.trim() || files.value.length || lensOpen.value || helpOpen.value) return
  expanded.value = false
  emit('blur')
}

function submit() {
  if (!canSubmit.value) return
  error.value = ''
  const name = identity.name.value.trim()
  emit('submit', {
    body: body.value,
    attachments: files.value,
    sage: sage.value,
    ...(name ? { name } : {}),
  })
}

function clearAll() {
  body.value = ''
  files.value = []
  error.value = ''
  clearDraft()
}

function clearContext() {
  if (props.replyContext) {
    const prefix = `>>${props.replyContext.postId}\n`
    if (body.value.startsWith(prefix)) body.value = body.value.slice(prefix.length)
  }
  emit('clear-context')
}

const commands: LensCommand[] = [
  {
    id: 'attach',
    label: 'Прикрепить файл',
    hint: 'открыть выбор файлов',
    shortcut: '/attach',
    run: () => railRef.value?.openPicker(),
  },
  {
    id: 'reply',
    label: 'К чему отвечаю',
    hint: 'показать исходный пост',
    shortcut: '/reply',
    run: () => emit('locate-context'),
  },
  {
    id: 'clear',
    label: 'Очистить сигнал',
    hint: 'убрать текст, вложения и буфер',
    shortcut: '/clear',
    run: clearAll,
  },
  {
    id: 'send',
    label: 'Передать',
    hint: 'отправить сообщение',
    shortcut: '/send',
    run: submit,
  },
  {
    id: 'collapse',
    label: 'Свернуть док',
    hint: 'выйти из режима набора',
    shortcut: 'Esc',
    run: () => {
      lensOpen.value = false
      helpOpen.value = false
      if (!body.value.trim()) expanded.value = false
      surfaceRef.value?.blur()
    },
  },
  {
    id: 'sage',
    label: 'Тихий сигнал (SAGE)',
    hint: sage.value ? 'выключить — обычный ответ' : 'включить — без подъёма треда',
    shortcut: '/sage',
    run: () => {
      sage.value = !sage.value
    },
  },
  {
    id: 'preview',
    label: 'Предпросмотр',
    hint: 'как сигнал появится в треде',
    shortcut: '/preview',
    run: () => {
      previewOpen.value = !previewOpen.value
    },
  },
  {
    id: 'help',
    label: 'Горячие клавиши',
    hint: 'показать подсказки',
    shortcut: '/help',
    run: () => {
      helpOpen.value = !helpOpen.value
    },
  },
]

function openLens(filter = '') {
  lensFilter.value = filter
  lensOpen.value = true
}

function onSurfaceKeydown(e: KeyboardEvent) {
  const meta = e.ctrlKey || e.metaKey

  // While the lens is open it owns the keyboard.
  if (lensOpen.value) {
    if (e.key === 'Escape') {
      e.preventDefault()
      lensOpen.value = false
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
      lensRef.value?.onKeydown(e)
      return
    }
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (!lensFilter.value) lensOpen.value = false
      else lensFilter.value = lensFilter.value.slice(0, -1)
      return
    }
    if (e.key.length === 1 && !meta) {
      e.preventDefault()
      lensFilter.value += e.key
      return
    }
    return
  }

  if (meta && e.key === 'Enter') {
    e.preventDefault()
    submit()
    return
  }
  if (meta && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    openLens()
    return
  }
  if (e.key === 'Escape') {
    if (helpOpen.value) helpOpen.value = false
    else if (!body.value.trim() && !files.value.length) {
      expanded.value = false
      emit('blur')
    }
    return
  }
  // `/` at the very start opens the Command Lens in place.
  if (e.key === '/' && body.value.length === 0) {
    e.preventDefault()
    openLens()
  }
}

// Whole-dock intake surface: drag files anywhere over the dock.
function onDragEnter(e: DragEvent) {
  e.preventDefault()
  dragDepth.value++
}
function onDragOver(e: DragEvent) {
  e.preventDefault()
}
function onDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  dragDepth.value = 0
  if (e.dataTransfer?.files?.length) railRef.value?.addFiles(e.dataTransfer.files)
}

// Clipboard files take the same Cargo Rail path as picker and drop: one
// validate, one 4-file limit, one error surface. Plain text falls through
// untouched — the textarea keeps its native paste.
function onPaste(e: ClipboardEvent) {
  if (props.submitting) return
  const pasted = e.clipboardData?.files
  if (!pasted || pasted.length === 0) return
  e.preventDefault()
  const railMounted = railRef.value !== null
  if (!railMounted) expanded.value = true
  const intake = () => railRef.value?.addFiles(pasted)
  if (railMounted) intake()
  else void nextTick(intake)
}

function railError(message: string) {
  error.value = message
}
</script>

<template>
  <div
    class="signal-dock"
    :class="{
      'signal-dock--active': expanded,
      'signal-dock--intake': dragDepth > 0,
      'signal-dock--submitting': submitting,
    }"
    data-testid="signal-dock"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @paste="onPaste"
  >
    <!-- expanding stack: context node, cargo rail, notices -->
    <div class="signal-dock__stack">
      <div v-if="replyContext" class="signal-dock__context" data-testid="reply-context">
        <button
          type="button"
          class="context-node"
          :aria-label="`Показать пост #${replyContext.postId}`"
          @click="emit('locate-context')"
        >
          <span class="context-node__glyph" aria-hidden="true">↳</span>
          <span class="context-node__id">#{{ replyContext.postId }}</span>
        </button>
        <button
          type="button"
          class="context-remove"
          aria-label="Убрать контекст ответа"
          @click="clearContext"
        >
          <NetworkIcon name="close" :size="12" :stroke-width="2" />
        </button>
      </div>

      <AttachmentRail
        v-if="expanded || files.length"
        ref="railRef"
        v-model:files="files"
        :accepted="ACCEPTED"
        :max-files="MAX_FILES"
        :max-size="MAX_SIZE"
        @error="railError"
      />

      <Transition name="notice">
        <p v-if="error" class="signal-dock__error" role="alert" data-testid="dock-error">
          {{ error }}
        </p>
      </Transition>
    </div>

    <!-- persistent main row: always writable, no expand click needed -->
    <div class="signal-dock__main" @pointerdown="focusSurface">
      <span v-if="sage" class="signal-dock__sage" data-testid="sage-marker" title="Тихий сигнал">
        <NetworkIcon name="sage" :size="12" />
      </span>
      <span class="signal-dock__identity" aria-hidden="true">
        <span class="signal-dock__dot" :class="{ 'signal-dock__dot--live': expanded }"></span>
        {{ identityDisplay }}
        <span class="signal-dock__thread">/#{{ threadId }}</span>
      </span>
      <SignalSurface
        ref="surfaceRef"
        v-model="body"
        :gutter="replyContext ? `R:#${replyContext.postId}` : 'TX'"
        :placeholder="expanded ? '' : 'передать сообщение…'"
        :max-length="MAX_BODY"
        :invalid="!!error"
        @keydown="onSurfaceKeydown"
        @focus="onSurfaceFocus"
        @blur="onSurfaceBlur"
      />
    </div>

    <!-- identity capsule: optional «Имя#секрет», kept on the device -->
    <div class="signal-dock__identity-row">
      <IdentityCapsule
        :model-value="identity.name.value"
        @update:model-value="identity.setName"
        @change="identity.setName"
      />
    </div>

    <!-- expanding stack: context node, cargo rail, notices, preview -->
    <div v-if="previewOpen && body.length > 0" class="dock-preview" data-testid="dock-preview">
      <span class="dock-preview__kicker">предпросмотр сигнала</span>
      <div class="dock-preview__body">
        <template v-for="(token, i) in previewTokens" :key="i">
          <span v-if="token.type === 'text'">{{ token.value }}</span>
          <span v-else class="dock-preview__link">&gt;&gt;{{ token.id }}</span>
        </template>
      </div>
      <span class="dock-preview__meta">
        {{ sage ? 'тихий сигнал (sage)' : 'обычный ответ' }} · вложений: {{ files.length }}
      </span>
    </div>

    <!-- action rail: stable at the bottom -->
    <div class="signal-dock__rail">
      <button
        v-if="expanded"
        type="button"
        class="rail-action"
        aria-label="Прикрепить файлы"
        @click="railRef?.openPicker()"
      >
        <NetworkIcon name="attach" :size="16" />
        <span class="rail-action__label">файлы</span>
      </button>
      <button
        v-if="expanded"
        type="button"
        class="rail-action"
        :class="{ 'rail-action--active': previewOpen }"
        :aria-pressed="previewOpen"
        aria-label="Предпросмотр сообщения"
        @click="previewOpen = !previewOpen"
      >
        <NetworkIcon name="eye" :size="16" />
        <span class="rail-action__label">предпросмотр</span>
      </button>
      <button
        v-if="expanded"
        type="button"
        class="rail-action"
        :class="{ 'rail-action--sage': sage }"
        :aria-pressed="sage"
        aria-label="Тихий сигнал (SAGE): ответ без подъёма треда"
        @click="sage = !sage"
      >
        <NetworkIcon name="sage" :size="16" />
        <span class="rail-action__label">sage</span>
      </button>
      <button
        v-if="expanded"
        type="button"
        class="rail-action"
        aria-label="Открыть команды"
        @click="openLens()"
      >
        <NetworkIcon name="command" :size="16" />
        <span class="rail-action__label">/ команды</span>
      </button>

      <DraftBeacon :state="status" :saved-at="savedAt" />

      <span class="signal-dock__spacer"></span>

      <SignalMeter
        v-if="body.length > 0"
        :current="body.length"
        :max="MAX_BODY"
        error-label="превышен лимит сигнала"
      />
      <kbd v-if="expanded" class="signal-dock__hint" aria-hidden="true">⌘↵</kbd>
      <TransmitControl
        :disabled="!canSubmit"
        :submitting="submitting"
        :ready="canSubmit"
        :success-token="successToken"
        :error-token="transmitErrorToken"
        @transmit="submit"
      />
    </div>

    <CommandLens
      ref="lensRef"
      :open="lensOpen"
      :filter="lensFilter"
      :commands="commands"
      @close="lensOpen = false"
    />

    <Transition name="notice">
      <div v-if="helpOpen" class="signal-dock__help" data-testid="dock-help">
        <span><kbd>⌘↵</kbd> отправить</span>
        <span><kbd>⌘K</kbd> команды</span>
        <span><kbd>/</kbd> команды</span>
        <span><kbd>Esc</kbd> свернуть</span>
      </div>
    </Transition>

    <div v-if="dragDepth > 0" class="signal-dock__intake" aria-hidden="true">
      <span class="signal-dock__intake-label">перетащите файл</span>
    </div>
  </div>
</template>

<style scoped>
.signal-dock {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  background: var(--paper-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  transition:
    border-color 220ms var(--ease-out-quart),
    box-shadow 260ms var(--ease-out-quart),
    transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.signal-dock--active {
  border-color: color-mix(in oklab, var(--accent) 35%, transparent);
  box-shadow: var(--shadow-md);
}

.signal-dock--intake {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

/* expanding stack — morphs upward, no dropdown arrow, no v-if accordion */
.signal-dock__stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-height 320ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 220ms var(--ease-out-quart);
}

.signal-dock--active .signal-dock__stack {
  max-height: 46vh;
  opacity: 1;
}

/* post preview */
.dock-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px dashed var(--rule);
  border-radius: var(--radius-md);
}

.dock-preview__kicker {
  font-family: var(--font-body);
  font-size: 0.64rem;
  color: var(--ink-tertiary);
}

.dock-preview__body {
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--ink);
  white-space: pre-wrap;
  max-height: 180px;
  overflow-y: auto;
}

.dock-preview__link {
  color: var(--accent);
  font-family: var(--font-body);
  font-size: 0.86em;
}

.dock-preview__meta {
  font-family: var(--font-body);
  font-size: 0.64rem;
  color: var(--ink-tertiary);
}

.signal-dock__sage {
  display: grid;
  place-items: center;
  color: var(--ink-tertiary);
  padding-top: 0.35rem;
  flex-shrink: 0;
}

/* reply context node */
.signal-dock__context {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.context-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 2px 0;
  cursor: pointer;
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 0.74rem;
  letter-spacing: 0.04em;
}

.context-node__glyph {
  color: var(--ink-tertiary);
}

.context-remove {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--ink-tertiary);
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.context-remove:hover {
  color: var(--ink);
}

/* main row */
.signal-dock__main {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-height: 34px;
}

.signal-dock__identity {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding-top: 0.45rem;
  font-family: var(--font-body);
  font-size: 0.66rem;
  color: var(--ink-tertiary);
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
}

.signal-dock__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid var(--ink-tertiary);
  transition: all 220ms var(--ease-out-quart);
}

.signal-dock__dot--live {
  background: var(--accent);
  border-color: var(--accent);
}

.signal-dock__thread {
  color: var(--ink-tertiary);
  opacity: 0.7;
}

.signal-dock--active .signal-dock__identity {
  color: var(--ink-secondary);
}

/* identity capsule row (TRIP-01) */
.signal-dock__identity-row {
  display: flex;
  min-height: 44px;
}

/* action rail */
.signal-dock__rail {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
}

.signal-dock__spacer {
  flex: 1;
}

.rail-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 10px;
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: var(--ink-tertiary);
  cursor: pointer;
  font-size: 0.74rem;
  transition: color 160ms, background 160ms;
}

.rail-action:hover {
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 8%, transparent);
}

.rail-action--active,
.rail-action[aria-pressed='true'] {
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 10%, transparent);
}

.rail-action--sage {
  color: var(--ink-tertiary);
}

.rail-action__label {
  font-family: var(--font-body);
  font-size: 0.68rem;
}

.signal-dock__hint {
  font-family: var(--font-body);
  font-size: 0.64rem;
  color: var(--ink-tertiary);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 2px 6px;
}

/* error notice */
.signal-dock__error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--danger);
}

/* help popover */
.signal-dock__help {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--border-subtle);
  font-size: 0.74rem;
  color: var(--ink-secondary);
}

.signal-dock__help kbd {
  font-family: var(--font-body);
  font-size: 0.66rem;
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 1px 5px;
  margin-right: 4px;
}

/* drag intake veil */
.signal-dock__intake {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: color-mix(in oklab, var(--paper) 88%, transparent);
  border-radius: var(--radius-lg);
  z-index: 20;
}

.signal-dock__intake-label {
  font-family: var(--font-body);
  font-size: 0.74rem;
  color: var(--accent);
  animation: intake-pulse 1.2s ease-in-out infinite;
}

@keyframes intake-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

/* transitions */
.notice-enter-active,
.notice-leave-active {
  transition: opacity 180ms var(--ease-out-quart);
}
.notice-enter-from,
.notice-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .signal-dock {
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .rail-action__label {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .signal-dock,
  .signal-dock__stack,
  .signal-dock__dot,
  .signal-dock__intake-label {
    transition: none;
    animation: none;
  }
}
</style>

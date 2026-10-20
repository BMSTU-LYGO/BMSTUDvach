<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import type { NewPostInput } from '@/types'
import type { TransmitError } from '@/api/errors'
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
import TransmitNotice from './TransmitNotice.vue'
import NetworkIcon from './NetworkIcon.vue'
// type-only: the dock is the fiber's target, and both halves of the reply
// link must agree on what the link is doing (P3-T1c)
import type { FiberLinkState } from './ContextFiber.vue'

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
 * successToken / error (SIGNAL-01 contract).
 *
 * The rail is a node row, not a toolbar (P3-T1b): the four identical
 * text-and-icon pills it used to carry are gone. What the dock can do is
 * reachable from three authored places instead —
 *  - the **lens node** (round, its diaphragm opens on hover) and the
 *    Command Lens it drives (⌘K / `/`): attach, send, sage, preview, help;
 *  - the **SAGE relay** on the identity string: a gauge of five ticks with
 *    a lever that throws amber when the reply stops bumping the thread;
 *  - the **preview corner node**: a tiny glyph pinned in the corner of the
 *    writing surface.
 *
 * Failures come in two flavours and are rendered by two different nodes,
 * because they are two different kinds of truth:
 *  - `props.error: TransmitError` — the API refusal, already classified by
 *    `classifyError` in the parent's `useTransmit`. Rendered by the shared
 *    `TransmitNotice`, countdown and «повторить» included; the retry
 *    bubbles out as `@retry` so the parent replays the very same attempt.
 *    Because the notice lives in the expanding stack, a fresh refusal also
 *    opens the dock — a failure the reader cannot see is worse than none.
 *  - the local `railError` string — the Cargo Rail validating files it
 *    never sent anywhere. That one stays the plain line it always was.
 *
 * SPATIAL DOCK (P3-T1c) — the answer is a place, not a strip under the
 * thread. The dock is a SHEET of paper (--paper-raised ground, one hairline
 * rule, sharp edges, no card shadow) — the same surface family as the
 * Launch Bay and the Report Probe. On a wide screen the sheet anchors to
 * the left edge of the reader as a positioned column; on a small one it
 * stays the bottom sheet. And it is a node on the reply wire: the leading
 * edge carries the ContextFiber's accent (the section owns the shared
 * `--link-*` tokens), and burns firmer the closer the reader scrolls to
 * the post being answered — opacity only, nothing ever moves.
 */
const props = defineProps<{
  threadId: number
  replyContext?: { postId: number; source?: HTMLElement | null } | null
  submitting?: boolean
  error?: TransmitError | null
  successToken?: number
  /** What the reply link is doing, as published by the ContextFiber. */
  linkState?: FiberLinkState
}>()

const emit = defineEmits<{
  submit: [input: NewPostInput]
  retry: []
  focus: []
  blur: []
  'clear-context': []
  'locate-context': []
}>()

const body = ref('')
const files = ref<File[]>([])
/** Local rail-only failure (file validation) — never an API refusal. */
const railError = ref('')
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

const { draft, hasDraft, hasRestoredFiles, status, savedAt, saveDraft, clearDraft } =
  useDraft(`signal-${props.threadId}`)
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
  () =>
    body.value.trim().length > 0 && body.value.length <= MAX_BODY && !props.submitting,
)

// A field is marked invalid by either flavour of failure: the API refused
// the signal, or the rail refused a file that belongs to it.
const invalid = computed(() => Boolean(props.error) || Boolean(railError.value))

// Restore a buffered draft silently — no "restore?" modal. The cargo is
// not in the buffer (the browser cannot hold files across reloads), so the
// honest note names it: text back, attachments to re-lay.
const restoredCargo = ref(0)
const restoringDraft = ref(false)
const cargoWord = computed(() => {
  const n = restoredCargo.value
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'файл'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'файла'
  return 'файлов'
})
onMounted(() => {
  if (hasDraft.value && draft.value) {
    restoringDraft.value = true
    body.value = draft.value.body
    if (body.value.trim()) expanded.value = true
    if (hasRestoredFiles.value) restoredCargo.value = draft.value.files?.length ?? 0
    void nextTick(() => {
      restoringDraft.value = false
    })
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

// Draft buffer: write while typing, clear when empty. The file list goes
// along as metadata (name/size) — the honest signal for the restore note.
watch([body, files], () => {
  // The restore spill itself must not rewrite the buffer it just read.
  if (restoringDraft.value) return
  if (body.value.trim().length > 0 || files.value.length > 0) {
    saveDraft({ body: body.value, files: files.value })
    if (restoredCargo.value) restoredCargo.value = 0
  } else {
    if (hasDraft.value) clearDraft()
    // An empty signal has nothing to preview: the corner node never sits
    // pressed on an empty canvas.
    if (previewOpen.value) previewOpen.value = false
    restoredCargo.value = 0
  }
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

/**
 * The classified refusal drives two things at once:
 *  - the transmit ring's broken-ring feedback — bump on every fresh failure,
 *    exactly as the old string did;
 *  - the dock's own expansion. The notice lives in the expanding stack, so a
 *    collapsed dock would fold the failure away and the reader would never
 *    learn the signal was refused (P3-T1b).
 */
watch(
  () => props.error,
  (err, prev) => {
    if (err && err !== prev) transmitErrorToken.value++
    if (err) expanded.value = true
  },
)

function resetAfterSuccess() {
  body.value = ''
  files.value = []
  railError.value = ''
  restoredCargo.value = 0
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
  if (body.value.trim() || files.value.length || lensOpen.value || helpOpen.value)
    return
  // A refusal in the stack is not something a blur may fold away — it stays
  // open until it is retried or the dock is collapsed on purpose.
  if (props.error || railError.value) return
  expanded.value = false
  emit('blur')
}

function submit() {
  if (!canSubmit.value) return
  railError.value = ''
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
  railError.value = ''
  restoredCargo.value = 0
  clearDraft()
}

/**
 * P3-T1b — the two duties of the old rail pills live outside the rail now:
 * SAGE is a physical relay on the dock's identity string, preview is a tiny
 * node pinned in the corner of the writing surface. Both keep one state each
 * and both are announced (role=switch / aria-pressed).
 */
function toggleSage() {
  sage.value = !sage.value
}

function togglePreview() {
  previewOpen.value = !previewOpen.value
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
    run: () => {
      // P3-T1b — the rail carries no attach button any more, so the lens is
      // the only road to files. The Cargo Rail exists only while the dock is
      // open, armed or loaded: open the dock first, then the picker.
      if (railRef.value) {
        railRef.value.openPicker()
        return
      }
      expanded.value = true
      void nextTick(() => railRef.value?.openPicker())
    },
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
      closeLens()
      helpOpen.value = false
      // the same rule as Escape on the surface: a refusal keeps the dock open
      if (!body.value.trim() && !props.error && !railError.value) expanded.value = false
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
  // The lens has no input of its own: the writing surface owns its keyboard
  // (typing to filter, arrows, ↵, Escape). Opening it from the node — a
  // click, not a keystroke — therefore hands the floor to the surface, so
  // every road into the lens types the same way.
  void nextTick(() => surfaceRef.value?.focus())
}

function closeLens() {
  lensOpen.value = false
  lensFilter.value = ''
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
    else if (
      !body.value.trim() &&
      !files.value.length &&
      // a refusal is not something Escape may fold away either: it stays
      // open until the next attempt clears it
      !props.error &&
      !railError.value
    ) {
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

/**
 * AUTHORED INTAKE (P3-T1a) — there is no dropzone here, and no
 * «перетащите файл» veil. Files are magnetised to the Cargo Rail instead:
 * the dock's leading edge lights with a thin accent line carrying a bead
 * that follows the dragged payload, while the rail stretches and opens one
 * socket per free slot.
 *
 * The pointer position is written into CSS custom properties on the dock
 * root at most once per animation frame (never per dragover event) and
 * consumed by descendants — nothing here reads layout or triggers a
 * re-render of Vue.
 */
const pointer = ref({ x: 0, y: 0 })
let intakeFrame = 0

const rootRef = ref<HTMLElement | null>(null)

/**
 * The reply link (P3-T1c) — the dock is the fiber's target, so it wears the
 * other half of the same marker. `linked` while a source exists; `link-edge`
 * when the fiber has collapsed into its edge indicator because the source
 * left the viewport. Both are classes and one opacity, never a movement.
 */
const linked = computed(() => Boolean(props.linkState) && props.linkState !== 'idle')
const linkEdge = computed(() => props.linkState === 'edge')

const intakeActive = computed(() => dragDepth.value > 0)

function writeIntakePointer() {
  intakeFrame = 0
  const root = rootRef.value
  if (!root) return
  const rect = root.getBoundingClientRect()
  const clamped = Math.min(Math.max(pointer.value.x - rect.left, 0), rect.width || 1)
  root.style.setProperty('--edge-x', `${Math.round(clamped)}px`)

  // Rail-local coordinates: the magnet glow lives on the rail itself.
  const railEl = railRef.value?.$el as HTMLElement | undefined
  if (railEl) {
    const railRect = railEl.getBoundingClientRect()
    const x = Math.round(pointer.value.x - railRect.left)
    const y = Math.round(pointer.value.y - railRect.top)
    root.style.setProperty('--intake-x', `${x}px`)
    root.style.setProperty('--intake-y', `${y}px`)
  }
}

function scheduleIntakeFrame() {
  if (intakeFrame) return
  intakeFrame = requestAnimationFrame(writeIntakePointer)
}

function clearIntakePointer() {
  if (intakeFrame) {
    cancelAnimationFrame(intakeFrame)
    intakeFrame = 0
  }
  rootRef.value?.style.removeProperty('--edge-x')
  rootRef.value?.style.removeProperty('--intake-x')
  rootRef.value?.style.removeProperty('--intake-y')
}

onUnmounted(clearIntakePointer)

// Whole-dock intake surface: drag files anywhere over the dock. The depth
// counter is deliberately clamped: nested child targets fire their own
// dragenter, and a leak would strand the dock in the armed look forever.
function onDragEnter(e: DragEvent) {
  e.preventDefault()
  dragDepth.value = 1
}
function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  pointer.value = { x: e.clientX ?? 0, y: e.clientY ?? 0 }
  scheduleIntakeFrame()
}
function onDragLeave(e: DragEvent) {
  const next = e.relatedTarget as Node | null
  // Leaving into a child of the dock is not leaving the dock.
  if (next && rootRef.value?.contains(next)) return
  dragDepth.value = 0
  clearIntakePointer()
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  dragDepth.value = 0
  clearIntakePointer()
  const dropped = e.dataTransfer?.files
  if (!dropped?.length) return
  if (railRef.value) railRef.value.addFiles(dropped)
  else if (!expanded.value) {
    expanded.value = true
    void nextTick(() => railRef.value?.addFiles(dropped))
  }
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

/** A file the rail refused stays a dock-local line — it never left the app. */
function onRailError(message: string) {
  railError.value = message
}

/**
 * SCROLL PROXIMITY (P3-T1c) — the closer the reader scrolls to the post
 * being answered, the firmer the leading edge burns. One rAF-throttled
 * listener, armed only while there is a source to be near; it writes a
 * single custom property and moves nothing. Reduced motion keeps the
 * proximity (it is only opacity) but drops every transition on it.
 */
const linkSource = computed<HTMLElement | null>(
  () => props.replyContext?.source ?? null,
)

let linkFrame = 0
let linkStrength = -1

function writeLinkProximity() {
  linkFrame = 0
  const src = linkSource.value
  const root = rootRef.value
  if (!src || !root || !src.isConnected) return
  const s = src.getBoundingClientRect()
  const d = root.getBoundingClientRect()
  const vh = window.innerHeight || 1
  // vertical distance between the source post and the sheet; 0 when they meet
  const gap =
    s.bottom < d.top ? d.top - s.bottom : s.top > d.bottom ? s.top - d.bottom : 0
  const strength = Math.max(0, 1 - gap / (vh * 1.6))
  // a hair of movement in the reading does not deserve a style write
  if (Math.abs(strength - linkStrength) < 0.02) return
  linkStrength = strength
  root.style.setProperty('--link-strength', strength.toFixed(3))
}

function scheduleLinkProximity() {
  if (linkFrame) return
  linkFrame = requestAnimationFrame(writeLinkProximity)
}

function stopLinkProximity() {
  if (linkFrame) {
    cancelAnimationFrame(linkFrame)
    linkFrame = 0
  }
  window.removeEventListener('scroll', scheduleLinkProximity)
  window.removeEventListener('resize', scheduleLinkProximity)
}

/** Arms (or disarms) the proximity watch for the current reply source. */
function watchLinkSource(source: HTMLElement | null) {
  stopLinkProximity()
  linkStrength = -1
  if (!source) {
    rootRef.value?.style.removeProperty('--link-strength')
    return
  }
  window.addEventListener('scroll', scheduleLinkProximity, { passive: true })
  window.addEventListener('resize', scheduleLinkProximity)
  writeLinkProximity()
}

watch(linkSource, watchLinkSource, { immediate: true })

// the sheet's own geometry moves when it expands — re-measure the gap
watch(expanded, () => scheduleLinkProximity())

onMounted(() => {
  // a dock mounted straight into a reply re-measures once its root exists
  if (linkSource.value) watchLinkSource(linkSource.value)
})

onUnmounted(stopLinkProximity)
</script>

<template>
  <div
    ref="rootRef"
    class="signal-dock signal-dock--sheet"
    :class="{
      'signal-dock--active': expanded,
      'signal-dock--intake': intakeActive,
      'signal-dock--submitting': submitting,
      'signal-dock--linked': linked,
      'signal-dock--link-edge': linkEdge,
    }"
    :data-link="linkState ?? 'idle'"
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
          class="context-node react-ink"
          :aria-label="`Показать пост #${replyContext.postId}`"
          @click="emit('locate-context')"
        >
          <span class="context-node__glyph" aria-hidden="true">↳</span>
          <span class="context-node__id">#{{ replyContext.postId }}</span>
        </button>
        <button
          type="button"
          class="context-remove react-press"
          aria-label="Убрать контекст ответа"
          @click="clearContext"
        >
          <NetworkIcon name="close" :size="12" :stroke-width="2" />
        </button>
      </div>

      <AttachmentRail
        v-if="expanded || files.length || intakeActive"
        ref="railRef"
        v-model:files="files"
        :accepted="ACCEPTED"
        :max-files="MAX_FILES"
        :max-size="MAX_SIZE"
        :armed="intakeActive"
        @error="onRailError"
      />

      <!-- API refusal: the classified notice, with its own countdown/retry.
           Wrapped only so the dock keeps its `dock-error` testid; the node
           itself carries role="alert". -->
      <div v-if="error" class="signal-dock__api-error" data-testid="dock-error">
        <TransmitNotice :error="error" @retry="emit('retry')" />
      </div>

      <!-- Local rail refusal: one plain line, as it has always been. -->
      <Transition name="notice">
        <p
          v-if="railError"
          class="signal-dock__error"
          role="alert"
          data-testid="dock-rail-error"
        >
          {{ railError }}
        </p>
      </Transition>

      <!-- Honest restore: the text is back, the cargo is not — say it once. -->
      <Transition name="notice">
        <p
          v-if="restoredCargo"
          class="signal-dock__restored"
          role="status"
          data-testid="dock-restored"
        >
          текст восстановлен ·
          {{ restoredCargo }} {{ cargoWord }} — приложи заново
        </p>
      </Transition>
    </div>

    <!-- persistent main row: always writable, no expand click needed -->
    <div class="signal-dock__main" @pointerdown="focusSurface">
      <!-- SAGE relay (P3-T1b): the quiet signal is a physical switch on the
           dock's identity string — a gauge of five ticks with a lever that
           throws right, amber, when the reply stops bumping the thread. Not
           a pill in a toolbar row. The marker lights next to it while on. -->
      <span class="dock-sage" :class="{ 'dock-sage--on': sage }">
        <button
          type="button"
          class="dock-sage__relay react-press"
          role="switch"
          :aria-checked="sage"
          aria-label="Тихий сигнал (SAGE)"
          data-testid="sage-switch"
          @click.stop="toggleSage"
          @pointerdown.stop
        >
          <span class="dock-sage__scale" aria-hidden="true">
            <span v-for="tick in 5" :key="tick" class="dock-sage__tick"></span>
          </span>
          <span class="dock-sage__lever" aria-hidden="true"></span>
        </button>
        <span
          v-if="sage"
          class="signal-dock__sage"
          data-testid="sage-marker"
          aria-hidden="true"
          title="Тихий сигнал"
        >
          <NetworkIcon name="sage" :size="12" />
        </span>
      </span>
      <span class="signal-dock__identity" aria-hidden="true">
        <span
          class="signal-dock__dot"
          :class="{ 'signal-dock__dot--live': expanded }"
        ></span>
        {{ identityDisplay }}
        <span class="signal-dock__thread">/#{{ threadId }}</span>
      </span>
      <SignalSurface
        ref="surfaceRef"
        v-model="body"
        :gutter="replyContext ? `R:#${replyContext.postId}` : 'TX'"
        :placeholder="expanded ? '' : 'передать сообщение…'"
        :max-length="MAX_BODY"
        :invalid="invalid"
        @keydown="onSurfaceKeydown"
        @focus="onSurfaceFocus"
        @blur="onSurfaceBlur"
      >
        <!-- preview (P3-T1b): chrome of the canvas itself, pinned in its
             corner — the rail has no room for a fourth pill. -->
        <template #corner>
          <button
            type="button"
            class="dock-preview-toggle react-press"
            :class="{ 'dock-preview-toggle--on': previewOpen }"
            :aria-pressed="previewOpen"
            aria-label="Предпросмотр сообщения"
            data-testid="preview-toggle"
            @click.stop="togglePreview"
            @pointerdown.stop
          >
            <NetworkIcon name="eye" :size="12" :stroke-width="1.7" />
          </button>
        </template>
      </SignalSurface>
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
    <div
      v-if="previewOpen && body.length > 0"
      class="dock-preview"
      data-testid="dock-preview"
    >
      <span class="dock-preview__kicker">предпросмотр сигнала</span>
      <div class="dock-preview__body">
        <template v-for="(token, i) in previewTokens" :key="i">
          <span v-if="token.type === 'text'">{{ token.value }}</span>
          <span v-else class="dock-preview__link">&gt;&gt;{{ token.id }}</span>
        </template>
      </div>
      <span class="dock-preview__meta">
        {{ sage ? 'тихий сигнал (sage)' : 'обычный ответ' }} · вложений:
        {{ files.length }}
      </span>
    </div>

    <!-- action rail: a node row, not a toolbar (P3-T1b).
         left  — the lens node (the one authored door to attach / preview /
                 sage / send) and the draft beacon;
         right — the signal meter (when there is text), the shortcut hint and
                 the transmit ring. No identical text-and-icon pills. -->
    <div class="signal-dock__rail">
      <button
        type="button"
        class="dock-lens react-press"
        aria-label="Команды (⌘K)"
        data-testid="dock-lens"
        @click="openLens()"
        @keydown.escape.stop="closeLens"
      >
        <span class="dock-lens__iris" aria-hidden="true"></span>
        <NetworkIcon name="command" :size="14" :stroke-width="1.8" />
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
      @close="closeLens"
    />

    <Transition name="notice">
      <div v-if="helpOpen" class="signal-dock__help" data-testid="dock-help">
        <span><kbd>⌘↵</kbd> отправить</span>
        <span><kbd>⌘K</kbd> команды</span>
        <span><kbd>/</kbd> команды</span>
        <span><kbd>Esc</kbd> свернуть</span>
      </div>
    </Transition>

    <!-- intake: a thin accent edge line with a bead that follows the dragged
          payload. Reads as the dock's own wiring, not a drop zone. -->
    <div v-if="intakeActive" class="signal-dock__magnet" aria-hidden="true">
      <span class="signal-dock__magnet-bead"></span>
    </div>

    <!-- reply link (P3-T1c): the dock's leading edge is the other end of the
          ContextFiber. Live — the accent line the fiber lands on, burning
          firmer as the reader nears the source (--link-strength, one style
          write per frame). Edge — the source has left the viewport and the
          fiber collapsed into its indicator, so the sheet answers with the
          same solid marker. One wire, drawn from both ends. -->
    <span class="signal-dock__edge" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.signal-dock {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4)
    calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  /* the sheet only ever changes its rule colour — no travel, no shadow */
  transition: border-color var(--motion-hover);
}

/* ── the SHEET (P3-T1c) ───────────────────────────────────────────────────
   Not a card. The dock is a sheet of paper, the same surface family as the
   Launch Bay and the Report Probe: --paper-raised ground, one hairline rule
   around the edges, sharp corners, no drop shadow. Paper carries depth on
   its own — a rounded frame with a shadow would put the sheet back into the
   «floating panel» language the whole family left behind. */
.signal-dock--sheet {
  background: var(--paper-raised);
  border: 1px solid var(--rule);
  border-radius: 0;
}

.signal-dock--active {
  border-color: color-mix(in oklab, var(--accent) 35%, transparent);
}

/* P3-T1a — intake is wiring, not a veil. The leading edge carries one thin
    accent line whose bead tracks the dragged payload (--edge-x, written in
   onDragOver once per frame). No dashed frame, no overlay zone. */
.signal-dock--intake {
  border-color: color-mix(in oklab, var(--accent) 40%, transparent);
}

/* ── the leading edge: the dock's half of the reply link (P3-T1c) ─────────
   The ContextFiber lands exactly here, on the sheet's own edge. While the
   source post is in view the line stays lit and burns firmer with the
   scroll proximity (--link-strength, written once per frame from the rAF
   listener above); when the source has left the viewport the fiber has
   collapsed into its edge indicator and the sheet answers with the same
   solid accent marker and bead. Opacity only — the sheet never moves. */
.signal-dock__edge {
  position: absolute;
  left: -1px;
  top: 0;
  bottom: 0;
  width: 2px;
  opacity: 0;
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    var(--link-accent, var(--accent)) 14%,
    var(--link-accent, var(--accent)) 86%,
    transparent 100%
  );
  transition: opacity var(--motion-hover);
}

.signal-dock--linked .signal-dock__edge {
  opacity: calc(0.45 + 0.55 * var(--link-strength, 0));
}

.signal-dock--link-edge .signal-dock__edge {
  opacity: 0.9;
}

/* the bead the fiber's edge indicator wears on its own side of the link */
.signal-dock--link-edge .signal-dock__edge::after {
  content: '';
  position: absolute;
  top: -2px;
  left: 50%;
  width: 7px;
  height: 7px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: var(--link-accent, var(--accent));
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.signal-dock__magnet {
  position: absolute;
  left: 0;
  right: 0;
  top: -1px;
  height: 1px;
  pointer-events: none;
  background: linear-gradient(
    90deg,
    color-mix(in oklab, var(--accent) 0%, transparent) 0%,
    color-mix(in oklab, var(--accent) 30%, transparent) calc(var(--edge-x, 50%) - 72px),
    var(--accent) var(--edge-x, 50%),
    color-mix(in oklab, var(--accent) 30%, transparent) calc(var(--edge-x, 50%) + 72px),
    color-mix(in oklab, var(--accent) 0%, transparent) 100%
  );
}

.signal-dock__magnet-bead {
  position: absolute;
  top: -3px;
  left: var(--edge-x, 50%);
  width: 20px;
  height: 7px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--accent), transparent);
}

/* expanding stack — morphs upward, no dropdown arrow, no v-if accordion.
   Лист разворачивается характером «появления»: медленно и с уверенным финалом. */
.signal-dock__stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-height var(--motion-reveal) var(--ease-entrance),
    opacity var(--motion-reveal) var(--ease-entrance);
}

.signal-dock--active .signal-dock__stack {
  max-height: 46vh;
  opacity: 1;
}

/* dragging over a collapsed dock still opens the stack: the Cargo Rail is
   the object the payload is being magnetised to, so it must be visible */
.signal-dock--intake .signal-dock__stack {
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

/* the quiet-signal marker that lights beside the relay (P3-T1b) */
.signal-dock__sage {
  display: grid;
  place-items: center;
  color: var(--amber, #d4882a);
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
  transition: color var(--motion-hover);
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
  transition:
    color var(--motion-hover),
    transform var(--motion-press),
    box-shadow var(--motion-press);
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

/* Кромка набора: поле отвечает тихо — волосяная линия под строкой, без
   свечения и без масштаба. Поле живёт в дочернем компоненте, поэтому
   достаём его через :deep. */
.signal-dock :deep(.signal-surface__input) {
  transition: box-shadow var(--motion-hover);
}

.signal-dock--active :deep(.signal-surface__input) {
  box-shadow: inset 0 -1px 0 color-mix(in oklab, var(--accent) 40%, transparent);
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
  /* Точка зажигается — только цвет и кромка, никакой «мусорки» переходов. */
  transition:
    background-color var(--motion-hover),
    border-color var(--motion-hover);
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

/* ── SAGE relay (P3-T1b) ───────────────────────────────────────────────
   A miniature switch in the manner of an instrument relay: a scale of five
   ticks and a lever that rests in the left half, then throws to the right
   and lights amber while the quiet signal is on. The quiet-signal marker
   (NetworkIcon 'sage') lights beside it. */
.dock-sage {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: center;
  flex-shrink: 0;
}

.dock-sage__relay {
  position: relative;
  display: flex;
  align-items: center;
  width: 38px;
  height: 32px;
  padding: 0 3px;
  border: 1px solid transparent;
  border-radius: 16px;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  /* Реле вдавливается под пальцем, а не пружинит: тайминги перечислены
     явно, потому что `transition` не складывается. */
  transition:
    border-color var(--motion-hover),
    transform var(--motion-press),
    box-shadow var(--motion-press);
}

.dock-sage__relay:focus-visible {
  outline: none;
  border-color: color-mix(in oklab, var(--accent) 55%, transparent);
}

.dock-sage__relay:active {
  border-color: var(--accent);
}

/* the scale: five ticks, amber only while the relay is thrown */
.dock-sage__scale {
  position: absolute;
  left: 6px;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}

.dock-sage__tick {
  width: 1px;
  height: 3px;
  background: var(--ink-tertiary);
  opacity: 0.55;
  transition:
    background var(--motion-hover),
    height var(--motion-hover),
    opacity var(--motion-hover);
}

/* the lever: rests in the left half of the scale, throws right when armed */
.dock-sage__lever {
  position: relative;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1px solid var(--ink-tertiary);
  background: var(--paper-raised);
  transform: translateX(0);
  transition:
    transform var(--motion-hover-duration) var(--ease-emphasized),
    border-color var(--motion-hover),
    box-shadow var(--motion-hover);
}

.dock-sage--on .dock-sage__lever {
  transform: translateX(19px);
  border-color: var(--amber, #d4882a);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--amber, #d4882a) 18%, transparent);
}

.dock-sage--on .dock-sage__tick {
  height: 5px;
  background: var(--amber, #d4882a);
  opacity: 0.8;
}

/* ── preview corner node (P3-T1b) ──────────────────────────────────────
   Rendered in the corner slot of the writing surface, so it is chrome of
   the canvas rather than yet another rounded button in the rail. */
.dock-preview-toggle {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ink-tertiary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    color var(--motion-hover),
    background-color var(--motion-hover),
    transform var(--motion-press),
    box-shadow var(--motion-press);
}

.dock-preview-toggle:hover {
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 8%, transparent);
}

.dock-preview-toggle:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--paper-raised),
    0 0 0 3px var(--accent);
}

.dock-preview-toggle--on {
  color: var(--accent);
}

.dock-preview-toggle--on:hover {
  color: var(--accent-hover);
}

/* ── lens node (P3-T1b) ────────────────────────────────────────────────
   The one authored door to what the four rail pills used to do. A round
   node, not a pill: its diaphragm opens outward on hover/focus, the way a
   lens iris does. */
.dock-lens {
  position: relative;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--rule);
  border-radius: 50%;
  background: none;
  color: var(--ink-tertiary);
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
  transition:
    color var(--motion-hover),
    border-color var(--motion-hover),
    transform var(--motion-press),
    box-shadow var(--motion-press);
}

.dock-lens:hover,
.dock-lens:focus-visible {
  color: var(--accent);
  border-color: color-mix(in oklab, var(--accent) 45%, transparent);
}

.dock-lens:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--paper-raised),
    0 0 0 3px var(--accent);
}

/* three concentric rings: the diaphragm. Кольца не растут и не сжимаются —
   они просто проявляются, когда узел оживает. Никакого масштаба. */
.dock-lens__iris,
.dock-lens__iris::before,
.dock-lens__iris::after {
  position: absolute;
  content: '';
  border-radius: 50%;
  border: 1px solid var(--accent);
  opacity: 0;
  transition: opacity var(--motion-hover);
}

.dock-lens__iris {
  inset: -1px;
}

.dock-lens__iris::before {
  inset: -5px;
}

.dock-lens__iris::after {
  inset: -10px;
}

.dock-lens:hover .dock-lens__iris,
.dock-lens:focus-visible .dock-lens__iris {
  opacity: 0.6;
}

.dock-lens:hover .dock-lens__iris::before,
.dock-lens:focus-visible .dock-lens__iris::before {
  opacity: 0.34;
}

.dock-lens:hover .dock-lens__iris::after,
.dock-lens:focus-visible .dock-lens__iris::after {
  opacity: 0.16;
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
/* the API notice draws its own border/ink; the wrapper only anchors it */
.signal-dock__api-error {
  margin: 0;
}

/* rail-only failure (file validation), one plain line */
.signal-dock__error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--danger);
}

.signal-dock__restored {
  margin: 0;
  font-size: 0.78rem;
  color: var(--ink-tertiary, var(--text-muted));
  font-style: italic;
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

/* transitions: появление — характером «появления», уход — в тень */
.notice-enter-active {
  transition: opacity var(--motion-reveal);
}
.notice-leave-active {
  transition: opacity var(--motion-hover-duration) var(--ease-exit);
}
.notice-enter-from,
.notice-leave-to {
  opacity: 0;
}

/* 320px: the rail keeps its shape — the beacon stays a single dot and the
   shortcut hint folds, so node · beacon · meter · ring never wrap. Both
   switch controls stay ≥32px tap targets (P3-T1b). */
@media (max-width: 400px) {
  .signal-dock__rail :deep(.beacon__text) {
    display: none;
  }

  .signal-dock__hint {
    display: none;
  }

  .signal-dock__thread {
    display: none;
  }

  .signal-dock__main {
    gap: var(--space-2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .signal-dock,
  .signal-dock__stack,
  .signal-dock__edge,
  .signal-dock__dot,
  .dock-sage,
  .dock-sage__relay,
  .dock-sage__tick,
  .dock-sage__lever,
  .dock-preview-toggle,
  .dock-lens,
  .dock-lens__iris,
  .dock-lens__iris::before,
  .dock-lens__iris::after,
  .context-node,
  .context-remove {
    transition: none;
    animation: none;
  }
}
</style>

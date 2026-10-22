<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import type { TransmitError } from '@/api/errors'
import type { NewThreadInput } from '@/types'
import { useDraft } from '@/composables/useDraft'
import { useMagnetic } from '@/composables/useMotion'
import SignalSurface from '../composer/SignalSurface.vue'
import AttachmentRail from '../composer/AttachmentRail.vue'
import DraftBeacon from '../composer/DraftBeacon.vue'
import SignalMeter from '../composer/SignalMeter.vue'
import TransmitControl from '../composer/TransmitControl.vue'
import TransmitNotice from '../composer/TransmitNotice.vue'
import NetworkIcon from '../composer/NetworkIcon.vue'

const MAX_TITLE = 200
const MAX_BODY = 20000
// Must mirror the backend allow-list exactly (SEC-01): image/* would let
// the file picker offer SVG, which the API rejects on magic bytes.
const ACCEPTED = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain'
const MAX_FILES = 4
const MAX_SIZE = 10 * 1024 * 1024

// Local check (not useGsap) — the bay must stay testable without GSAP.
function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * LAUNCH BAY (SIGNAL-13..16) — thread creation as a working stage, not a
 * form under a button. The board list recedes, the bay takes the stage,
 * the title is an editorial surface. Same async contract as the Signal
 * Dock: emit intent, the parent runs `useTransmit` and answers with
 * `submitting` / `successToken` / a structured `error` (P1-T4), which
 * this bay renders through TransmitNotice and maps onto its fields.
 *
 * P3-T2 — the bay is a SHEET in the paper/ink language of the dock
 * (--paper-raised ground, --ink letters, --accent threads, one hairline
 * rule), not a dark rounded card. The parent morphs it in from the
 * «Новый тред» trigger (captureMorph/playMorph, 0.45s): the sheet — scene
 * title included — inherits the button's geometry, the trigger itself goes
 * transparent for the flight. `prefers-reduced-motion` skips the morph and
 * shows the sheet at once.
 */
const props = defineProps<{
  boardSlug: string
  submitting?: boolean
  error?: TransmitError | null
  successToken?: number
}>()

const emit = defineEmits<{
  submit: [input: NewThreadInput]
  close: []
  done: []
  retry: []
}>()

const title = ref('')
const body = ref('')
const files = ref<File[]>([])
const launched = ref(false)
// Intake refusals (attachment rail) never leave the bay, so they live in
// their own slot next to the structured API failure.
const localError = ref<TransmitError | null>(null)

const titleRef = ref<HTMLInputElement | null>(null)
// the shared element the parent morphs in from the launch trigger
const sceneTitleRef = ref<HTMLElement | null>(null)
const surfaceRef = ref<InstanceType<typeof SignalSurface> | null>(null)
const railRef = ref<InstanceType<typeof AttachmentRail> | null>(null)
/**
 * The launch control itself — the only magnetic element in the app.
 *
 * The bay is the one place where the user aims at something and commits, so
 * the LAUNCH node is allowed to lean towards the cursor. The pull is small
 * (8px) and dies the moment the cursor leaves: a magnetic button that
 * lunges is a toy, a magnetic button that leans is an instrument.
 */
const launchRef = ref<HTMLElement | null>(null)

// Магнит живёт только здесь: сила 8px, радиус 120px. Сам примитив уже
// выключает себя при reduced-motion, на тач-устройствах и без тонкого
// курсора — здесь ничего дублировать не нужно.
useMagnetic(launchRef, { strength: 8, radius: 120 })

const { draft, hasDraft, hasRestoredFiles, status, savedAt, saveDraft, clearDraft } =
  useDraft(`launch-${props.boardSlug}`)

const canSubmit = computed(
  () =>
    title.value.trim().length > 0 &&
    body.value.trim().length > 0 &&
    title.value.length <= MAX_TITLE &&
    body.value.length <= MAX_BODY &&
    !props.submitting,
)

// Silently restore a buffered draft; focus the title surface. Files are
// metadata-only in the buffer — the note names what must be re-laid.
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
    title.value = draft.value.title || ''
    body.value = draft.value.body
    if (hasRestoredFiles.value) restoredCargo.value = draft.value.files?.length ?? 0
    void nextTick(() => {
      restoringDraft.value = false
    })
  }
  titleRef.value?.focus()
})

watch([title, body, files], () => {
  // The restore spill itself must not rewrite the buffer it just read.
  if (restoringDraft.value) return
  if (
    title.value.trim().length > 0 ||
    body.value.trim().length > 0 ||
    files.value.length > 0
  ) {
    saveDraft({ title: title.value, body: body.value, files: files.value })
    if (restoredCargo.value) restoredCargo.value = 0
  } else if (hasDraft.value) {
    clearDraft()
    restoredCargo.value = 0
  }
})

// Parent-confirmed success → launch sequence, then hand the stage back.
watch(
  () => props.successToken,
  (n, o) => {
    if (n === undefined || n === o) return
    launched.value = true
    window.setTimeout(
      () => {
        title.value = ''
        body.value = ''
        files.value = []
        localError.value = null
        restoredCargo.value = 0
        launched.value = false
        clearDraft()
        emit('done')
      },
      reducedMotion() ? 0 : 620,
    )
  },
)

const transmitErrorToken = ref(0)
watch(
  () => props.error,
  (failure) => {
    // A new refusal breaks the ring of the transmit node briefly.
    if (failure) transmitErrorToken.value++
  },
)

// Field-mapping of a 400: the surface the API named by field is the
// surface that carries the red edge — the notice stays a summary, not a
// repeat of the same words.
const invalidFields = computed(() => Object.keys(props.error?.fields ?? {}))
const titleInvalid = computed(() => invalidFields.value.includes('title'))
const bodyInvalid = computed(
  () => invalidFields.value.includes('body') || localError.value !== null,
)
// One refusal, one inline node: an API failure outranks an intake one.
const shownError = computed<TransmitError | null>(() => props.error ?? localError.value)

function submit() {
  if (!canSubmit.value) return
  localError.value = null
  emit('submit', { title: title.value, body: body.value, attachments: files.value })
}

function onKeydown(e: KeyboardEvent) {
  const meta = e.ctrlKey || e.metaKey
  if (meta && e.key === 'Enter') {
    e.preventDefault()
    submit()
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

defineExpose({
  focusTitle: () => titleRef.value?.focus(),
  /**
   * The scene title is the shared element of the bay morph (P3-T2): the
   * parent captures the trigger's geometry and plays it into this span, so
   * the kicker and the /slug/ fly out of the «Новый тред» button into their
   * place on the sheet.
   */
  sceneTitleElement: () => sceneTitleRef.value,
})
</script>

<template>
  <div
    class="launch-bay"
    :class="{ 'launch-bay--launched': launched, 'launch-bay--submitting': submitting }"
    role="dialog"
    aria-label="Создание нового треда"
    data-testid="launch-bay"
    @keydown="onKeydown"
  >
    <header class="launch-bay__header">
      <!-- the shared element: the span flies out of the «Новый тред»
           button (BoardView captureMorph/playMorph) into its place here -->
      <span
        ref="sceneTitleRef"
        class="launch-bay__scene"
        data-testid="launch-scene-title"
      >
        <span class="launch-bay__kicker">новый тред</span>
        <span class="launch-bay__board">/{{ boardSlug }}/</span>
      </span>
      <button
        type="button"
        class="launch-bay__close"
        aria-label="Закрыть создание треда"
        @click="emit('close')"
      >
        <NetworkIcon name="close" :size="16" :stroke-width="2" />
      </button>
    </header>

    <div class="launch-bay__body">
      <div class="launch-bay__stage">
        <!-- editorial title: no box, no label, underline = network route -->
        <div
          class="title-surface"
          :class="{
            'title-surface--live': title.length > 0,
            'title-surface--invalid': titleInvalid,
          }"
        >
          <input
            ref="titleRef"
            v-model="title"
            class="title-surface__input"
            type="text"
            maxlength="200"
            placeholder="О чём этот тред?"
            aria-label="Заголовок треда"
            :aria-invalid="titleInvalid || undefined"
            data-testid="launch-title"
          />
          <div class="title-surface__route" aria-hidden="true">
            <span class="title-surface__node"></span>
          </div>
        </div>

        <SignalSurface
          ref="surfaceRef"
          v-model="body"
          gutter="OP"
          placeholder="Первый сигнал треда…"
          :max-length="MAX_BODY"
          :invalid="bodyInvalid"
        />

        <AttachmentRail
          v-if="body.length > 0 || files.length"
          ref="railRef"
          v-model:files="files"
          :accepted="ACCEPTED"
          :max-files="MAX_FILES"
          :max-size="MAX_SIZE"
          @error="(m: string) => (localError = { kind: 'validation', messageRu: m })"
        />

        <!-- Honest restore: the text is back, the cargo is not — say it once. -->
        <p
          v-if="restoredCargo"
          class="launch-bay__restored"
          role="status"
          data-testid="launch-restored"
        >
          черновик восстановлен ·
          {{ restoredCargo }} {{ cargoWord }} — приложите заново
        </p>
      </div>

      <!-- instrumentation rail — not a form sidebar -->
      <aside class="telemetry" aria-label="Телеметрия треда">
        <div class="telemetry__row">
          <span class="telemetry__key">раздел</span>
          <span class="telemetry__value">/{{ boardSlug }}/</span>
        </div>
        <div class="telemetry__row">
          <span class="telemetry__key">заголовок</span>
          <SignalMeter
            class="telemetry__meter"
            :current="title.length"
            :max="MAX_TITLE"
          />
        </div>
        <div class="telemetry__row">
          <span class="telemetry__key">тело</span>
          <SignalMeter
            class="telemetry__meter"
            :current="body.length"
            :max="MAX_BODY"
          />
        </div>
        <div class="telemetry__row">
          <span class="telemetry__key">вложения</span>
          <span class="telemetry__value">{{ files.length }}/{{ MAX_FILES }}</span>
        </div>
        <div class="telemetry__row">
          <span class="telemetry__key">буфер</span>
          <DraftBeacon :state="status" :saved-at="savedAt" />
        </div>
      </aside>
    </div>

    <footer class="launch-bay__rail">
      <button
        type="button"
        class="rail-action"
        aria-label="Прикрепить файлы"
        @click="railRef?.openPicker()"
      >
        <NetworkIcon name="attach" :size="16" />
        <span class="rail-action__label">файлы</span>
      </button>
      <span class="launch-bay__spacer"></span>
      <!-- one inline refusal node: classified by the parent (P1-T4) -->
      <div v-if="shownError" class="launch-bay__notice" data-testid="launch-error">
        <TransmitNotice :error="shownError" @retry="emit('retry')" />
      </div>
      <kbd class="launch-bay__hint" aria-hidden="true">⌘↵</kbd>
      <!-- the launch control: the one magnetic node of the app. The label and
           the ring travel together, so the pull reads as one gesture. -->
      <div ref="launchRef" class="launch-bay__launch">
        <span class="launch-bay__transmit-label">создать</span>
        <TransmitControl
          :disabled="!canSubmit"
          :submitting="submitting"
          :ready="canSubmit"
          :success-token="successToken"
          :error-token="transmitErrorToken"
          @transmit="submit"
        />
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Q-A-006: браузер рисует кнопки своим шрифтом — гарнитура приложения
   должна побеждать. Правило с низкой специфичностью: у кнопок, которые
   задают свой кегль, он остаётся. */
button {
  font-family: inherit;
}

/* ─────────────────────────────────────────────────────────────────────────────
   The bay is a SHEET, not a card. Same gesture as the Signal Dock: a
   --paper-raised ground, ink letters and one hairline rule around the
   edges — no glass, no rounded frame, no drop shadow. Paper carries depth
   on its own. The header, telemetry and footer survive as scene furniture.
   ───────────────────────────────────────────────────────────────────────────── */
.launch-bay {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6) var(--space-4);
  background: var(--paper-raised);
  color: var(--ink);
  border: 1px solid var(--rule);
  border-radius: 0;
  box-shadow: none;
}

.launch-bay--launched {
  animation: bay-contract var(--motion-reveal-duration) var(--ease-exit) forwards;
}

/* the sheet contracts into an accent wash and hands the stage back */
@keyframes bay-contract {
  40% {
    background: color-mix(in oklab, var(--accent) 12%, var(--paper-raised));
  }
  100% {
    /* the sheet is lifted off the table, not shrunk: paper does not scale */
    transform: translateY(8px);
    opacity: 0;
  }
}

.launch-bay__header {
  /* two fixed tracks: while the scene title is flown in (and momentarily
     out of the flow by the flip) the close node keeps its place */
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--space-3);
}

/* scene title — one identity, carried in from the trigger's geometry */
.launch-bay__scene {
  grid-column: 1;
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-3);
  min-width: 0;
}

/* Q-M-10: подписи прибора — обычным шрифтом приложения, без капитала и
   разрядки (это киберпанк, которого в проекте нет) и не мельче 10 px. */
.launch-bay__kicker {
  font-family: var(--font-body);
  font-size: 0.6875rem;
  color: var(--accent);
}

.launch-bay__board {
  font-family: var(--font-display);
  font-size: 0.72rem;
  color: var(--ink-tertiary);
}

.launch-bay__close {
  grid-column: 2;
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--ink-tertiary);
  border-radius: 50%;
  display: grid;
  place-items: center;
  /* тихая реакция: только цвет и подложка, без «вспышки» */
  transition:
    color var(--motion-hover),
    background-color var(--motion-hover);
}

.launch-bay__close:hover {
  color: var(--ink);
  background: var(--paper-sunken);
}

/* the sheet is laid down while its title flies in — only the furniture
   fades, so the shared element never dims behind its own sheet.
   The furniture arrives with the reveal tempo of the system (600ms): the
   bay must finish settling in the same time the board takes to recede,
   otherwise the two halves of the gesture drift apart. */
.launch-bay__body,
.launch-bay__rail {
  animation: bay-fade-in var(--motion-reveal);
}

@keyframes bay-fade-in {
  from {
    opacity: 0;
  }
}

.launch-bay__body {
  display: grid;
  grid-template-columns: 1fr 180px;
  gap: var(--space-6);
}

.launch-bay__stage {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

/* editorial title surface */
.title-surface {
  position: relative;
}

.title-surface__input {
  width: 100%;
  background: none;
  border: none;
  outline: none;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: clamp(1.4rem, 3vw, 2.1rem);
  font-weight: 600;
  line-height: 1.25;
  padding: 0 0 var(--space-3);
}

.title-surface__input::placeholder {
  color: var(--ink-tertiary);
  opacity: 0.55;
}

/* the underline is a network route, not a border */
.title-surface__route {
  height: 1px;
  background: linear-gradient(
    90deg,
    var(--accent) 0%,
    var(--accent) 12%,
    var(--ink-tertiary) 12%
  );
  transition: background var(--motion-hover);
}

.title-surface--live .title-surface__route {
  background: linear-gradient(
    90deg,
    var(--accent) 0%,
    var(--accent) 40%,
    var(--ink-tertiary) 40%
  );
}

/* the API named the title in its 400 — the route answers in danger red */
.title-surface--invalid .title-surface__route {
  background: linear-gradient(
    90deg,
    var(--danger) 0%,
    var(--danger) 40%,
    var(--ink-tertiary) 40%
  );
}

.title-surface--invalid .title-surface__node {
  border-color: var(--danger);
}

.title-surface__node {
  position: absolute;
  left: 0;
  bottom: -3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  /* the bead sits on the sheet's own ground */
  background: var(--paper-raised);
  /* только конкретные свойства: переход «по всему» ломает неожиданные
     анимации (анимация цвета задевает тень, тень — кромку) */
  transition:
    background-color var(--motion-hover),
    border-color var(--motion-hover),
    box-shadow var(--motion-hover);
}

.title-surface:focus-within .title-surface__node {
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent-glow);
}

/* telemetry rail — instrumentation, not form sidebar */
.telemetry {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-left: var(--space-5);
  border-left: 1px solid var(--rule);
}

.telemetry__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.telemetry__key {
  font-family: var(--font-body);
  font-size: 0.6875rem;
  color: var(--ink-tertiary);
}

.telemetry__value {
  font-family: var(--font-display);
  font-size: 0.74rem;
  color: var(--ink-secondary);
}

.telemetry__meter {
  width: 100%;
}

/* bottom action rail */
.launch-bay__rail {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  border-top: 1px solid var(--rule);
  padding-top: var(--space-3);
}

.launch-bay__spacer {
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
  /* тихая реакция вторичного действия: цвет и подложка, ничего больше */
  transition:
    color var(--motion-hover),
    background-color var(--motion-hover);
}

.rail-action:hover {
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 8%, transparent);
}

.rail-action__label {
  font-family: var(--font-body);
  font-size: 0.6875rem;
}

/* the refusal node of the footer rail — compact, inline, never a banner */
.launch-bay__notice {
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(420px, 55%);
}

/* the honest restore note — quiet ink, not an error */
.launch-bay__restored {
  margin: 0;
  font-size: 0.78rem;
  font-style: italic;
  color: var(--ink-tertiary);
}

.launch-bay__notice :deep(.notice) {
  padding: 6px var(--space-2);
  font-size: 0.72rem;
}

.launch-bay__hint {
  font-family: var(--font-body);
  font-size: 0.6875rem;
  color: var(--ink-tertiary);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 2px 6px;
}

/* the launch control: one gesture — the caption and the ring lean together */
.launch-bay__launch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  /* the node must not be squeezed on a narrow rail */
  flex-shrink: 0;
  /* the magnetic pull arrives through `translate` and is already smoothed by
     the primitive itself — a CSS transition on top of it would only lag */
}

.launch-bay__transmit-label {
  font-family: var(--font-body);
  font-size: 0.6875rem;
  color: var(--ink-secondary);
}

@media (max-width: 860px) {
  .launch-bay {
    padding: var(--space-4) var(--space-4)
      calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
    /* bottom sheet: the leading edge stays open — no frame above it */
    border-top: 0;
  }

  .launch-bay__body {
    grid-template-columns: 1fr;
  }

  .telemetry {
    display: none;
  }

  /* the rail wraps the refusal node onto its own line */
  .launch-bay__notice {
    max-width: 100%;
    flex-basis: 100%;
    order: -1;
  }
}

/* Q-M-14: на 320 px поля заготовки и кнопка закрытия были ниже 44 px,
   а плейсхолдер тела обрезался. Поля — настоящие цели для пальца. */
@media (max-width: 767px) {
  .title-surface__input {
    min-height: 44px;
  }

  .launch-bay__close {
    width: 44px;
    height: 44px;
    padding: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .launch-bay--launched,
  .launch-bay__body,
  .launch-bay__rail {
    animation: none;
  }

  .title-surface__route,
  .title-surface__node,
  .launch-bay__close,
  .rail-action {
    transition: none;
  }
}
</style>

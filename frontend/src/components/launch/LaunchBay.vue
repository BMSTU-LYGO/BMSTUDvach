<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import type { NewThreadInput } from '@/types'
import { useDraft } from '@/composables/useDraft'
import SignalSurface from '../composer/SignalSurface.vue'
import AttachmentRail from '../composer/AttachmentRail.vue'
import DraftBeacon from '../composer/DraftBeacon.vue'
import SignalMeter from '../composer/SignalMeter.vue'
import TransmitControl from '../composer/TransmitControl.vue'
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
 * Dock: emit intent, parent awaits the API, successToken unlocks reset.
 */
const props = defineProps<{
  boardSlug: string
  submitting?: boolean
  submitError?: string | null
  successToken?: number
}>()

const emit = defineEmits<{
  submit: [input: NewThreadInput]
  close: []
  done: []
}>()

const title = ref('')
const body = ref('')
const files = ref<File[]>([])
const error = ref('')
const launched = ref(false)

const titleRef = ref<HTMLInputElement | null>(null)
const surfaceRef = ref<InstanceType<typeof SignalSurface> | null>(null)
const railRef = ref<InstanceType<typeof AttachmentRail> | null>(null)

const { draft, hasDraft, status, savedAt, saveDraft, clearDraft } = useDraft(`launch-${props.boardSlug}`)

const canSubmit = computed(
  () =>
    title.value.trim().length > 0 &&
    body.value.trim().length > 0 &&
    title.value.length <= MAX_TITLE &&
    body.value.length <= MAX_BODY &&
    !props.submitting,
)

// Silently restore a buffered draft; focus the title surface.
onMounted(() => {
  if (hasDraft.value && draft.value) {
    title.value = draft.value.title || ''
    body.value = draft.value.body
  }
  titleRef.value?.focus()
})

watch([title, body], ([t, b]) => {
  if (t.trim().length > 0 || b.trim().length > 0) saveDraft({ title: t, body: b })
  else if (hasDraft.value) clearDraft()
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
        error.value = ''
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
  () => props.submitError,
  (message) => {
    error.value = message ?? ''
    if (message) transmitErrorToken.value++
  },
)

function submit() {
  if (!canSubmit.value) return
  error.value = ''
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

defineExpose({ focusTitle: () => titleRef.value?.focus() })
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
      <span class="launch-bay__kicker">NEW TRANSMISSION</span>
      <span class="launch-bay__board">/{{ boardSlug }}/</span>
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
        <div class="title-surface" :class="{ 'title-surface--live': title.length > 0 }">
          <input
            ref="titleRef"
            v-model="title"
            class="title-surface__input"
            type="text"
            maxlength="200"
            placeholder="О чём этот тред?"
            aria-label="Заголовок треда"
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
          :invalid="!!error"
        />

        <AttachmentRail
          v-if="body.length > 0 || files.length"
          ref="railRef"
          v-model:files="files"
          :accepted="ACCEPTED"
          :max-files="MAX_FILES"
          :max-size="MAX_SIZE"
          @error="(m: string) => (error = m)"
        />
      </div>

      <!-- instrumentation rail — not a form sidebar -->
      <aside class="telemetry" aria-label="Телеметрия треда">
        <div class="telemetry__row">
          <span class="telemetry__key">BOARD</span>
          <span class="telemetry__value">/{{ boardSlug }}/</span>
        </div>
        <div class="telemetry__row">
          <span class="telemetry__key">TITLE</span>
          <SignalMeter class="telemetry__meter" :current="title.length" :max="MAX_TITLE" />
        </div>
        <div class="telemetry__row">
          <span class="telemetry__key">BODY</span>
          <SignalMeter class="telemetry__meter" :current="body.length" :max="MAX_BODY" />
        </div>
        <div class="telemetry__row">
          <span class="telemetry__key">CARGO</span>
          <span class="telemetry__value">{{ files.length }}/{{ MAX_FILES }}</span>
        </div>
        <div class="telemetry__row">
          <span class="telemetry__key">BUFFER</span>
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
      <span v-if="error" class="launch-bay__error" role="alert" data-testid="launch-error">
        {{ error }}
      </span>
      <kbd class="launch-bay__hint" aria-hidden="true">⌘↵</kbd>
      <span class="launch-bay__transmit-label">LAUNCH</span>
      <TransmitControl
        :disabled="!canSubmit"
        :submitting="submitting"
        :ready="canSubmit"
        :success-token="successToken"
        :error-token="transmitErrorToken"
        @transmit="submit"
      />
    </footer>
  </div>
</template>

<style scoped>
.launch-bay {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6) var(--space-4);
  background: color-mix(in oklab, var(--bg-deep) 88%, transparent);
  border: 1px solid color-mix(in oklab, var(--accent) 22%, transparent);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(14px);
  box-shadow: 0 24px 80px oklch(0 0 0 / 0.45);
}

.launch-bay--launched {
  animation: bay-contract 620ms cubic-bezier(0.7, 0, 0.3, 1) forwards;
}

@keyframes bay-contract {
  40% {
    border-color: var(--accent);
    box-shadow: 0 0 60px color-mix(in oklab, var(--accent) 30%, transparent);
  }
  100% {
    transform: scale(0.96) translateY(8px);
    opacity: 0;
  }
}

.launch-bay__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.launch-bay__kicker {
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  color: var(--accent);
}

.launch-bay__board {
  font-family: var(--font-display);
  font-size: 0.72rem;
  color: var(--text-muted);
}

.launch-bay__close {
  margin-left: auto;
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.launch-bay__close:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
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
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: clamp(1.4rem, 3vw, 2.1rem);
  font-weight: 600;
  line-height: 1.25;
  padding: 0 0 var(--space-3);
}

.title-surface__input::placeholder {
  color: var(--text-muted);
  opacity: 0.55;
}

/* the underline is a network route, not a border */
.title-surface__route {
  height: 1px;
  background: linear-gradient(90deg, var(--accent) 0%, var(--accent) 12%, var(--border-medium) 12%);
  transition: background 260ms var(--ease-out-quart);
}

.title-surface--live .title-surface__route {
  background: linear-gradient(90deg, var(--accent) 0%, var(--accent) 40%, var(--border-medium) 40%);
}

.title-surface__node {
  position: absolute;
  left: 0;
  bottom: -3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  background: var(--bg-deep);
  transition: all 220ms var(--ease-out-quart);
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
  border-left: 1px solid var(--border-subtle);
}

.telemetry__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.telemetry__key {
  font-family: var(--font-display);
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  color: var(--text-muted);
}

.telemetry__value {
  font-family: var(--font-display);
  font-size: 0.74rem;
  color: var(--text-secondary);
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
  border-top: 1px solid var(--border-subtle);
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
  color: var(--text-muted);
  cursor: pointer;
  transition: color 160ms, background 160ms;
}

.rail-action:hover {
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 8%, transparent);
}

.rail-action__label {
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
}

.launch-bay__error {
  font-size: 0.78rem;
  color: var(--danger);
}

.launch-bay__hint {
  font-family: var(--font-display);
  font-size: 0.64rem;
  color: var(--text-muted);
  border: 1px solid var(--border-medium);
  border-radius: 4px;
  padding: 2px 6px;
}

.launch-bay__transmit-label {
  font-family: var(--font-display);
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  color: var(--text-secondary);
}

@media (max-width: 860px) {
  .launch-bay {
    padding: var(--space-4) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .launch-bay__body {
    grid-template-columns: 1fr;
  }

  .telemetry {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .launch-bay--launched {
    animation: none;
  }

  .title-surface__route,
  .title-surface__node {
    transition: none;
  }
}
</style>

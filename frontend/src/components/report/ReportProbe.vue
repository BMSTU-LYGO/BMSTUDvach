<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import type { ReportReason } from '@/types'
import ReasonConstellation from './ReasonConstellation.vue'
import TransmitControl from '../composer/TransmitControl.vue'
import NetworkIcon, { type NetworkIconName } from '../composer/NetworkIcon.vue'

const REASON_META: Record<ReportReason, { label: string; glyph: NetworkIconName }> = {
  spam: { label: 'Спам', glyph: 'spam' },
  abuse: { label: 'Оскорбления', glyph: 'abuse' },
  illegal: { label: 'Нелегал', glyph: 'illegal' },
  offtopic: { label: 'Оффтоп', glyph: 'offtopic' },
  other: { label: 'Другое', glyph: 'other' },
}

/**
 * REPORT PROBE (SIGNAL-17..19) — diagnostics anchored to the post, not a
 * modal. Stage 1: reason constellation (desktop radial / mobile vertical
 * track). Stage 2: the chosen node anchors a comment surface. Submit goes
 * back along the same line; the probe closes only after API success.
 */
const props = defineProps<{
  postId: number
  submitting?: boolean
  submitError?: string | null
  successToken?: number
}>()

const emit = defineEmits<{
  close: []
  reported: []
  submit: [payload: { reason: ReportReason; comment: string }]
}>()

const reason = ref<ReportReason | null>(null)
const comment = ref('')
const error = ref('')

const commentRef = ref<HTMLTextAreaElement | null>(null)

watch(
  () => props.successToken,
  (n, o) => {
    if (n === undefined || n === o) return
    emit('reported')
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

async function onPick(next: ReportReason) {
  reason.value = next
  await nextTick()
  commentRef.value?.focus()
}

function submit() {
  if (!reason.value || props.submitting) return
  error.value = ''
  emit('submit', { reason: reason.value, comment: comment.value })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    if (reason.value && !comment.value) reason.value = null
    else emit('close')
  }
}
</script>

<template>
  <div
    class="report-probe"
    role="dialog"
    aria-label="Жалоба на пост"
    data-testid="report-probe"
    @keydown="onKeydown"
  >
    <header class="probe-head">
      <span class="probe-head__kicker">DIAGNOSTIC</span>
      <span class="probe-head__target">#{{ postId }}</span>
      <button
        type="button"
        class="probe-head__close"
        aria-label="Закрыть жалобу"
        @click="emit('close')"
      >
        <NetworkIcon name="close" :size="14" :stroke-width="2" />
      </button>
    </header>

    <ReasonConstellation v-if="!reason" v-model="reason" @pick="onPick" />

    <div v-else class="probe-stage" data-testid="probe-stage-2">
      <div class="probe-anchor">
        <span class="probe-anchor__node">
          <NetworkIcon :name="REASON_META[reason].glyph" :size="16" />
        </span>
        <span class="probe-anchor__label">{{ REASON_META[reason].label }}</span>
        <button
          type="button"
          class="probe-anchor__change"
          aria-label="Выбрать другую причину"
          @click="reason = null"
        >
          изменить
        </button>
      </div>

      <textarea
        ref="commentRef"
        v-model="comment"
        class="probe-comment"
        rows="2"
        maxlength="1000"
        placeholder="Комментарий (необязательно)"
        aria-label="Комментарий к жалобе"
      ></textarea>

      <p v-if="error" class="probe-error" role="alert" data-testid="probe-error">
        {{ error }}
      </p>

      <div class="probe-submit">
        <span class="probe-submit__label">SEND REPORT</span>
        <TransmitControl
          :submitting="submitting"
          :ready="true"
          :success-token="successToken"
          :error-token="transmitErrorToken"
          @transmit="submit"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.report-probe {
  margin-top: var(--space-4);
  padding: var(--space-4);
  background: color-mix(in oklab, var(--bg-deep) 85%, transparent);
  border: 1px solid color-mix(in oklab, var(--accent) 26%, transparent);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 60px oklch(0 0 0 / 0.4);
  animation: probe-in 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes probe-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.probe-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.probe-head__kicker {
  font-family: var(--font-display);
  font-size: 0.64rem;
  letter-spacing: 0.22em;
  color: var(--accent);
}

.probe-head__target {
  font-family: var(--font-display);
  font-size: 0.72rem;
  color: var(--text-muted);
}

.probe-head__close {
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

.probe-head__close:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
}

/* stage 2 */
.probe-stage {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  animation: probe-in 220ms var(--ease-out-quart);
}

.probe-anchor {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.probe-anchor__node {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  display: grid;
  place-items: center;
  color: var(--accent);
  box-shadow: 0 0 12px var(--accent-glow);
  flex-shrink: 0;
}

.probe-anchor__label {
  font-family: var(--font-display);
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  color: var(--text-primary);
}

.probe-anchor__change {
  margin-left: auto;
  background: none;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  font-size: 0.7rem;
  color: var(--text-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.probe-anchor__change:hover {
  color: var(--accent);
}

.probe-comment {
  width: 100%;
  resize: none;
  background: color-mix(in oklab, var(--bg-surface) 60%, transparent);
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 0.88rem;
  line-height: 1.6;
  padding: var(--space-2) 0;
}

.probe-comment:focus {
  border-bottom-color: var(--accent);
}

.probe-comment::placeholder {
  color: var(--text-muted);
  opacity: 0.7;
}

.probe-error {
  margin: 0;
  font-size: 0.78rem;
  color: var(--danger);
}

.probe-submit {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
}

.probe-submit__label {
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  color: var(--text-secondary);
}

@media (prefers-reduced-motion: reduce) {
  .report-probe,
  .probe-stage {
    animation: none;
  }
}
</style>

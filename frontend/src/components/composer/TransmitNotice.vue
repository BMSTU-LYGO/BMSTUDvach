<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'

import type { TransmitError, TransmitErrorKind } from '@/api/errors'
import NetworkIcon, { type NetworkIconName } from './NetworkIcon.vue'

/**
 * TRANSMIT NOTICE (TRANSMIT-ENGINE-01) — the single inline error node of
 * the three forms (Signal Dock, Launch Bay, Report Probe).
 *
 * Pure rendering: the failure arrives already classified
 * (`props.error: TransmitError`) and never leaves this component as
 * logic — no `classifyError`, no API knowledge. The only intelligence
 * here is the throttle countdown: a 429 is a rate limit, so instead of a
 * retry button the node counts the seconds down and hands the floor to
 * «повторить» when the window is over.
 *
 * Kinds that cannot recover (locked thread, gone post) get no retry
 * button at all — offering one would be a lie.
 *
 * A11y: `role="alert"` + `aria-live="polite"` — the notice is a status
 * node, not a modal banner; it is compact and inline by design.
 */

const props = defineProps<{
  error: TransmitError | null
}>()

const emit = defineEmits<{
  retry: []
}>()

/** One glyph per kind, off the unified network set. */
const GLYPH: Record<TransmitErrorKind, NetworkIconName> = {
  offline: 'clear',
  throttle: 'warning',
  validation: 'close',
  tooLarge: 'close',
  locked: 'lock',
  notFound: 'close',
  server: 'warning',
  unknown: 'close',
}

/** Human labels for the form fields the API can complain about. */
const FIELD_LABELS: Record<string, string> = {
  title: 'заголовок',
  body: 'сообщение',
  comment: 'комментарий',
  reason: 'причина',
  attachments: 'файлы',
  non_field_errors: 'общее',
}

/** Retrying is meaningless for a refusal that will not change. */
const RETRYABLE: TransmitErrorKind[] = ['offline', 'server', 'unknown', 'throttle']

interface FieldRow {
  field: string
  label: string
  text: string
}

const remaining = ref(0)
let countdown: number | null = null

function stopCountdown(): void {
  if (countdown === null) return
  window.clearInterval(countdown)
  countdown = null
}

function startCountdown(): void {
  stopCountdown()
  const secs = props.error?.kind === 'throttle' ? (props.error.retryAfterSec ?? 0) : 0
  remaining.value = secs
  if (secs <= 0) return
  // One polite tick per second; hitting zero stops the timer and reveals
  // the button — the limit is respected, not raced.
  countdown = window.setInterval(() => {
    if (remaining.value <= 1) {
      remaining.value = 0
      stopCountdown()
      return
    }
    remaining.value -= 1
  }, 1000)
}

// A new refusal restarts the countdown (a fresh 429 has its own window).
watch(() => props.error, startCountdown, { immediate: true })

onUnmounted(stopCountdown)

const counting = computed(() => props.error?.kind === 'throttle' && remaining.value > 0)

const canRetry = computed(() => {
  const err = props.error
  if (!err || !RETRYABLE.includes(err.kind)) return false
  if (err.kind === 'throttle') return remaining.value <= 0
  return true
})

const fieldRows = computed<FieldRow[]>(() => {
  const fields = props.error?.fields
  if (!fields) return []
  const rows: FieldRow[] = []
  for (const [field, messages] of Object.entries(fields)) {
    const list = Array.isArray(messages)
      ? messages.filter((m) => typeof m === 'string' && m.length > 0)
      : []
    if (list.length === 0) continue
    rows.push({
      field,
      label: FIELD_LABELS[field] ?? field,
      text: list.join('; '),
    })
  }
  // Compact, never a wall of text: the three most important lines.
  return rows.slice(0, 3)
})

/**
 * A validation message is built from its own field messages, so showing
 * both would print the same words twice — the field list replaces it.
 */
const showMessage = computed(() => {
  const err = props.error
  if (!err) return false
  if (err.kind === 'validation' && fieldRows.value.length > 0) return false
  return true
})
</script>

<template>
  <div
    v-if="error"
    class="notice"
    :class="`notice--${error?.kind}`"
    :data-kind="error?.kind"
    role="alert"
    aria-live="polite"
    data-testid="transmit-notice"
  >
    <span class="notice__glyph" aria-hidden="true">
      <NetworkIcon
        :name="GLYPH[error?.kind ?? 'unknown']"
        :size="14"
        :stroke-width="1.7"
      />
    </span>

    <div class="notice__body">
      <p v-if="showMessage" class="notice__message">{{ error?.messageRu }}</p>
      <ul v-if="fieldRows.length > 0" class="notice__fields">
        <li
          v-for="row in fieldRows"
          :key="row.field"
          class="notice__field"
          :data-field="row.field"
        >
          <span class="notice__field-name">{{ row.label }}: </span
          ><span class="notice__field-text">{{ row.text }}</span>
        </li>
      </ul>
      <p
        v-if="counting"
        class="notice__countdown"
        data-testid="transmit-notice-countdown"
      >
        повтор через {{ remaining }}с
      </p>
    </div>

    <button
      v-if="canRetry"
      type="button"
      class="notice__retry"
      data-testid="transmit-notice-retry"
      @click="emit('retry')"
    >
      повторить
    </button>
  </div>
</template>

<style scoped>
.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid color-mix(in oklab, var(--danger) 32%, var(--rule));
  /* a scratch of red on the left edge, not a banner */
  border-left: 2px solid var(--danger);
  background: color-mix(in oklab, var(--danger) 5%, var(--paper));
  color: var(--ink);
  font-size: 0.76rem;
  line-height: 1.45;
  text-align: left;
}

.notice__glyph {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--danger);
}

.notice__body {
  flex: 1 1 auto;
  min-width: 0;
}

.notice__message {
  margin: 0;
  color: var(--danger);
}

.notice__fields {
  margin: var(--space-1) 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 2px;
}

.notice__field {
  color: var(--ink-secondary);
}

.notice__field-name {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-tertiary);
}

.notice__field-text {
  margin-left: 1px;
}

.notice__countdown {
  margin: var(--space-1) 0 0;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--danger);
}

.notice__retry {
  flex-shrink: 0;
  align-self: center;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.02em;
  padding: 3px var(--space-2);
  border: 1px solid color-mix(in oklab, var(--danger) 45%, var(--rule));
  background: var(--paper-raised);
  color: var(--danger);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  /* Кнопка отзывается тихо: роль наведения (150ms) на кромку, тон и подложку. */
  transition:
    border-color var(--motion-hover),
    color var(--motion-hover),
    background var(--motion-hover);
}

.notice__retry:hover {
  border-color: var(--danger);
  background: color-mix(in oklab, var(--danger) 8%, var(--paper-raised));
}

.notice__retry:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--paper),
    0 0 0 3px var(--accent);
}

@media (prefers-reduced-motion: no-preference) {
  .notice {
    /* Уведомление — это текст, который нужно успеть прочесть, поэтому
       оно выходит по роли появления (600ms), а не «мелькает». */
    animation: notice-in var(--motion-reveal) both;
  }
}

@keyframes notice-in {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notice,
  .notice__retry {
    animation: none;
    transition: none;
  }
}
</style>

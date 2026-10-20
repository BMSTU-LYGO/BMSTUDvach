<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import type { ReportReason } from '@/types'
import type { TransmitError } from '@/api/errors'
import { useDraft } from '@/composables/useDraft'
import { gsap } from '@/composables/useGsap'
import { usePointerLight } from '@/composables/useMotion'
import ReasonConstellation from './ReasonConstellation.vue'
import DraftBeacon from '../composer/DraftBeacon.vue'
import SignalSurface from '../composer/SignalSurface.vue'
import TransmitControl from '../composer/TransmitControl.vue'
import TransmitNotice from '../composer/TransmitNotice.vue'
import NetworkIcon, { type NetworkIconName } from '../composer/NetworkIcon.vue'

const REASON_META: Record<
  ReportReason,
  { label: string; glyph: NetworkIconName; letter: string }
> = {
  spam: { label: 'Спам', glyph: 'spam', letter: 'С' },
  abuse: { label: 'Оскорбления', glyph: 'abuse', letter: 'О' },
  illegal: { label: 'Нелегал', glyph: 'illegal', letter: 'Н' },
  offtopic: { label: 'Оффтоп', glyph: 'offtopic', letter: 'Ф' },
  other: { label: 'Другое', glyph: 'other', letter: 'Д' },
}

/**
 * REPORT PROBE (SIGNAL-17..19) — diagnostics anchored to the post, not a
 * modal. Stage 1: reason constellation (desktop radial / mobile vertical
 * track). Stage 2: the chosen node anchors a comment surface. Submit goes
 * back along the same line; the probe closes only after API success.
 *
 * The two stages are never swapped with `v-if`: the constellation keeps its
 * exact geometry in both stages, so picking a reason is a morph (the chosen
 * node flies from its slot into the stage-2 anchor, the rest die along their
 * wires) and «изменить» plays the same flight backwards. Destroying the
 * constellation would leave nothing to fly back to.
 *
 * The refusal arrives already classified (`props.error: TransmitError`,
 * TRANSMIT-ENGINE-01) and is rendered by the shared `TransmitNotice` as a
 * node woven into stage 2 — not a row bolted under the form; «повторить»
 * bubbles out as `@retry` so the parent replays the very same report from
 * its `useTransmit`.
 */
const props = defineProps<{
  postId: number
  submitting?: boolean
  error?: TransmitError | null
  successToken?: number
}>()

const emit = defineEmits<{
  close: []
  reported: []
  retry: []
  submit: [payload: { reason: ReportReason; comment: string }]
}>()

/** One flight, in milliseconds — the settle timer follows the tween. */
const FLIGHT_MS = 420
/** The flight twin fades out only once the anchor is taking over. */
const HANDOVER_MS = 300
/** Constellation ring size — the anchor node mirrors it exactly. */
const NODE_RING = 34

type Stage = 1 | 2

const reason = ref<ReportReason | null>(null)
const comment = ref('')
const stage = ref<Stage>(1)
/** The flight landed: the anchor is real, the constellation is gone. */
const landed = ref(false)
/** A stage entered without a flight — a restored buffer, reduced motion. */
const quiet = ref(false)

const constellationRef = ref<InstanceType<typeof ReasonConstellation> | null>(null)
const surfaceRef = ref<InstanceType<typeof SignalSurface> | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const anchorRef = ref<HTMLElement | null>(null)
const flightRef = ref<HTMLElement | null>(null)

/**
 * The chosen reason catches the light.
 *
 * One small node, one listener: the ring of the picked reason takes a soft
 * highlight that follows the cursor — the paper answers where the finger
 * is. Everything else in the probe stays still.
 */
usePointerLight(anchorRef, { radius: 90 })

interface Flight {
  glyph: NetworkIconName
  style: Record<string, string>
}
/** The flying twin: a fixed-position copy of the chosen node's ring. */
const flight = ref<Flight | null>(null)

let settleTimer: number | null = null

// REPORT DRAFT (P2-T2): one buffer per post, `draft:report-<postId>`. The
// chosen reason rides in the `title` slot (the only free field of a Draft),
// the comment in `body` — so a half-written report survives closing the probe
// or leaving the thread.
const { draft, hasDraft, status, savedAt, saveDraft, clearDraft } = useDraft(
  `report-${props.postId}`,
)

/** The persisted `title` slot carries one of the five API reasons — or ''. */
function isReportReason(value: string | undefined): value is ReportReason {
  return typeof value === 'string' && value in REASON_META
}

/** Set once the report went through: no re-saving a buffer we just dropped. */
let clearedAfterSuccess = false

// Silent restore (registered after useDraft's own onMounted, so the buffer is
// already loaded): a buffered reason lands straight in stage 2 — no flight,
// nothing to wait for.
onMounted(() => {
  if (!hasDraft.value || !draft.value) return
  comment.value = draft.value.body
  if (isReportReason(draft.value.title)) {
    reason.value = draft.value.title
    stage.value = 2
    quiet.value = true
    void nextTick(() => surfaceRef.value?.focus())
  }
})

// A buffer exists only while there is something to report; an emptied comment
// discards it instead of leaving a husk behind.
watch([reason, comment], ([nextReason, nextComment]) => {
  if (clearedAfterSuccess) return
  if (nextComment.trim().length > 0)
    saveDraft({ title: nextReason ?? '', body: nextComment })
  else if (hasDraft.value) clearDraft()
})

watch(
  () => props.successToken,
  (n, o) => {
    if (n === undefined || n === o) return
    // The report went through — the buffer is now a lie. Later edits in this
    // session must not resurrect it.
    clearedAfterSuccess = true
    clearDraft()
    emit('reported')
  },
)

// The classified refusal drives the transmit ring's broken-ring feedback.
const transmitErrorToken = ref(0)
watch(
  () => props.error,
  (err, prev) => {
    if (err && err !== prev) transmitErrorToken.value++
  },
)

const reasonMeta = computed(() => (reason.value ? REASON_META[reason.value] : null))
/** Micro-gutter of the surface, tagged with the reason's own letter. */
const gutter = computed(() => `R:${reasonMeta.value?.letter ?? ''}`)
/** A 400 that named the comment marks the comment — a 500 does not. */
const surfaceInvalid = computed(() => props.error?.kind === 'validation')

// Local check (not useGsap) — the probe must stay testable without GSAP, the
// same way the bay checks it.
function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function clearSettleTimer(): void {
  if (settleTimer === null) return
  window.clearTimeout(settleTimer)
  settleTimer = null
}

/** The morph is over: the twin is gone, the anchor is material. */
function settle(): void {
  clearSettleTimer()
  flight.value = null
  landed.value = true
  const body = bodyRef.value
  if (body) body.style.height = ''
}

/** GSAP flies; the timer is the floor that also catches a silenced tween. */
function scheduleSettle(delay: number): void {
  clearSettleTimer()
  settleTimer = window.setTimeout(settle, delay)
}

/**
 * FLIP the probe body's height across a stage change, so the scene swap is
 * a morph and not a jump of everything under it.
 */
function flipHeight(before: number): void {
  const body = bodyRef.value
  if (!body) return
  const after = body.offsetHeight
  if (before <= 0 || after <= 0 || before === after) return
  body.style.height = `${before}px`
  gsap.fromTo(
    body,
    { height: before },
    {
      height: after,
      duration: FLIGHT_MS / 1000,
      ease: 'power3.inOut',
      onComplete: settle,
    },
  )
}

/** The chosen node lifts out of the constellation and lands on the anchor. */
async function takeFlight(
  from: DOMRect,
  to: DOMRect,
  glyph: NetworkIconName,
): Promise<void> {
  flight.value = {
    glyph,
    style: {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width || NODE_RING}px`,
      height: `${from.height || NODE_RING}px`,
    },
  }
  await nextTick()
  const el = flightRef.value
  if (!el) return
  const dx = to.left + to.width / 2 - (from.left + from.width / 2)
  const dy = to.top + to.height / 2 - (from.top + from.height / 2)
  const scale = from.width > 0 && to.width > 0 ? to.width / from.width : 1
  gsap.to(el, { x: dx, y: dy, scale, duration: FLIGHT_MS / 1000, ease: 'power2.inOut' })
  gsap.to(el, {
    opacity: 0,
    duration: 0.12,
    delay: HANDOVER_MS / 1000,
    ease: 'power1.out',
  })
}

async function onPick(next: ReportReason) {
  // The constellation has already departed — there is no second pick.
  if (stage.value === 2) return

  const reduced = reducedMotion()
  const glyph = REASON_META[next].glyph
  const from = constellationRef.value?.nodeRect(next) ?? null
  const heightBefore = bodyRef.value?.offsetHeight ?? 0

  quiet.value = reduced
  landed.value = false
  stage.value = 2
  reason.value = next
  // the rest of the constellation starts dying along its wires in the very
  // frame the chosen node leaves its slot — not a frame later
  constellationRef.value?.recede(next, { reduced })

  await nextTick()
  const to = anchorRef.value?.getBoundingClientRect() ?? null
  if (reduced) {
    // No flight: the stage fades in, the constellation fades out.
    landed.value = true
  } else {
    flipHeight(heightBefore)
    if (from && to) await takeFlight(from, to, glyph)
    scheduleSettle(FLIGHT_MS + 80)
  }

  await nextTick()
  surfaceRef.value?.focus()
}

/** «изменить»: the same flight, played backwards along the same wire. */
async function backToConstellation(): Promise<void> {
  if (stage.value !== 2) return

  const current = reason.value
  const reduced = reducedMotion()
  const glyph = current ? REASON_META[current].glyph : 'other'
  const from = anchorRef.value?.getBoundingClientRect() ?? null
  const heightBefore = bodyRef.value?.offsetHeight ?? 0

  landed.value = false
  quiet.value = false
  stage.value = 1
  // the reason is free again the moment the node leaves the anchor — the
  // flight only plays the visual that is already decided
  reason.value = null

  await nextTick()
  const to = current ? (constellationRef.value?.nodeRect(current) ?? null) : null
  if (reduced) {
    constellationRef.value?.restore(null, { reduced: true })
  } else {
    flipHeight(heightBefore)
    if (from && to) await takeFlight(from, to, glyph)
    scheduleSettle(FLIGHT_MS + 80)
    // the constellation comes back while the twin is still in the air
    constellationRef.value?.restore(current, { reduced: false })
  }
  if (current) constellationRef.value?.focusNode(current)
}

function submit() {
  if (!reason.value || props.submitting) return
  emit('submit', { reason: reason.value, comment: comment.value })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    if (stage.value === 2 && !comment.value) void backToConstellation()
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
    <!-- the entrance lives on an inner shell: a transform on the probe root
         would become the containing block of the fixed-position flight -->
    <div class="probe-shell">
      <header class="probe-head">
        <span class="probe-head__kicker">жалоба</span>
        <span class="probe-head__target">#{{ postId }}</span>
        <DraftBeacon class="probe-head__beacon" :state="status" :saved-at="savedAt" />
        <button
          type="button"
          class="probe-head__close"
          aria-label="Закрыть жалобу"
          @click="emit('close')"
        >
          <NetworkIcon name="close" :size="14" :stroke-width="2" />
        </button>
      </header>

      <!-- Both stages live in the DOM at all times: the stage is a class on the
           body (and aria-hidden on the scene that is not current), never a
           v-if swap that would destroy the geometry the morph flies along. -->
      <div
        ref="bodyRef"
        class="probe-body"
        :class="{ 'is-stage-2': stage === 2, 'is-landed': landed, 'is-quiet': quiet }"
      >
        <div
          class="probe-scene probe-scene--constellation"
          data-testid="probe-scene-1"
          :aria-hidden="stage === 2 || undefined"
          :inert="stage === 2 || undefined"
        >
          <ReasonConstellation ref="constellationRef" v-model="reason" @pick="onPick" />
        </div>

        <div
          class="probe-scene probe-scene--anchor"
          data-testid="probe-stage-2"
          :aria-hidden="stage === 1 || undefined"
          :inert="stage === 1 || undefined"
        >
          <!-- the anchor is the very node that was chosen, not a new circle:
               the same 34px reason ring, in the place the flight lands -->
          <div class="probe-anchor">
            <span ref="anchorRef" class="probe-anchor__node react-edge">
              <NetworkIcon
                v-if="reasonMeta"
                :name="reasonMeta.glyph"
                :size="16"
                :stroke-width="1.6"
              />
            </span>
            <!-- the chosen reason keeps its ink line: the accent stays where
                 the pen was, without a flash or a jump -->
            <span v-if="reasonMeta" class="probe-anchor__label react-ink">{{
              reasonMeta.label
            }}</span>
            <button
              type="button"
              class="probe-anchor__change"
              aria-label="Выбрать другую причину"
              @click="backToConstellation()"
            >
              изменить
            </button>
          </div>

          <!-- the refusal is woven into the probe scene: an inline node on the
               anchor's own line, reading the reason it belongs to -->
          <div
            v-if="error"
            id="probe-notice"
            class="probe-notice"
            data-testid="probe-error"
          >
            <TransmitNotice :error="error" @retry="emit('retry')" />
          </div>

          <SignalSurface
            ref="surfaceRef"
            v-model="comment"
            :gutter="gutter"
            label="Комментарий к жалобе"
            placeholder="Комментарий (необязательно)"
            :max-length="1000"
            :invalid="surfaceInvalid"
            :described-by="error ? 'probe-notice' : undefined"
          />

          <div class="probe-submit">
            <span class="probe-submit__label">отправить жалобу</span>
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
    </div>

    <!-- the flight: a fixed twin of the chosen node's ring, from its slot in
         the constellation to the anchor of stage 2 -->
    <span
      v-if="flight"
      ref="flightRef"
      class="probe-flight"
      :style="flight.style"
      aria-hidden="true"
      data-testid="probe-flight"
    >
      <span class="probe-flight__ring">
        <NetworkIcon :name="flight.glyph" :size="16" :stroke-width="1.6" />
      </span>
    </span>
  </div>
</template>

<style scoped>
.report-probe {
  position: relative;
  margin-top: var(--space-4);
  padding: var(--space-4);
  background: var(--paper-raised);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

/* the probe opens as a node arriving at the post, not a box dropping in */
.probe-shell {
  animation: probe-in var(--motion-reveal) var(--ease-entrance);
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
  font-family: var(--font-body);
  font-size: 0.64rem;
  color: var(--accent);
}

.probe-head__target {
  font-family: var(--font-body);
  font-size: 0.72rem;
  color: var(--ink-tertiary);
}

/* buffer beacon — compact, tucked between the target and the close node */
.probe-head__beacon {
  margin-left: auto;
  font-size: 0.64rem;
}

.probe-head__close {
  margin-left: var(--space-2);
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--ink-tertiary);
  border-radius: 50%;
  display: grid;
  place-items: center;
  /* тихая реакция: цвет и подложка, без «вспышки» */
  transition:
    color var(--motion-hover),
    background-color var(--motion-hover);
}

.probe-head__close:hover {
  color: var(--ink);
  background: var(--paper-raised);
}

/* --- the two stages ---------------------------------------------------
   The body owns the stage as a class. In stage 1 the constellation is in
   flow and owns the height; in stage 2 it steps out of the flow without
   losing a single pixel of its geometry (same box, same node slots), and
   the anchor scene takes the flow over. GSAP tweens the height across the
   swap, so nothing under the probe jumps. */
.probe-body {
  position: relative;
}

.probe-body.is-stage-2 .probe-scene--constellation {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  pointer-events: none;
}

/* once the flight has landed the empty constellation is not even in the
   tab order — and it stops reserving scroll space under the probe */
.probe-body.is-stage-2.is-landed .probe-scene--constellation,
.probe-body.is-quiet .probe-scene--constellation {
  visibility: hidden;
  height: 0;
  overflow: hidden;
}

/* the scene that is not current is out of the flow and clipped to nothing:
   it must not add scroll space to the page while it waits its turn */
.probe-scene--anchor {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
}

.probe-body.is-stage-2 .probe-scene--anchor {
  position: relative;
  height: auto;
  overflow: visible;
  visibility: visible;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* the anchor materialises as the flying node lands on it */
.probe-anchor {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  opacity: 0;
  /* Только прозрачность: кольцо уже прилетело в эту точку, увеличивать
     или подпрыгивать здесь нечего — узел просто проявляется. */
  transition: opacity var(--motion-hover);
}

.probe-body.is-stage-2.is-landed .probe-anchor,
.probe-body.is-quiet .probe-anchor {
  opacity: 1;
}

.probe-body.is-quiet .probe-anchor {
  transition: none;
}

/* the same 34px reason ring the constellation nodes use — one geometry */
.probe-anchor__node {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--paper);
  flex-shrink: 0;
  /* the light of the cursor stays inside the ring — it is a highlight on
     the paper, not a lamp behind it */
  overflow: hidden;
}

.probe-anchor__label {
  display: inline-block;
  font-family: var(--font-body);
  font-size: 0.78rem;
  color: var(--ink);
}

/* the chosen reason keeps its ink line — the accent stays where the pen
   was, and it does not flash or jump when it appears */
.probe-anchor__label.react-ink::after {
  transform: scaleX(1);
}

.probe-anchor__change {
  margin-left: auto;
  background: none;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  font-size: 0.7rem;
  color: var(--ink-tertiary);
  text-decoration: underline;
  text-underline-offset: 3px;
  /* тихая реакция: только цвет чернил */
  transition: color var(--motion-hover);
}

.probe-anchor__change:hover {
  color: var(--accent);
}

/* the notice hangs off the anchor's own line — a node of the scene, not a
   row under the form */
.probe-notice {
  margin-left: 17px;
  padding-left: var(--space-3);
  border-left: 1px solid color-mix(in oklab, var(--danger) 32%, var(--rule));
}

.probe-submit {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
}

.probe-submit__label {
  font-family: var(--font-body);
  font-size: 0.68rem;
  color: var(--ink-secondary);
}

/* the flying twin of the chosen node */
.probe-flight {
  position: fixed;
  z-index: 5;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.probe-flight__ring {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px solid var(--accent);
  background: var(--paper);
  color: var(--accent);
  display: grid;
  place-items: center;
}

@media (max-width: 400px) {
  /* narrow posts: the beacon stays a single dot, the label lives in its title */
  .probe-head__beacon :deep(.beacon__text) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .probe-shell {
    animation: none;
  }

  .probe-anchor,
  .probe-anchor__change,
  .probe-head__close {
    transition: none;
  }
}
</style>

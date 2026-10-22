<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { usePress } from '@/composables/useMotion'
import NetworkIcon from './NetworkIcon.vue'

/**
 * TRANSMIT node (SIGNAL-07). Not a rectangular button.
 *
 * Idle      : thin ring
 * Ready     : ring charges (amber)
 * Hover     : outer orbit (the instrument shows its second ring)
 * Press     : the ink is absorbed — the ring darkens and the sheet sinks
 * Submitting: progress travels around the circumference
 * Success   : the wash spreads once over the paper
 * Error     : ring breaks briefly
 *
 * Nothing here changes size: the node is an instrument, and instruments do
 * not grow under the finger. Reactions are light, edge and ink.
 */
const props = defineProps<{
  disabled?: boolean
  submitting?: boolean
  ready?: boolean
  successToken?: number
  errorToken?: number
}>()

const emit = defineEmits<{ transmit: [] }>()

const el = ref<HTMLElement | null>(null)
const r = 17
const C = 2 * Math.PI * r

// «Чернила впитались»: состояние нажатия ставится примитивом, а не
// вручную — так нажатие мышью и нажатие клавиши читаются одинаково.
usePress(el)

const phase = ref<'idle' | 'hover' | 'submitting' | 'error'>('idle')
/** The pointer is over the node: the orbit must survive a click. */
const hovering = ref(false)
const showSuccess = ref(false)

/**
 * The charge ring is a STATE, not a decoration:
 *  - at rest the node is a thin ring — no arc, no stray stroke;
 *  - armed (ready) the ring is closed: the whole circumference is ink;
 *  - sending a segment travels around the ring — the progress is visible.
 * Before this the arc was drawn at a fixed 22 % in every state, and read as
 * a broken stroke lying over the icon rather than as part of the instrument.
 */
const CHARGE_SEGMENT = 0.28

const chargeLength = computed(() => {
  if (props.submitting) return C * CHARGE_SEGMENT
  if (props.ready && !props.disabled) return C
  return 0
})

/** The dash pattern is a custom property, so the ring can fill up smoothly. */
const chargeStyle = computed(() => ({
  '--charge-len': `${chargeLength.value}px`,
  '--charge-gap': `${C}px`,
}))

function startError() {
  phase.value = 'error'
  window.setTimeout(() => {
    if (!props.submitting) phase.value = hovering.value ? 'hover' : 'idle'
  }, 300)
}

// successToken bump → success burst
watch(
  () => props.successToken,
  (n, o) => {
    if (n === undefined || n === o) return
    showSuccess.value = true
    window.setTimeout(() => (showSuccess.value = false), 700)
  },
)

// errorToken bump → ring breaks briefly (parent signals API failure)
watch(
  () => props.errorToken,
  (n, o) => {
    if (n === undefined || n === o) return
    startError()
  },
)

/**
 * The transmission itself.
 *
 * The press REACTION (ink absorbed) is the primitive's job — `usePress`
 * puts `data-pressed` on the node for both mouse and keyboard — so this
 * function only sends the intent.
 */
function press() {
  if (props.disabled || props.submitting) return
  emit('transmit')
}

/** The finger left the paper: the node keeps its orbit if the pointer stayed. */
function release() {
  if (props.submitting) return
  phase.value = hovering.value ? 'hover' : 'idle'
}

function hover(on: boolean) {
  hovering.value = on
  if (props.submitting || phase.value === 'error') return
  phase.value = on ? 'hover' : 'idle'
}
</script>

<template>
  <div
    ref="el"
    class="transmit react-press"
    :class="[
      `transmit--${phase}`,
      {
        'transmit--success': showSuccess,
        'transmit--ready': ready && !disabled,
        'transmit--submitting': submitting,
      },
    ]"
    role="button"
    tabindex="0"
    :aria-label="submitting ? 'Отправка…' : 'Передать сообщение'"
    :aria-disabled="disabled || submitting"
    @click="press"
    @keydown.enter.prevent="press"
    @keydown.space.prevent="press"
    @mouseenter="hover(true)"
    @mouseleave="hover(false)"
    @mousedown="press"
    @mouseup="release"
  >
    <svg class="transmit__ring" viewBox="0 0 48 48" aria-hidden="true">
      <circle
        class="transmit__track"
        cx="24"
        cy="24"
        :r="r"
        fill="none"
        :stroke-width="1.4"
      />
      <circle
        class="transmit__charge"
        cx="24"
        cy="24"
        :r="r"
        fill="none"
        :stroke-width="2.2"
        :style="chargeStyle"
        transform="rotate(-90 24 24)"
      />
    </svg>
    <span class="transmit__glyph" aria-hidden="true">
      <NetworkIcon
        :name="showSuccess ? 'check' : 'transmit'"
        :size="18"
        :stroke-width="1.8"
      />
    </span>
    <span v-if="showSuccess" class="transmit__burst" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.transmit {
  position: relative;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  cursor: pointer;
  outline: none;
  border-radius: 50%;
  -webkit-tap-highlight-color: transparent;
  /* Только конкретные свойства и только семантические роли: нажатие
     вдавливает лист, фокус и наведение — тихие. */
  transition:
    box-shadow var(--motion-press),
    transform var(--motion-press);
}

/* Наведение — внешняя орбита: у прибора появляется второе кольцо.
   Размер кольца не меняется — прибор не растёт, он показывает себя. */
.transmit::before {
  content: '';
  position: absolute;
  inset: -6px;
  border: 1px solid var(--accent);
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion-hover);
}

.transmit--hover::before,
.transmit:focus-visible::before {
  opacity: 0.45;
}

.transmit:focus-visible {
  box-shadow:
    0 0 0 2px var(--paper),
    0 0 0 4px var(--accent);
}

.transmit--error .transmit__charge {
  stroke: var(--danger);
  /* Роль наведения несёт и длительность, и кривую: добавлять вторую
     timing-функцию после неё нельзя — сокращение становится невалидным
     и кольцо не ломается вовсе. */
  animation: break-ring var(--motion-hover);
}

.transmit--submitting {
  cursor: progress;
}

.transmit__ring {
  position: absolute;
  inset: 0;
  width: 48px;
  height: 48px;
}

.transmit__track {
  stroke: var(--rule);
  transition: stroke var(--motion-press);
}

/* Нажатие: чернила впитались — кольцо темнеет, но не меняет размер. */
.transmit[data-pressed='true'] .transmit__track {
  stroke: var(--ink-tertiary);
}

.transmit__charge {
  stroke: var(--accent);
  /* The dash pattern comes from a custom property: the ring can fill up and
     empty again instead of jumping between two lengths. */
  stroke-dasharray: var(--charge-len, 0px) var(--charge-gap, 0px);
  transition:
    stroke-dasharray var(--motion-hover),
    stroke var(--motion-press);
}

.transmit[data-pressed='true'] .transmit__charge {
  stroke: var(--accent-hover);
}

.transmit--submitting .transmit__charge {
  /* Заряд вращается равномерно: линейная крива обязательна, иначе
     кольцо дёргается на стыке цикла. Свой ритм — поэтому он назван
     здесь, а не написан в анимации. */
  --charge-spin-rhythm: var(--motion-cinematic-duration) linear;
  animation: charge-spin var(--charge-spin-rhythm) infinite;
}

.transmit--error .transmit__track {
  stroke: var(--danger-dim);
}

.transmit__glyph {
  color: var(--ink-secondary);
  transition: color var(--motion-hover);
}

.transmit--ready .transmit__glyph,
.transmit--hover .transmit__glyph {
  color: var(--accent);
}

.transmit--success .transmit__glyph {
  color: var(--success);
}

/* Успех — волна чернил по бумаге: кольцо расходится СВОИМ краем
   (растущий отступ), а не масштабом самого элемента. */
.transmit__burst {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid var(--success);
  animation: success-burst var(--motion-reveal) var(--ease-entrance) forwards;
  pointer-events: none;
}

/* The ring starts at the top (the SVG carries rotate(-90)), and the CSS
   animation wins over that attribute — so the keyframes keep the same
   base angle. Otherwise the charge would jump a quarter turn at the
   moment the send starts. */
@keyframes charge-spin {
  from {
    transform: rotate(-90deg);
  }
  to {
    transform: rotate(270deg);
  }
}

@keyframes success-burst {
  0% {
    box-shadow: 0 0 0 0 color-mix(in oklab, var(--success) 45%, transparent);
    opacity: 0.9;
  }
  100% {
    box-shadow: 0 0 0 14px transparent;
    opacity: 0;
  }
}

@keyframes break-ring {
  0%,
  100% {
    opacity: 1;
    transform: rotate(-90deg);
  }
  25% {
    opacity: 0.3;
    transform: rotate(-130deg);
  }
  50% {
    opacity: 0.6;
    transform: rotate(-60deg);
  }
  75% {
    opacity: 0.2;
    transform: rotate(-102deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .transmit,
  .transmit::before,
  .transmit__track,
  .transmit__charge,
  .transmit__glyph,
  .transmit__burst {
    transition: none;
    animation: none;
  }
}
</style>

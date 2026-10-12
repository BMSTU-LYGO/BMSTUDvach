<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import NetworkIcon from './NetworkIcon.vue'

/**
 * TRANSMIT node (SIGNAL-07). Not a rectangular button.
 *
 * Idle      : thin ring
 * Ready     : ring charges (amber)
 * Hover     : outer orbit
 * Press     : ring contracts
 * Submitting: progress travels around the circumference
 * Success   : pulse burst (parent drives via successToken)
 * Error     : ring breaks briefly
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

const phase = ref<'idle' | 'hover' | 'press' | 'submitting' | 'error'>('idle')
const showSuccess = ref(false)

const progress = computed(() => (props.submitting ? 0.62 : props.ready ? 0.9 : 0.22))
const dashOffset = computed(() => C * (1 - progress.value))

function startError() {
  phase.value = 'error'
  window.setTimeout(() => {
    if (!props.submitting) phase.value = 'idle'
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

function press() {
  if (props.disabled || props.submitting) return
  phase.value = 'press'
  emit('transmit')
}

function release() {
  if (!props.submitting) phase.value = 'idle'
}

function hover(on: boolean) {
  if (!props.submitting && phase.value !== 'press') phase.value = on ? 'hover' : 'idle'
}
</script>

<template>
  <div
    ref="el"
    class="transmit"
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
        :stroke-dasharray="C"
        :stroke-dashoffset="dashOffset"
        transform="rotate(-90 24 24)"
      />
    </svg>
    <span class="transmit__glyph" aria-hidden="true">
      <NetworkIcon :name="showSuccess ? 'check' : 'transmit'" :size="18" :stroke-width="1.8" />
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
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
  -webkit-tap-highlight-color: transparent;
}

.transmit:focus-visible {
  box-shadow: 0 0 0 2px var(--bg-deep), 0 0 0 4px var(--accent);
}

.transmit--hover {
  transform: scale(1.06);
}

.transmit--press {
  transform: scale(0.94);
}

.transmit--error .transmit__charge {
  stroke: var(--danger);
  animation: break-ring 300ms ease-in-out;
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
  stroke: var(--border-medium);
}

.transmit__charge {
  stroke: var(--accent);
  transition: stroke-dashoffset 260ms cubic-bezier(0.25, 1, 0.5, 1);
}

.transmit--submitting .transmit__charge {
  animation: charge-spin 1s linear infinite;
  stroke-dashoffset: 0;
}

.transmit--error .transmit__track {
  stroke: var(--danger-dim);
}

.transmit__glyph {
  color: var(--text-secondary);
  transition: color 180ms;
}

.transmit--ready .transmit__glyph,
.transmit--hover .transmit__glyph {
  color: var(--accent);
}

.transmit--success .transmit__glyph {
  color: var(--success);
}

.transmit__burst {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid var(--success);
  animation: success-burst 700ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  pointer-events: none;
}

@keyframes charge-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes success-burst {
  0% {
    transform: scale(0.5);
    opacity: 0.9;
  }
  100% {
    transform: scale(2.4);
    opacity: 0;
  }
}

@keyframes break-ring {
  0%,
  100% {
    opacity: 1;
    transform: rotate(0deg);
  }
  25% {
    opacity: 0.3;
    transform: rotate(-40deg);
  }
  50% {
    opacity: 0.6;
    transform: rotate(30deg);
  }
  75% {
    opacity: 0.2;
    transform: rotate(-12deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .transmit,
  .transmit__charge,
  .transmit__burst {
    transition: none;
    animation: none;
  }
}
</style>
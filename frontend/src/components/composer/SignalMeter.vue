<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Signal integrity meter (SIGNAL-06). Replaces "142 / 20000" counters.
 *
 * - < 80%  : almost invisible
 * - 80-95% : amber
 * - 95-100%: stronger warning
 * - > 100% : broken red signal + textual error
 */
const props = defineProps<{
  current: number
  max: number
  errorLabel?: string
}>()

const hovered = ref(false)
const ratio = computed(() => (props.max > 0 ? props.current / props.max : 0))
const zone = computed(() => {
  if (ratio.value > 1) return 'over'
  if (ratio.value >= 0.95) return 'critical'
  if (ratio.value >= 0.8) return 'warn'
  return 'ok'
})
const pct = computed(() => Math.round(ratio.value * 100))
const dot = computed(() => Math.min(100, Math.max(4, pct.value)))

const gaugeStyle = computed(() => ({
  background: `linear-gradient(90deg, var(--meter-color) ${dot.value}%, transparent ${dot.value}%)`,
}))
</script>

<template>
  <div
    class="signal-meter"
    :class="`signal-meter--${zone}`"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <div
      class="signal-meter__line"
      :style="gaugeStyle"
      role="meter"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow="pct"
      :aria-label="`${current} из ${max} символов`"
    ></div>
    <span v-if="hovered" class="signal-meter__readout">{{ current }} / {{ max }}</span>
    <span v-if="zone === 'over'" class="signal-meter__error" role="alert">
      {{ errorLabel || 'Превышен лимит сигнала' }}
    </span>
  </div>
</template>

<style scoped>
.signal-meter {
  --meter-color: transparent;
  position: relative;
  width: 64px;
  height: 14px;
  display: flex;
  align-items: center;
}

.signal-meter__line {
  width: 100%;
  height: 2px;
  border-radius: 1px;
  /* линия сигнала меняет тон тихо: роль наведения (150ms). */
  transition: background var(--motion-hover);
  opacity: 0.5;
}

.signal-meter--ok {
  --meter-color: var(--ink-tertiary);
  opacity: 0.35;
}

.signal-meter--warn {
  --meter-color: var(--accent);
  opacity: 1;
}

.signal-meter--critical {
  --meter-color: var(--accent-hover);
  opacity: 1;
}

.signal-meter--over {
  --meter-color: var(--danger);
  opacity: 1;
}

.signal-meter--over .signal-meter__line {
  /* Разрыв мигает раз в 300 мс — ритм самого обрыва, а не роль движения. */
  --broken-line-rhythm: 300ms steps(2);
  background: linear-gradient(90deg, var(--danger) 0%, var(--danger) 100%);
  animation: broken-line var(--broken-line-rhythm) infinite;
}

@keyframes broken-line {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
  100% {
    opacity: 1;
  }
}

.signal-meter__readout {
  position: absolute;
  top: 16px;
  right: 0;
  font-family: var(--font-body);
  font-size: 0.68rem;
  color: var(--ink-secondary);
  white-space: nowrap;
}

.signal-meter__error {
  position: absolute;
  top: 16px;
  right: 0;
  font-family: var(--font-body);
  font-size: 0.72rem;
  color: var(--danger);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .signal-meter--over .signal-meter__line {
    animation: none;
  }
}
</style>

<script lang="ts">
export type NetworkIconName =
  | 'attach'
  | 'transmit'
  | 'clear'
  | 'reply'
  | 'report'
  | 'spam'
  | 'abuse'
  | 'illegal'
  | 'offtopic'
  | 'other'
  | 'close'
  | 'buffer'
  | 'command'
  | 'check'
  | 'warning'
</script>

<script setup lang="ts">
/**
 * Unified network glyph set (SIGNAL-21).
 * One stroke weight, one corner treatment, currentColor, no emoji.
 */
withDefaults(
  defineProps<{
    name: NetworkIconName
    size?: 16 | 20 | 24
    strokeWidth?: number
  }>(),
  { size: 20, strokeWidth: 1.6 },
)
</script>

<template>
  <svg
    class="network-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke-width="strokeWidth"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <!-- attach: paperclip as a signal link -->
    <template v-if="name === 'attach'">
      <path d="M8 12.5 14.5 6a3.5 3.5 0 0 1 5 5L11 19.5a5 5 0 0 1-7-7l8-8" />
    </template>

    <!-- transmit: node with outbound pulse -->
    <template v-else-if="name === 'transmit'">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <path d="M6.3 6.3 8.4 8.4M15.6 15.6l2.1 2.1M17.7 6.3 15.6 8.4M8.4 15.6l-2.1 2.1" />
    </template>

    <!-- clear: broken signal -->
    <template v-else-if="name === 'clear'">
      <path d="M4 12h5M15 12h5" />
      <path d="M9 9l3 3-3 3M15 9l-3 3 3 3" />
    </template>

    <!-- reply: fiber bending back -->
    <template v-else-if="name === 'reply'">
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h9a6 6 0 0 1 6 6v1" />
    </template>

    <!-- report: alert node -->
    <template v-else-if="name === 'report'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v5M12 16.2v.3" />
    </template>

    <!-- spam: crossed-out packet -->
    <template v-else-if="name === 'spam'">
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M4 9l8 5 8-5" />
      <path d="M5 19 19 5" />
    </template>

    <!-- abuse: impact -->
    <template v-else-if="name === 'abuse'">
      <path d="M12 3l2.4 6.2L21 10l-5 4.2L17.4 21 12 17.4 6.6 21 8 14.2 3 10l6.6-.8z" />
    </template>

    <!-- illegal: prohibited -->
    <template v-else-if="name === 'illegal'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </template>

    <!-- offtopic: drifting node -->
    <template v-else-if="name === 'offtopic'">
      <circle cx="7" cy="8" r="2.4" />
      <circle cx="17" cy="16" r="2.4" />
      <path d="M9 9.6 15 14.4" stroke-dasharray="2 2.4" />
    </template>

    <!-- other: unknown node -->
    <template v-else-if="name === 'other'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.6 2.6 0 1 1 3.4 2.5c-.7.3-1 .8-1 1.6v.4" />
      <path d="M12 17v.3" />
    </template>

    <!-- close: split -->
    <template v-else-if="name === 'close'">
      <path d="M6 6l12 12M18 6 6 18" />
    </template>

    <!-- buffer: ring with core -->
    <template v-else-if="name === 'buffer'">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </template>

    <!-- command: lens / chevron -->
    <template v-else-if="name === 'command'">
      <path d="M9 4 5 12l4 8M15 4l4 8-4 8" />
    </template>

    <!-- check: resolved -->
    <template v-else-if="name === 'check'">
      <path d="M5 12.5 10 17l9-10" />
    </template>

    <!-- warning: integrity -->
    <template v-else-if="name === 'warning'">
      <path d="M12 4 3 19h18z" />
      <path d="M12 10v4M12 16.6v.3" />
    </template>
  </svg>
</template>

<style scoped>
.network-icon {
  display: block;
  flex-shrink: 0;
}
</style>
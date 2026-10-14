<script setup lang="ts">
import { computed } from 'vue'

import { highlightRanges } from '@/api/search'

/**
 * Highlights the hits of the raw scan query inside one result string.
 *
 * The query is split the same way the backend splits it, so an operator
 * token never lights up as a match: a `board:` slug is only a scope, while
 * a `title:` word is what the titles were matched on. `<mark>` carries the
 * semantics natively, and the palette comes from the theme tokens so the
 * marks read as signal, not as shouting.
 */

interface Segment {
  text: string
  hit: boolean
}

const props = defineProps<{
  text: string
  query: string
}>()

const segments = computed<Segment[]>(() => {
  const parts: Segment[] = []
  let cursor = 0
  for (const [start, end] of highlightRanges(props.text, props.query)) {
    if (start > cursor) {
      parts.push({ text: props.text.slice(cursor, start), hit: false })
    }
    parts.push({ text: props.text.slice(start, end), hit: true })
    cursor = end
  }
  if (cursor < props.text.length) {
    parts.push({ text: props.text.slice(cursor), hit: false })
  }
  return parts
})
</script>

<template>
  <template v-for="(segment, i) in segments" :key="i">
    <mark v-if="segment.hit" class="scan__mark">{{ segment.text }}</mark>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>

<style scoped>
.scan__mark {
  background: var(--accent-dim);
  color: var(--ink);
  border-radius: var(--radius-sm);
  padding: 0 1px;
  font-weight: inherit;
}
</style>

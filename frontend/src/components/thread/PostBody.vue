<script setup lang="ts">
import { computed } from 'vue'

import { parsePostLinks } from '@/composables/usePostLinks'

/**
 * Post body with `>>123` links rendered as real anchors (native keyboard,
 * middle-click and copy-link still work). Links to ids that do not exist
 * in the thread stay visible but marked dead — honest over pretending.
 */
const props = defineProps<{
  body: string
  knownIds: Set<number>
}>()

const emit = defineEmits<{
  navigate: [id: number]
  preview: [id: number, event: MouseEvent]
  'preview-leave': []
}>()

const tokens = computed(() => parsePostLinks(props.body))
</script>

<template>
  <div class="post-body">
    <template v-for="(token, i) in tokens" :key="i">
      <span v-if="token.type === 'text'">{{ token.value }}</span>
      <a
        v-else
        class="post-link"
        :class="{ 'post-link--dead': !knownIds.has(token.id) }"
        :href="`#post-${token.id}`"
        :data-target="token.id"
        :aria-disabled="!knownIds.has(token.id) || undefined"
        :title="knownIds.has(token.id) ? `Пост #${token.id}` : 'Пост не найден'"
        @click.prevent="knownIds.has(token.id) && emit('navigate', token.id)"
        @mouseenter="knownIds.has(token.id) && emit('preview', token.id, $event)"
        @mouseleave="emit('preview-leave')"
        >&gt;&gt;{{ token.id }}</a
      >
    </template>
  </div>
</template>

<style scoped>
.post-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  color: var(--text-primary);
}

.post-link {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px dotted color-mix(in oklab, var(--accent) 55%, transparent);
  font-family: var(--font-display);
  font-size: 0.86em;
  transition: color var(--duration-fast), border-color var(--duration-fast);
}

.post-link:hover {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}

.post-link--dead {
  color: var(--text-muted);
  border-bottom-color: transparent;
  cursor: default;
}

.post-link--dead:hover {
  color: var(--text-muted);
}
</style>

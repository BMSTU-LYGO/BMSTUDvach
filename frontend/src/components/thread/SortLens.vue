<script setup lang="ts">
import type { ThreadOrder } from '@/api/threads'

const props = defineProps<{ modelValue: ThreadOrder }>()

const emit = defineEmits<{ change: [order: ThreadOrder] }>()

const OPTIONS: ReadonlyArray<{ value: ThreadOrder; label: string; title: string }> = [
  { value: 'bump', label: 'ап', title: 'По активности' },
  { value: 'replies', label: 'ответы', title: 'По числу ответов' },
  { value: 'newest', label: 'новые', title: 'По дате создания' },
]

function select(order: ThreadOrder) {
  if (order === props.modelValue) return
  emit('change', order)
}
</script>

<template>
  <div class="sort-lens" role="group" aria-label="Сортировка тредов">
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      class="sort-lens__btn"
      :class="{ 'sort-lens__btn--active': modelValue === option.value }"
      :data-order="option.value"
      :aria-label="option.title"
      :aria-pressed="modelValue === option.value"
      :title="option.title"
      @click="select(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.sort-lens {
  display: inline-flex;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-surface);
}

.sort-lens__btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0 var(--space-3);
  display: grid;
  place-items: center;
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out-quart),
    background var(--duration-fast) var(--ease-out-quart);
}

.sort-lens__btn:hover {
  color: var(--text-primary);
  background: var(--bg-raised);
}

.sort-lens__btn--active {
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 10%, transparent);
}

.sort-lens__btn + .sort-lens__btn {
  border-left: 1px solid var(--border-subtle);
}

@media (prefers-reduced-motion: reduce) {
  .sort-lens__btn {
    transition: none;
  }
}
</style>

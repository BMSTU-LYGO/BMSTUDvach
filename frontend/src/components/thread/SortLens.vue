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
  border: 1px solid var(--rule);
  border-radius: 0;
  overflow: hidden;
  background: transparent;
}

.sort-lens__btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0 var(--space-3);
  display: grid;
  place-items: center;
  background: none;
  border: none;
  color: var(--ink-tertiary);
  font-family: var(--font-body);
  font-size: 0.875rem;
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}

.sort-lens__btn:hover {
  color: var(--ink);
  background: var(--paper-sunken);
}

.sort-lens__btn--active {
  color: var(--accent);
}

.sort-lens__btn + .sort-lens__btn {
  border-left: 1px solid var(--rule);
}

@media (prefers-reduced-motion: reduce) {
  .sort-lens__btn {
    transition: none;
  }
}
</style>

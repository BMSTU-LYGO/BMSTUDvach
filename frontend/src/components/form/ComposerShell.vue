<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  expanded?: boolean
  submitting?: boolean
  success?: boolean
}>()

const emit = defineEmits<{
  'update:expanded': [value: boolean]
  submit: []
  cancel: []
}>()

const isExpanded = computed({
  get: () => props.expanded ?? false,
  set: (value) => emit('update:expanded', value),
})

function toggle() {
  isExpanded.value = !isExpanded.value
}

function handleSubmit() {
  emit('submit')
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <div
    class="composer-shell"
    :class="{
      'composer-shell--expanded': isExpanded,
      'composer-shell--submitting': submitting,
      'composer-shell--success': success,
    }"
  >
    <div class="composer-shell__header" @click="toggle">
      <div class="composer-shell__title">
        <slot name="title">
          <span v-if="!isExpanded">Ответить в тред...</span>
          <span v-else>Новый ответ</span>
        </slot>
      </div>
      <button
        v-if="!isExpanded"
        type="button"
        class="composer-shell__expand"
        aria-label="Развернуть"
      >
        ▼
      </button>
    </div>

    <div v-if="isExpanded" class="composer-shell__body">
      <slot />

      <div class="composer-shell__footer">
        <slot name="footer">
          <div class="composer-shell__actions">
            <button
              type="button"
              class="composer-shell__cancel"
              @click="handleCancel"
            >
              Отмена
            </button>
            <button
              type="button"
              class="composer-shell__submit"
              :disabled="submitting"
              @click="handleSubmit"
            >
              {{ submitting ? 'Отправка...' : 'Отправить' }}
            </button>
          </div>
        </slot>
      </div>
    </div>

    <div v-if="submitting" class="composer-shell__progress"></div>
  </div>
</template>

<style scoped>
.composer-shell {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all var(--transition-base);
}

.composer-shell--expanded {
  border-color: var(--border-medium);
}

.composer-shell--submitting {
  border-color: var(--accent);
}

.composer-shell--success {
  border-color: var(--success);
}

.composer-shell__header {
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.composer-shell__header:hover {
  background: var(--bg-raised);
}

.composer-shell__title {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.composer-shell__expand {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  padding: var(--space-1);
  transition: transform var(--transition-fast);
}

.composer-shell--expanded .composer-shell__expand {
  transform: rotate(180deg);
}

.composer-shell__body {
  border-top: 1px solid var(--border-subtle);
  padding: var(--space-4);
}

.composer-shell__footer {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-subtle);
}

.composer-shell__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

.composer-shell__cancel {
  padding: var(--space-2) var(--space-4);
  background: transparent;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.composer-shell__cancel:hover {
  background: var(--bg-raised);
  color: var(--text-primary);
}

.composer-shell__submit {
  padding: var(--space-2) var(--space-4);
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  color: var(--bg-deep);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.composer-shell__submit:hover:not(:disabled) {
  background: color-mix(in oklab, var(--accent) 85%, white);
}

.composer-shell__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.composer-shell__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--accent);
  animation: progress-indeterminate 1.5s ease-in-out infinite;
}

@keyframes progress-indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
</style>

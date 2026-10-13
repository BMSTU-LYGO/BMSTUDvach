<script setup lang="ts">
import { ref, watch } from 'vue'

import { IDENTITY_NAME_MAX, normalizeIdentityName } from '@/composables/useIdentity'

/**
 * Identity Capsule (TRIP-01) — the optional imageboard name «Имя#секрет».
 *
 * One compact field: what you type before `#` is shown on your posts,
 * what comes after stays on this device and only ever reaches the server
 * as a one-way tripcode. No tripcode is computed here — that is the
 * server's job, so the capsule can only honestly hint at it.
 */
const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

const draft = ref(props.modelValue ?? '')

// The owner normalizes (trim / cap); adopt its value only when it really
// differs, so trailing spaces do not fight the caret while typing.
watch(
  () => props.modelValue,
  (value) => {
    if (normalizeIdentityName(draft.value) !== value) draft.value = value ?? ''
  },
)

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  draft.value = value
  emit('update:modelValue', value)
}

function onChange(event: Event) {
  const value = (event.target as HTMLInputElement).value
  draft.value = value
  emit('change', normalizeIdentityName(value))
}

function reset() {
  draft.value = ''
  emit('update:modelValue', '')
  emit('change', '')
}
</script>

<template>
  <div class="identity-capsule" data-testid="identity-capsule">
    <span class="identity-capsule__kicker" aria-hidden="true">ИМЯ</span>
    <input
      class="identity-capsule__input"
      :value="draft"
      type="text"
      :maxlength="IDENTITY_NAME_MAX"
      autocomplete="off"
      spellcheck="false"
      placeholder="Имя#секрет — необязательно"
      aria-label="Имя и секрет для трипкода"
      aria-describedby="identity-capsule-hint"
      data-testid="identity-input"
      @input="onInput"
      @change="onChange"
    />
    <button
      type="button"
      class="identity-capsule__reset"
      aria-label="Сбросить имя и секрет"
      data-testid="identity-reset"
      @click="reset"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
    <p id="identity-capsule-hint" class="identity-capsule__hint">
      #секрет → стабильный трипкод
    </p>
  </div>
</template>

<style scoped>
.identity-capsule {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: color-mix(in oklab, var(--bg-raised) 60%, transparent);
}

.identity-capsule:focus-within {
  border-color: color-mix(in oklab, var(--accent) 45%, transparent);
}

.identity-capsule__kicker {
  font-family: var(--font-display);
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  color: var(--text-muted);
  flex-shrink: 0;
}

.identity-capsule__input {
  flex: 1;
  min-width: 120px;
  min-height: 44px;
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 0.8rem;
  padding: 0 var(--space-1);
}

.identity-capsule__input::placeholder {
  color: var(--text-muted);
  opacity: 0.75;
}

.identity-capsule__reset {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 160ms, background 160ms;
}

.identity-capsule__reset:hover {
  color: var(--danger);
  background: color-mix(in oklab, var(--danger) 10%, transparent);
}

.identity-capsule__hint {
  margin: 0;
  flex-basis: 100%;
  font-family: var(--font-display);
  font-size: 0.62rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .identity-capsule__reset {
    transition: none;
  }
}
</style>

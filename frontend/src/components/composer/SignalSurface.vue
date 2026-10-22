<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

/**
 * Borderless transmission text canvas (SIGNAL-05).
 * No label, no box, no border — the text surface IS the center of the dock.
 * Optional left micro-gutter: TX (transmission) or R:#123 (reply context).
 *
 * Optional `corner` slot (P3-T1b): the caller may pin chrome into the top
 * right corner of the canvas — the Signal Dock puts its preview node there.
 * The slot reserves its own width, so no line of text is ever covered.
 *
 * Optional `label` (report probe): the dock and the bay call their text a
 * transmission, the probe calls it a comment — a screen reader must hear
 * the word the reader is looking at.
 */
const props = defineProps<{
  modelValue: string
  placeholder: string
  gutter: string
  maxLength: number
  describedBy?: string
  invalid?: boolean
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  keydown: [event: KeyboardEvent]
  focus: []
  blur: []
  paste: [event: ClipboardEvent]
}>()

const el = ref<HTMLTextAreaElement | null>(null)

function autoGrow() {
  const node = el.value
  if (!node) return
  node.style.height = 'auto'
  const max = Math.round(window.innerHeight * 0.34)
  node.style.height = `${Math.min(node.scrollHeight, max)}px`
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
  autoGrow()
}

watch(
  () => props.modelValue,
  () => {
    if (props.modelValue === '') {
      // collapsed back to one line
      const node = el.value
      if (node) node.style.height = ''
    } else {
      void nextTick(autoGrow)
    }
  },
)

onMounted(() => {
  if (props.modelValue) autoGrow()
})

defineExpose({
  focus: () => el.value?.focus(),
  blur: () => el.value?.blur(),
  el,
})
</script>

<template>
  <div
    class="signal-surface"
    :class="{
      'signal-surface--reply': gutter.startsWith('R:'),
      'signal-surface--corner': Boolean($slots.corner),
    }"
  >
    <span class="signal-surface__gutter" aria-hidden="true">{{ gutter }}</span>
    <textarea
      ref="el"
      class="signal-surface__input"
      rows="1"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxLength"
      :aria-describedby="describedBy"
      :aria-invalid="invalid || undefined"
      :aria-label="label || 'Текст сообщения'"
      data-testid="signal-input"
      @input="onInput"
      @keydown="emit('keydown', $event)"
      @focus="emit('focus')"
      @blur="emit('blur')"
      @paste="emit('paste', $event)"
    ></textarea>
    <div v-if="$slots.corner" class="signal-surface__corner">
      <slot name="corner" />
    </div>
  </div>
</template>

<style scoped>
.signal-surface {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  flex: 1;
  min-width: 0;
}

.signal-surface__gutter {
  font-family: var(--font-body);
  font-size: 0.6875rem;
  color: var(--ink-tertiary);
  padding-top: 0.35rem;
  user-select: none;
  flex-shrink: 0;
  /* Боковая подпись меняет тон тихо: роль наведения (150ms). */
  transition: color var(--motion-hover);
}

.signal-surface--reply .signal-surface__gutter {
  color: var(--accent);
}

.signal-surface__input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  resize: none;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 0.95rem;
  line-height: 1.6;
  padding: 0.3rem 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.signal-surface__input::placeholder {
  color: var(--ink-tertiary);
  opacity: 0.7;
}

.signal-surface__input::-webkit-scrollbar {
  width: 3px;
}

/* corner chrome (P3-T1b): pinned into the top right of the canvas, with the
   matching right inset reserved so no line of text hides behind it. */
.signal-surface--corner .signal-surface__input {
  padding-right: 2rem;
}

.signal-surface__corner {
  position: absolute;
  top: 0;
  right: 0;
}

/* Q-M-09: на телефоне поле набора — тоже цель: палец должен попадать
   в строку, а не в её верхнюю кромку. */
@media (max-width: 767px) {
  .signal-surface__input {
    min-height: 44px;
  }
}

/* Q-M-13: на узком экране подпись канала («TX», «R:#12») съедала
   строку набора — плейсхолдер обрезался. На 320–400 px подпись уходит:
   контекст ответа и так виден в стеке дока. */
@media (max-width: 400px) {
  .signal-surface__gutter {
    display: none;
  }
}
</style>

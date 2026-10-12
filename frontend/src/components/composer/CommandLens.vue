<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export interface LensCommand {
  id: string
  label: string
  hint: string
  shortcut: string
  run: () => void
}

/**
 * Command Lens (SIGNAL-09). Borrows the /-command UX principle from
 * Notion/Raycast — not the visuals. Real actions only.
 */
const props = defineProps<{
  open: boolean
  filter: string
  commands: LensCommand[]
}>()

const emit = defineEmits<{ close: [] }>()

const active = ref(0)

const filtered = computed(() => {
  const q = props.filter.trim().toLowerCase()
  if (!q) return props.commands
  return props.commands.filter(
    (c) => c.label.toLowerCase().includes(q) || c.id.includes(q),
  )
})

watch(
  () => [props.open, props.filter] as const,
  () => {
    active.value = 0
  },
)

function run(cmd: LensCommand) {
  cmd.run()
  emit('close')
}

function move(delta: number) {
  if (!filtered.value.length) return
  active.value = (active.value + delta + filtered.value.length) % filtered.value.length
}

function commit() {
  const c = filtered.value[active.value]
  if (c) run(c)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    commit()
  }
}

defineExpose({ onKeydown, commit })
</script>

<template>
  <Transition name="lens">
    <div
      v-if="open"
      class="lens"
      role="listbox"
      aria-label="Команды"
      data-testid="command-lens"
      @keydown="onKeydown"
    >
      <div v-if="filtered.length === 0" class="lens__empty">нет совпадений</div>
      <button
        v-for="(cmd, i) in filtered"
        :key="cmd.id"
        type="button"
        class="lens__item"
        :class="{ 'lens__item--active': i === active }"
        role="option"
        :aria-selected="i === active"
        @click="run(cmd)"
        @mouseenter="active = i"
      >
        <span class="lens__name">{{ cmd.label }}</span>
        <span class="lens__hint">{{ cmd.hint }}</span>
        <span class="lens__shortcut">
          <kbd>{{ cmd.shortcut }}</kbd>
        </span>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.lens {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--bg-raised);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 30;
  max-height: 260px;
  overflow-y: auto;
}

.lens__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.lens__item--active {
  background: var(--accent-glow);
}

.lens__name {
  font-size: 0.84rem;
  font-weight: 500;
}

.lens__hint {
  font-size: 0.72rem;
  color: var(--text-muted);
  flex: 1;
}

.lens__shortcut kbd {
  font-family: var(--font-display);
  font-size: 0.66rem;
  color: var(--text-muted);
  border: 1px solid var(--border-medium);
  border-radius: 4px;
  padding: 1px 5px;
}

.lens__empty {
  padding: 10px;
  font-size: 0.78rem;
  color: var(--text-muted);
  text-align: center;
}

.lens-enter-active,
.lens-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}
.lens-enter-from,
.lens-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
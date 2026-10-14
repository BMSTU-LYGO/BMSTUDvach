<script setup lang="ts">
import { ref } from 'vue'
import { useTilt } from '@/composables/useTilt'
import { captureMorph } from '@/composables/usePageMorph'
import { useSound } from '@/composables/useSound'
import { emitSceneEvent, highlightBoard } from '@/three/sceneState'
import GenerativeIcon from '@/components/ui/GenerativeIcon.vue'
import type { Board } from '@/types'

const props = defineProps<{ board: Board; index: number }>()

const cardRef = ref<HTMLElement | null>(null)
const { isHovered } = useTilt(cardRef, { maxTilt: 6, scale: 1.01 })
const { sounds } = useSound()

function setHighlight(on: boolean) {
  highlightBoard(on ? props.board.slug : null)
  if (on) sounds.hover()
}

function handleNavigate() {
  highlightBoard(props.board.slug)
  emitSceneEvent({ type: 'pulse', target: props.board.slug })
  captureMorph(cardRef.value, `board:${props.board.slug}`)
  sounds.click()
}
</script>

<template>
  <RouterLink
    :to="`/boards/${board.slug}`"
    class="board-card-3d"
    :class="{ hovered: isHovered }"
    :style="{ '--delay': index * 0.08 + 's' }"
    @pointerenter="setHighlight(true)"
    @pointerleave="setHighlight(false)"
    @focusin="setHighlight(true)"
    @focusout="setHighlight(false)"
    @click="handleNavigate"
  >
    <div ref="cardRef" class="card-inner">
      <div class="card-content">
        <div class="card-icon">
          <GenerativeIcon :seed="board.slug" :size="44" />
        </div>
        <div class="card-text">
          <span class="card-name">{{ board.name }}</span>
          <span class="card-slug">/{{ board.slug }}/</span>
          <span v-if="board.description" class="card-desc">
            {{ board.description }}
          </span>
          <span v-if="board.thread_count > 0" class="card-signal">
            {{ board.thread_count }}
            {{ board.thread_count === 1 ? 'тред' : board.thread_count < 5 ? 'треда' : 'тредов' }}
          </span>
        </div>
        <div class="card-arrow" aria-hidden="true">→</div>
      </div>
    </div>
  </RouterLink>
</template>

<style scoped>
.board-card-3d {
  display: block;
  text-decoration: none;
  color: inherit;
  outline: none;
}

.card-inner {
  position: relative;
  background: var(--paper-raised, #EAE4D4);
  border: 1px solid var(--rule, #D4CEB8);
  border-radius: 0;
  overflow: hidden;
  will-change: transform;
  transition:
    background 150ms cubic-bezier(0.33, 1, 0.68, 1),
    border-color 150ms cubic-bezier(0.33, 1, 0.68, 1);
}

.board-card-3d.hovered .card-inner {
  background: var(--paper-sunken, #F7F3E8);
  border-color: var(--ink-tertiary, #8A8273);
}

.card-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-4, 1rem);
  padding: var(--space-5, 1.25rem);
  z-index: 1;
}

.card-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rule, #D4CEB8);
  border-radius: 0;
  flex-shrink: 0;
}

.card-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.card-slug {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ink-tertiary, #8A8273);
}

.card-name {
  font-family: 'Cormorant Garamond', 'Georgia', serif;
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--ink, #1C1A14);
}

.card-desc {
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 0.875rem;
  color: var(--ink-secondary, #5B5547);
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-signal {
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 0.875rem;
  color: var(--ink-tertiary, #8A8273);
}

.card-arrow {
  font-family: 'Cormorant Garamond', 'Georgia', serif;
  font-size: 1.5rem;
  color: var(--ink-tertiary, #8A8273);
  flex-shrink: 0;
  transition: translate 150ms cubic-bezier(0.33, 1, 0.68, 1);
}

.board-card-3d.hovered .card-arrow {
  translate: 4px 0;
  color: var(--ink, #1C1A14);
}

.board-card-3d:focus-visible {
  outline: 2px solid var(--accent, #2F4F4E);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .card-icon {
    width: 36px;
    height: 36px;
  }

  .card-name {
    font-size: 1.25rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .card-inner {
    transform: none !important;
    will-change: auto;
  }
}
</style>

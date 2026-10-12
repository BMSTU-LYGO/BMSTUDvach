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
const { isHovered } = useTilt(cardRef, { maxTilt: 10, scale: 1.04 })
const { sounds } = useSound()

// DOM card ↔ WebGL node link: hovering the card highlights its node in
// the persistent network scene; navigating fires a signal pulse at it.
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
      <div class="card-glow"></div>
      <div class="card-content">
        <div class="card-icon">
          <GenerativeIcon :seed="board.slug" :size="52" />
        </div>
        <div class="card-text">
          <span class="card-slug">/{{ board.slug }}/</span>
          <span class="card-name">{{ board.name }}</span>
          <span v-if="board.description" class="card-desc">
            {{ board.description }}
          </span>
          <span v-if="board.thread_count > 0" class="card-signal">
            <span class="card-signal__dot" aria-hidden="true"></span>
            {{ board.thread_count }}
            {{ board.thread_count === 1 ? 'тред' : board.thread_count < 5 ? 'треда' : 'тредов' }}
          </span>
        </div>
        <div class="card-arrow">→</div>
      </div>
    </div>
  </RouterLink>
</template>

<style scoped>
.board-card-3d {
  display: block;
  text-decoration: none;
  color: inherit;
  perspective: 800px;
  outline: none;
}

.card-inner {
  position: relative;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transform-style: preserve-3d;
  will-change: transform;
  transition:
    border-color 0.4s var(--ease-out-expo),
    box-shadow 0.4s var(--ease-out-expo);
}

.board-card-3d.hovered .card-inner {
  border-color: var(--border-accent);
  box-shadow:
    0 8px 32px oklch(0 0 0 / 0.4),
    0 0 0 1px var(--accent-glow);
}

.card-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    var(--accent-glow),
    transparent 40%
  );
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
  z-index: 0;
}

.board-card-3d.hovered .card-glow {
  opacity: 1;
}

.card-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-5);
  z-index: 1;
}

.card-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent);
  background: oklch(0.72 0.16 65 / 0.1);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-md);
  flex-shrink: 0;
  transition: transform 0.4s var(--ease-out-expo);
}

.board-card-3d.hovered .card-icon {
  transform: translateZ(20px);
}

.card-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  flex: 1;
}

.card-slug {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--accent);
}

.card-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.card-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* live signal state: how many threads live in this node */
.card-signal {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  color: var(--accent-dim);
}

.card-signal__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
}

.card-arrow {
  font-size: 1.3rem;
  color: var(--text-muted);
  flex-shrink: 0;
  transition:
    transform 0.4s var(--ease-out-expo),
    color 0.3s;
}

.board-card-3d.hovered .card-arrow {
  transform: translateX(6px);
  color: var(--accent);
}

@media (max-width: 640px) {
  .board-card-3d.hovered .card-inner {
    box-shadow: var(--shadow-md);
  }

  .card-icon {
    width: 44px;
    height: 44px;
    font-size: 1.2rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .card-inner {
    transform: none !important;
    will-change: auto;
  }

  .card-glow {
    display: none;
  }

  .board-card-3d.hovered .card-icon,
  .board-card-3d.hovered .card-arrow {
    transform: none;
  }
}
</style>

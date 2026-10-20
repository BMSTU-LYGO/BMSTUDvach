<script setup lang="ts">
import { ref } from 'vue'
import { useTilt } from '@/composables/useTilt'
import { usePress } from '@/composables/useMotion'
import { captureMorph } from '@/composables/usePageMorph'
import { useSound } from '@/composables/useSound'
import { emitSceneEvent, highlightBoard } from '@/three/sceneState'
import GenerativeIcon from '@/components/ui/GenerativeIcon.vue'
import type { Board } from '@/types'

const props = defineProps<{ board: Board; index: number }>()

const cardRef = ref<HTMLElement | null>(null)
// Наклон без масштаба: карточка отзывается на курсор, но не растёт —
// увеличенный элемент выглядел бы плиткой в приложении, а не листом бумаги.
const { isHovered } = useTilt(cardRef, { maxTilt: 6, scale: 1 })
// Нажатие ловится на обёртке: события от ссылки (и мыши, и клавиатуры)
// доходят до неё вверх по дереву, поэтому реакция одинакова для обоих.
usePress(cardRef)
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
    :data-board-slug="board.slug"
    :class="{ hovered: isHovered }"
    :style="{ '--delay': index * 0.08 + 's' }"
    @pointerenter="setHighlight(true)"
    @pointerleave="setHighlight(false)"
    @focusin="setHighlight(true)"
    @focusout="setHighlight(false)"
    @click="handleNavigate"
  >
    <div ref="cardRef" class="card-tilt">
      <div class="card-inner surface-paper react-lift react-press">
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
              {{
                board.thread_count === 1
                  ? 'тред'
                  : board.thread_count < 5
                    ? 'треда'
                    : 'тредов'
              }}
            </span>
          </div>
          <div class="card-arrow" aria-hidden="true">→</div>
        </div>
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

/* Слой наклона: прозрачная обёртка, на которую смотрит useTilt.
   useTilt переписывает `transition` на своём элементе инлайном, поэтому лист
   лежит вложенным слоем: иначе материальные переходы листа погибли бы
   вместе с переходом наклона. */
.card-tilt {
  display: grid;
  height: 100%;
  will-change: transform;
}

/* Лист: бумага с волосяной кромкой и мягкой тенью покоя — их даёт
   `surface-paper`, а подъём на hover — `react-lift`. Локально задано только
   то, чем лист отличается от страницы: он чуть темнее фона. */
.card-inner {
  position: relative;
  background-color: var(--paper-raised, #eae4d4);
  overflow: hidden;
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
  border: 1px solid var(--rule, #d4ceb8);
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
  color: var(--ink-tertiary, #8a8273);
}

.card-name {
  font-family: 'Cormorant Garamond', 'Georgia', serif;
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--ink, #1c1a14);
}

.card-desc {
  font-family:
    'Inter',
    -apple-system,
    sans-serif;
  font-size: 0.875rem;
  color: var(--ink-secondary, #5b5547);
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-signal {
  font-family:
    'Inter',
    -apple-system,
    sans-serif;
  font-size: 0.875rem;
  color: var(--ink-tertiary, #8a8273);
}

.card-arrow {
  font-family: 'Cormorant Garamond', 'Georgia', serif;
  font-size: 1.5rem;
  color: var(--ink-tertiary, #8a8273);
  flex-shrink: 0;
  transition:
    translate var(--motion-hover),
    color var(--motion-hover);
}

/* Стрелка намекает направление, но не прыгает: смещение в пределах двух
   пикселей — ровно столько, сколько допускает «редакционный» закон. */
.board-card-3d.hovered .card-arrow {
  translate: 2px 0;
  color: var(--ink, #1c1a14);
}

/* Фокус живёт на ссылке, а подъём — на листе: связываем состояния явно. */
.board-card-3d:focus-visible .card-inner {
  border-color: var(--material-edge-lit);
  box-shadow: var(--material-shadow-2);
}

/* Нажатие — «чернила впитались»: тень уходит внутрь, кромка темнеет,
   лист садится на палец на миллиметр. */
.card-tilt[data-pressed='true'] .card-inner {
  box-shadow: var(--material-shadow-press);
  border-color: var(--material-edge-pressed);
  transform: translateY(var(--material-press-delta));
}

.board-card-3d:focus-visible {
  outline: 2px solid var(--accent, #2f4f4e);
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
  .card-tilt {
    transform: none !important;
    will-change: auto;
  }
}
</style>

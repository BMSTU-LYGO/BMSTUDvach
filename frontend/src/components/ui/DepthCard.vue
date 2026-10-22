<script setup lang="ts">
import { ref } from 'vue'
import { useTilt } from '@/composables/useTilt'
import { usePress } from '@/composables/useMotion'

withDefaults(defineProps<{ depth?: 1 | 2 | 3 }>(), { depth: 1 })

const tiltRef = ref<HTMLElement | null>(null)
// Наклон без масштаба: карточка наклоняется к курсору, но не растёт —
// масштаб конкурировал бы с наклоном и превращал карточку в плитку.
useTilt(tiltRef, { scale: 1 })
// Нажатие — «чернила впитались»: тень уходит внутрь, кромка темнеет.
usePress(tiltRef)
</script>

<template>
  <div ref="tiltRef" class="depth-tilt">
    <div class="depth-card react-lift react-press" :class="`depth-${depth}`">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* Слой наклона: прозрачная обёртка, на которую смотрит useTilt.
   useTilt переписывает `transition` на своём элементе инлайном, поэтому лист
   лежит вложенным слоем: иначе материальные переходы листа погибли бы
   вместе с переходом наклона. */
.depth-tilt {
  display: grid;
  height: 100%;
  will-change: auto;
}

/* Слой композитора живёт только пока лист отзывается на курсор. */
.depth-tilt:hover,
.depth-tilt:focus-within {
  will-change: transform;
}

.depth-card {
  background: var(--paper-raised);
  border: 1px solid var(--material-edge);
  border-radius: 0;
  transform-style: preserve-3d;
  box-shadow: var(--card-shadow);
}

/* Глубина — расстояние листа от стола: чем глубже слой, тем длиннее тень.
   Подъём — это шаг глубже той же шкалы, а не смена высоты. */
.depth-1 {
  --card-shadow: var(--shadow-sm);
  --card-lifted: var(--shadow-md);
}

.depth-2 {
  --card-shadow: var(--shadow-md);
  --card-lifted: var(--shadow-lg);
}

.depth-3 {
  --card-shadow: var(--shadow-lg);
  /* Тень — тёплая и тихая: чёрная заливка на 60% превращала лист в
     вырез из тёмного фона, а бумага на столе такой тени не даёт. */
  --card-lifted: 0 12px 48px rgba(28, 26, 20, 0.14);
}

/* Подъём листа: кромка ловит свет, тень становится на шаг глубже.
   Правило объявлено здесь, а не берётся из material.css, потому что глубина
   задаёт собственную шкалу теней — их нужно переопределить целиком. */
.depth-card.react-lift:hover,
.depth-card.react-lift:focus-visible {
  border-color: var(--material-edge-lit);
  box-shadow: var(--card-lifted);
}

/* Нажатие — «чернила впитались»: тень уходит внутрь, кромка темнеет,
   лист садится на палец на миллиметр. */
.depth-tilt[data-pressed='true'] .depth-card {
  box-shadow: var(--material-shadow-press);
  border-color: var(--material-edge-pressed);
  transform: translateY(var(--material-press-delta));
}

@media (prefers-reduced-motion: reduce) {
  .depth-tilt {
    transform: none !important;
    will-change: auto;
  }
}
</style>

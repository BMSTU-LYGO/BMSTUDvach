<script setup lang="ts">
import { onMounted, ref } from 'vue'

import GlitchText from '@/components/ui/GlitchText.vue'
import BoardCard3D from '@/components/ui/BoardCard3D.vue'
import ScanlineOverlay from '@/components/ui/ScanlineOverlay.vue'
import GridPattern from '@/components/ui/GridPattern.vue'
import GearHero from '@/components/three/GearHero.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useForumStore } from '@/stores/forum'
import { useScrollReveal } from '@/composables/useScrollReveal'
import { useParallax } from '@/composables/useParallax'
import { gsap, prefersReducedMotion } from '@/composables/useGsap'

const store = useForumStore()
const sectionRef = ref<HTMLElement | null>(null)
const heroRef = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)
const gridLinesRef = ref<HTMLElement | null>(null)

const { mousePercentX, mousePercentY } = useParallax()

useScrollReveal(sectionRef, '.board-card-3d')

onMounted(() => {
  void store.fetchBoards()

  if (prefersReducedMotion() || !heroRef.value || !gridRef.value) return

  // Hero parallax on scroll
  gsap.to(heroRef.value, {
    scrollTrigger: {
      trigger: heroRef.value,
      start: 'top top',
      end: 'bottom top',
      scrub: 1,
    },
    y: -80,
    opacity: 0.3,
    scale: 0.95,
  })

  // Grid perspective shift on scroll
  gsap.to(gridRef.value, {
    scrollTrigger: {
      trigger: gridRef.value,
      start: 'top bottom',
      end: 'top center',
      scrub: 1,
    },
    rotateX: 0,
    translateZ: 0,
    duration: 1,
  })
})
</script>

<template>
  <section class="home">
    <ScanlineOverlay :intensity="0.03" />

    <!-- Hero Section -->
    <div ref="heroRef" class="hero">
      <GearHero />
      <div class="hero-content">
        <h1 class="hero-title">
          <GlitchText text="BMSTUDvach" tag="span" />
        </h1>
        <p class="hero-subtitle">
          Форум МГТУ им. Н. Э. Баумана
        </p>
        <div class="hero-tagline">
          <span class="tagline-bracket">[</span>
          <span class="tagline-text">разделы · треды · анонимность</span>
          <span class="tagline-bracket">]</span>
        </div>
      </div>

      <!-- Engineering grid backdrop -->
      <GridPattern :cell-size="48" :opacity="0.06" />

      <!-- Decorative grid lines (mouse parallax layer) -->
      <div
        ref="gridLinesRef"
        class="hero-grid-lines"
        aria-hidden="true"
        :style="{
          transform: `translate(${(mousePercentX - 0.5) * 24}px, ${(mousePercentY - 0.5) * 16}px)`,
        }"
      >
        <div class="grid-line h1"></div>
        <div class="grid-line h2"></div>
        <div class="grid-line v1"></div>
        <div class="grid-line v2"></div>
      </div>
    </div>

    <!-- Section label -->
    <div class="section-label">
      <span class="label-line"></span>
      <span class="label-text">Разделы</span>
      <span class="label-line"></span>
    </div>

    <!-- Board cards in3D perspective grid -->
    <LoadingState v-if="store.boards.loading" />
    <ErrorState
      v-else-if="store.boards.error"
      :message="store.boards.error"
      :on-retry="store.fetchBoards"
    />
    <EmptyState
      v-else-if="store.boards.boards.length === 0"
      message="Разделов пока нет."
    />
    <div v-else ref="sectionRef" class="boards-perspective">
      <div ref="gridRef" class="boards-grid">
        <BoardCard3D
          v-for="(board, index) in store.boards.boards"
          :key="board.slug"
          :board="board"
          :index="index"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

/* === Hero Section === */
.hero {
  position: relative;
  text-align: center;
  padding: var(--space-16) 0 var(--space-8);
  overflow: hidden;
}

.hero-content {
  position: relative;
  z-index: 2;
}

.hero-title {
  font-size: clamp(3rem, 8vw, 5.5rem);
  letter-spacing: -0.04em;
  margin-bottom: var(--space-4);
  line-height: 1;
}

.hero-subtitle {
  font-size: clamp(1rem, 2vw, 1.3rem);
  color: var(--text-secondary);
  max-width: 50ch;
  margin: 0 auto var(--space-4);
  line-height: 1.6;
}

.hero-tagline {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-size: 0.85rem;
  color: var(--text-muted);
}

.tagline-bracket {
  color: var(--accent);
  font-weight: 700;
}

.tagline-text {
  letter-spacing: 0.05em;
}

/* Decorative grid lines */
.hero-grid-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  transition: transform 0.6s var(--ease-out-quart);
  will-change: transform;
}

.grid-line {
  position: absolute;
  background: var(--border-subtle);
  opacity: 0.3;
}

.grid-line.h1,
.grid-line.h2 {
  height: 1px;
  left: 0;
  right: 0;
}

.grid-line.v1,
.grid-line.v2 {
  width: 1px;
  top: 0;
  bottom: 0;
}

.grid-line.h1 { top: 30%; }
.grid-line.h2 { top: 70%; }
.grid-line.v1 { left: 25%; }
.grid-line.v2 { right: 25%; }

/* === Section Label === */
.section-label {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.label-line {
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}

.label-text {
  font-family: var(--font-display);
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

/* === Boards Perspective Grid === */
.boards-perspective {
  perspective: 1200px;
  perspective-origin: center 40%;
}

.boards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
  transform: rotateX(2deg) translateZ(-20px);
  transform-style: preserve-3d;
  transition: transform 0.6s var(--ease-out-expo);
}

@media (max-width: 640px) {
  .boards-grid {
    grid-template-columns: 1fr;
    transform: none;
  }

  .hero-title {
    font-size: 2.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .boards-grid {
    transform: none;
  }
}
</style>

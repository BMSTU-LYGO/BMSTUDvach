<script setup lang="ts">
import { onMounted, ref } from 'vue'

import GlitchText from '@/components/ui/GlitchText.vue'
import GlowBorder from '@/components/ui/GlowBorder.vue'
import DepthCard from '@/components/ui/DepthCard.vue'
import ScanlineOverlay from '@/components/ui/ScanlineOverlay.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useForumStore } from '@/stores/forum'
import { useScrollReveal } from '@/composables/useScrollReveal'
import { gsap, prefersReducedMotion } from '@/composables/useGsap'

const store = useForumStore()
const sectionRef = ref<HTMLElement | null>(null)
const heroRef = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)

useScrollReveal(sectionRef, '.board-card')

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

      <!-- Decorative grid lines -->
      <div class="hero-grid-lines" aria-hidden="true">
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
        <RouterLink
          v-for="(board, index) in store.boards.boards"
          :key="board.slug"
          :to="`/boards/${board.slug}`"
          class="board-card"
          :style="{ '--card-index': index }"
        >
          <GlowBorder>
            <DepthCard :depth="1">
              <div class="board-card-inner">
                <div class="board-icon">
                  {{ board.slug.charAt(0).toUpperCase() }}
                </div>
                <div class="board-info">
                  <span class="board-slug">/{{ board.slug }}/</span>
                  <span class="board-name">{{ board.name }}</span>
                  <span v-if="board.description" class="board-desc">
                    {{ board.description }}
                  </span>
                </div>
                <div class="board-arrow">→</div>
              </div>
            </DepthCard>
          </GlowBorder>
        </RouterLink>
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

.board-card {
  text-decoration: none;
  color: inherit;
  display: block;
  outline: none;
  transform-style: preserve-3d;
  transition: transform 0.4s var(--ease-out-expo);
}

.board-card:hover {
  transform: translateZ(20px) scale(1.02);
}

.board-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: var(--radius-lg);
}

.board-card-inner {
  padding: var(--space-5);
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.board-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-glow);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.board-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  flex: 1;
}

.board-slug {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.02em;
}

.board-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.board-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-arrow {
  font-size: 1.2rem;
  color: var(--text-muted);
  transition:
    transform 0.3s var(--ease-out-expo),
    color 0.3s;
  flex-shrink: 0;
}

.board-card:hover .board-arrow {
  transform: translateX(4px);
  color: var(--accent);
}

@media (max-width: 640px) {
  .boards-grid {
    grid-template-columns: 1fr;
    transform: none;
  }

  .hero-title {
    font-size: 2.5rem;
  }

  .board-card:hover {
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .boards-grid {
    transform: none;
  }

  .board-card:hover {
    transform: none;
  }

  .board-card:hover .board-arrow {
    transform: none;
  }
}
</style>

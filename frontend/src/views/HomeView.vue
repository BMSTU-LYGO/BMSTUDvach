<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import GlitchText from '@/components/ui/GlitchText.vue'
import BoardCard3D from '@/components/ui/BoardCard3D.vue'
import TelemetryRail from '@/components/home/TelemetryRail.vue'
import MentionsBeacon from '@/components/home/MentionsBeacon.vue'
import ThreadRow from '@/components/thread/ThreadRow.vue'
import WatchPanel from '@/components/watch/WatchPanel.vue'
import DraftsPanel from '@/components/composer/DraftsPanel.vue'
import GridPattern from '@/components/ui/GridPattern.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useForumStore } from '@/stores/forum'
import { useScrollReveal } from '@/composables/useScrollReveal'
import { useParallax } from '@/composables/useParallax'
import { captureMorph } from '@/composables/usePageMorph'
import { useSound } from '@/composables/useSound'
import { gsap, prefersReducedMotion } from '@/composables/useGsap'

const store = useForumStore()
const { sounds } = useSound()
const sectionRef = ref<HTMLElement | null>(null)
const recentRef = ref<HTMLElement | null>(null)
const heroRef = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)
const gridLinesRef = ref<HTMLElement | null>(null)

const { mousePercentX, mousePercentY } = useParallax()

useScrollReveal(sectionRef, '.board-card-3d')
useScrollReveal(recentRef, '.thread-row')

// Mono readouts for the section labels — zero-padded like the telemetry rail.
const nodeCount = computed(() => String(store.boards.boards.length).padStart(2, '0'))
const signalCount = computed(() => String(store.recent.threads.length).padStart(2, '0'))

onMounted(() => {
  void store.fetchBoards()
  void store.fetchRecentThreads(6)

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

// The hero must say where to go next — the boards ARE the network.
function enterNetwork() {
  sectionRef.value?.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  })
}

// Recent rows keep the same shared-element morph as board rows.
function openRecent(event: MouseEvent, threadId: number) {
  captureMorph(event.currentTarget as HTMLElement, `thread:${threadId}`)
  sounds.click()
}
</script>

<template>
  <section class="home">
    <!-- Hero: copy over the persistent network core (one WebGL scene) -->
    <div ref="heroRef" class="hero">
      <div class="hero-content">
        <p class="hero-kicker">
          <span class="hero-kicker__dot" aria-hidden="true"></span>
          <span class="hero-kicker__text">BMSTUD Network</span>
          <span class="hero-kicker__sep" aria-hidden="true">//</span>
          <span class="hero-kicker__text">МГТУ им. Н. Э. Баумана</span>
        </p>
        <h1 class="hero-title">
          <GlitchText text="BMSTUDvach" tag="span" />
        </h1>
        <p class="hero-subtitle">
          Анонимный форум студентов — без регистрации и профилей
        </p>
        <p class="hero-explainer">
          <span class="hero-explainer__map">
            Доски — узлы сети, треды — каналы, ответы — сигналы.
          </span>
          <span class="hero-explainer__note">Никто не знает, кто ты.</span>
        </p>
        <div class="hero-actions">
          <button type="button" class="hero-cta" @click="enterNetwork">
            Войти в сеть
            <span class="hero-cta-arrow" aria-hidden="true">↓</span>
          </button>
          <RouterLink to="/about" class="hero-alt">/about/ — что это</RouterLink>
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

      <!-- Hairline: the hero ends on a circuit rule -->
      <div class="hero-rule" aria-hidden="true"></div>
    </div>

    <!-- Boards: the nodes of the network -->
    <section class="home-section" aria-labelledby="section-boards-title">
      <div class="section-label">
        <span class="label-index" aria-hidden="true">01</span>
        <h2 id="section-boards-title" class="label-text">Разделы</h2>
        <span class="label-line" aria-hidden="true"></span>
        <span class="label-meta" aria-hidden="true">УЗЛЫ · {{ nodeCount }}</span>
      </div>

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

    <!-- Network telemetry: one honest line of visible-only counts -->
    <TelemetryRail />

    <!-- Answers to my posts, found by tripcode alone -->
    <MentionsBeacon />

    <!-- Hairline: the live feed is its own stratum -->
    <div class="section-rule" aria-hidden="true"></div>

    <!-- Live network activity: recent transmissions across boards -->
    <section class="home-section" aria-labelledby="section-recent-title">
      <div class="section-label">
        <span class="label-index" aria-hidden="true">02</span>
        <h2 id="section-recent-title" class="label-text">Последние передачи</h2>
        <span class="label-line" aria-hidden="true"></span>
        <span class="label-meta" aria-hidden="true">СИГНАЛЫ · {{ signalCount }}</span>
      </div>

      <div ref="recentRef" class="recent">
        <LoadingState v-if="store.recent.loading" />
        <ErrorState
          v-else-if="store.recent.error"
          :message="store.recent.error"
          :on-retry="() => store.fetchRecentThreads(6)"
        />
        <EmptyState
          v-else-if="store.recent.threads.length === 0"
          message="В сети пока тихо."
        />
        <div v-else class="recent-list">
          <ThreadRow
            v-for="thread in store.recent.threads"
            :key="thread.id"
            :thread="thread"
            show-board
            @open="openRecent"
          />
        </div>
      </div>
    </section>

    <!-- Hairline: tracked nodes are a separate stratum -->
    <div class="section-rule" aria-hidden="true"></div>

    <!-- Unfinished signals: drafts saved in this device's buffer -->
    <DraftsPanel />

    <!-- Tracked nodes: your threads, with unread signal counts -->
    <WatchPanel />
  </section>
</template>

<style scoped>
.home {
  /* Page-scoped tokens: hairlines, mono micro-captions, shared motion.
     Everything below composes the global scale in main.css. */
  --hairline: linear-gradient(90deg, transparent, var(--border-medium), transparent);
  --scan-line: linear-gradient(90deg, var(--border-medium), transparent);
  --micro: 0.66rem;
  --micro-lead: clamp(0.68rem, 1.5vw, 0.76rem);
  --micro-tracking: 0.16em;
  --lift: -2px;
  --motion: translate var(--duration-fast) var(--ease-out-quart);
  /* The page's whole transform budget: never above 260ms. */
  --vector: transform 260ms var(--ease-out-quart);

  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

/* === Hero Section === */
.hero {
  position: relative;
  text-align: center;
  padding: var(--space-16) 0 var(--space-12);
  overflow: hidden;
}

/* Signal horizon: a whisper of amber over the network core */
.hero::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 70%;
  background: radial-gradient(
    ellipse 55% 100% at 50% 0%,
    color-mix(in oklab, var(--accent) 9%, transparent),
    transparent 72%
  );
  pointer-events: none;
  z-index: 0;
}

.hero-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Micro-caption: where you are on the network */
.hero-kicker {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-6);
  padding: var(--space-1) var(--space-3);
  border: 1px solid color-mix(in oklab, var(--accent) 30%, transparent);
  border-radius: 999px;
  background: color-mix(in oklab, var(--accent) 7%, transparent);
  font-family: var(--font-display);
  font-size: var(--micro);
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent-dim);
}

.hero-kicker__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow-strong);
  flex-shrink: 0;
}

.hero-kicker__sep {
  color: var(--text-muted);
}

.hero-title {
  margin: 0 0 var(--space-5);
  font-size: clamp(2.75rem, 11vw, 5.5rem);
  line-height: 0.95;
  letter-spacing: -0.045em;
  text-shadow: 0 0 48px color-mix(in oklab, var(--accent) 18%, transparent);
}

/* Body-weight proposition: the one line a visitor must read */
.hero-subtitle {
  margin: 0 auto var(--space-3);
  max-width: 46ch;
  font-size: clamp(1rem, 2.4vw, 1.2rem);
  font-weight: 500;
  line-height: 1.5;
  color: var(--text-secondary);
  text-wrap: balance;
}

/* Engineering readout under the proposition: metaphor, then reassurance */
.hero-explainer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0 auto var(--space-8);
  max-width: 56ch;
  font-family: var(--font-display);
  font-size: var(--micro);
  letter-spacing: 0.06em;
  line-height: 1.7;
  color: var(--text-muted);
}

.hero-explainer__map {
  font-size: var(--micro-lead);
}

.hero-explainer__note {
  color: var(--accent-dim);
}

.hero-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--space-4) var(--space-5);
}

/* CTA: a signal node, not a pill button */
.hero-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0 var(--space-5);
  background: none;
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    var(--motion),
    background var(--duration-fast) var(--ease-out-quart),
    box-shadow var(--duration-fast) var(--ease-out-quart);
}

.hero-cta:hover {
  background: color-mix(in oklab, var(--accent) 12%, transparent);
  box-shadow: 0 0 28px color-mix(in oklab, var(--accent) 26%, transparent);
  translate: 0 var(--lift);
}

.hero-cta:active {
  background: color-mix(in oklab, var(--accent) 18%, transparent);
  translate: 0 1px;
}

.hero-cta:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.hero-cta-arrow {
  transition: translate var(--duration-fast) var(--ease-out-quart);
}

.hero-cta:hover .hero-cta-arrow {
  translate: 0 3px;
}

.hero-alt {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--space-1);
  font-family: var(--font-display);
  font-size: 0.78rem;
  color: var(--text-muted);
  border-bottom: 1px dotted var(--border-medium);
  transition:
    color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart);
}

.hero-alt:hover {
  color: var(--accent);
  border-bottom-color: color-mix(in oklab, var(--accent) 45%, transparent);
}

/* Hairline closing the hero: a circuit rule with one lit node at its centre */
.hero-rule {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: min(100%, 1100px);
  height: 1px;
  transform: translateX(-50%);
  background: linear-gradient(
    90deg,
    transparent,
    var(--border-medium) 25%,
    color-mix(in oklab, var(--accent) 45%, transparent) 50%,
    var(--border-medium) 75%,
    transparent
  );
}

/* Decorative grid lines (mouse parallax layer) */
.hero-grid-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  transition: var(--vector);
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

.grid-line.h1 {
  top: 30%;
}
.grid-line.h2 {
  top: 70%;
}
.grid-line.v1 {
  left: 25%;
}
.grid-line.v2 {
  right: 25%;
}

/* === Section rhythm: one gap, one hairline === */
.home-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  scroll-margin-top: var(--space-8);
}

/* === Section Label: mono index + caption + hairline rule === */
.section-label {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.label-index {
  font-family: var(--font-display);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--accent);
}

.label-text {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--text-secondary);
  white-space: nowrap;
}

.label-line {
  flex: 1;
  height: 1px;
  background: var(--scan-line);
}

/* Right-hand mono readout: how many nodes/signals the stratum holds */
.label-meta {
  font-family: var(--font-display);
  font-size: var(--micro);
  letter-spacing: var(--micro-tracking);
  color: var(--text-muted);
  white-space: nowrap;
}

/* Hairline between network blocks */
.section-rule {
  height: 1px;
  background: var(--hairline);
}

/* === Boards Perspective Grid === */
.boards-perspective {
  perspective: 1200px;
  perspective-origin: center 40%;
}

.boards-grid {
  display: grid;
  /* min(280px, 100%) keeps one column on the narrowest phones */
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: var(--space-4);
  align-items: stretch;
  transform: rotateX(2deg) translateZ(-20px);
  transform-style: preserve-3d;
  transition: var(--vector);
}

/* Cards own their tilt/glow; the grid only adds the shared focus ring and a
   2px lift. `translate` (not transform) keeps both clear of the tilt
   transform the card sets inline. */
.boards-grid :deep(.board-card-3d) .card-inner {
  transition:
    border-color 0.4s var(--ease-out-expo),
    box-shadow 0.4s var(--ease-out-expo),
    var(--motion);
}

@media (hover: hover) {
  .boards-grid :deep(.board-card-3d:hover) .card-inner {
    border-color: var(--border-accent);
    translate: 0 var(--lift);
  }
}

/* The card drops its own outline; the grid restores a visible keyboard ring */
.boards-grid :deep(.board-card-3d:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: var(--radius-lg);
}

.boards-grid :deep(.board-card-3d:focus-visible) .card-inner {
  border-color: var(--accent);
  box-shadow:
    0 0 0 1px var(--accent-glow),
    0 0 24px color-mix(in oklab, var(--accent) 18%, transparent);
}

/* === Recent transmissions === */
.recent-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.recent-list .thread-row:last-child {
  border-bottom: none;
}

@media (max-width: 640px) {
  .hero {
    padding: var(--space-10) 0 var(--space-8);
  }

  .hero-kicker {
    font-size: 0.56rem;
    letter-spacing: 0.14em;
  }

  .hero-title {
    font-size: clamp(2.25rem, 13vw, 3.25rem);
    letter-spacing: -0.03em;
  }

  .hero-subtitle {
    max-width: 34ch;
  }

  .hero-actions {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3);
  }

  .hero-cta,
  .hero-alt {
    justify-content: center;
  }

  .boards-perspective {
    perspective: none;
  }

  .boards-grid {
    grid-template-columns: 1fr;
    gap: var(--space-3);
    transform: none;
  }

  .recent-list {
    border-radius: var(--radius-md);
  }
}

/* The mono readout never competes with the caption on narrow phones */
@media (max-width: 480px) {
  .label-meta {
    display: none;
  }
}

@media (max-width: 380px) {
  .hero-kicker {
    font-size: 0.5rem;
    letter-spacing: 0.1em;
  }

  .section-label {
    gap: var(--space-2);
  }

  .label-text {
    font-size: 0.72rem;
    letter-spacing: 0.12em;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-grid-lines {
    transition: none;
  }

  .boards-grid {
    transform: none;
  }

  /* No lift for pointer or keyboard focus: cards stay still. */
  .boards-grid :deep(.board-card-3d:hover) .card-inner,
  .boards-grid :deep(.board-card-3d:focus-visible) .card-inner {
    translate: none;
  }

  /* The keyboard ring stays — only the motion goes away. */
  .hero-cta,
  .hero-cta-arrow,
  .hero-alt {
    transition: none;
  }
}
</style>

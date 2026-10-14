<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import BoardCard3D from '@/components/ui/BoardCard3D.vue'
import GridPattern from '@/components/ui/GridPattern.vue'
import TelemetryRail from '@/components/home/TelemetryRail.vue'
import MentionsBeacon from '@/components/home/MentionsBeacon.vue'
import ThreadRow from '@/components/thread/ThreadRow.vue'
import WatchPanel from '@/components/watch/WatchPanel.vue'
import DraftsPanel from '@/components/composer/DraftsPanel.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useForumStore } from '@/stores/forum'
import { useScrollReveal } from '@/composables/useScrollReveal'
import { captureMorph } from '@/composables/usePageMorph'
import { useSound } from '@/composables/useSound'
import { gsap, prefersReducedMotion } from '@/composables/useGsap'

const store = useForumStore()
const { sounds } = useSound()
const sectionRef = ref<HTMLElement | null>(null)
const recentRef = ref<HTMLElement | null>(null)
const heroRef = ref<HTMLElement | null>(null)

useScrollReveal(sectionRef, '.board-card-3d')
useScrollReveal(recentRef, '.thread-row')

const nodeCount = computed(() => String(store.boards.boards.length).padStart(2, '0'))
const signalCount = computed(() => String(store.recent.threads.length).padStart(2, '0'))

onMounted(() => {
  void store.fetchBoards()
  void store.fetchRecentThreads(6)

  if (prefersReducedMotion() || !heroRef.value) return

  gsap.to(heroRef.value, {
    scrollTrigger: {
      trigger: heroRef.value,
      start: 'top top',
      end: 'bottom top',
      scrub: 1,
    },
    y: -40,
    opacity: 0.6,
  })
})

function enterNetwork() {
  sectionRef.value?.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  })
}

function openRecent(event: MouseEvent, threadId: number) {
  captureMorph(event.currentTarget as HTMLElement, `thread:${threadId}`)
  sounds.click()
}
</script>

<template>
  <section class="home">
    <div ref="heroRef" class="hero">
      <GridPattern :cell-size="60" :opacity="0.03" />
      <div class="hero-content">
        <p class="hero-kicker">
          BMSTUD Network <span class="hero-kicker__sep" aria-hidden="true">·</span> МГТУ им. Н. Э. Баумана
        </p>
        <h1 class="hero-title">BMSTUDvach</h1>
        <p class="hero-subtitle">
          Анонимный форум студентов — без регистрации и профилей
        </p>
        <p class="hero-explainer">
          Доски — узлы сети, треды — каналы, ответы — сигналы. Никто не знает, кто ты.
        </p>
        <div class="hero-actions">
          <button type="button" class="hero-cta" @click="enterNetwork">
            Войти в сеть
            <span class="hero-cta-arrow" aria-hidden="true">↓</span>
          </button>
          <RouterLink to="/about" class="hero-alt">/about/ — что это</RouterLink>
        </div>
      </div>
    </div>

    <section class="home-section" aria-labelledby="section-boards-title">
      <div class="section-label">
        <span class="label-index" aria-hidden="true">01</span>
        <h2 id="section-boards-title" class="label-text">Разделы</h2>
        <span class="label-meta" aria-hidden="true">{{ nodeCount }} узлов</span>
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
      <div v-else ref="sectionRef" class="boards-grid">
        <BoardCard3D
          v-for="(board, index) in store.boards.boards"
          :key="board.slug"
          :board="board"
          :index="index"
        />
      </div>
    </section>

    <TelemetryRail />

    <MentionsBeacon />

    <div class="section-rule" aria-hidden="true"></div>

    <section class="home-section" aria-labelledby="section-recent-title">
      <div class="section-label">
        <span class="label-index" aria-hidden="true">02</span>
        <h2 id="section-recent-title" class="label-text">Последние передачи</h2>
        <span class="label-meta" aria-hidden="true">{{ signalCount }} сигналов</span>
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

    <div class="section-rule" aria-hidden="true"></div>

    <DraftsPanel />

    <WatchPanel />
  </section>
</template>

<style scoped>
.home {
  --paper: #F2EDE0;
  --paper-raised: #EAE4D4;
  --paper-sunken: #F7F3E8;
  --ink: #1C1A14;
  --ink-secondary: #5B5547;
  --ink-tertiary: #8A8273;
  --rule: #D4CEB8;
  --accent: #2F4F4E;
  --accent-hover: #244140;
  --font-display: 'Cormorant Garamond', 'Georgia', serif;
  --font-body: 'Inter', -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --ease-out: cubic-bezier(0.33, 1, 0.68, 1);
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-20: 5rem;

  display: flex;
  flex-direction: column;
  gap: 0;
  background: var(--paper);
  color: var(--ink);
  padding: 0 var(--space-6);
}

.hero {
  position: relative;
  padding: var(--space-20) 0 var(--space-16);
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-8);
  align-items: center;
  border-bottom: 1px solid var(--rule);
}

.hero-content {
  display: flex;
  flex-direction: column;
}

.hero-kicker {
  margin: 0 0 var(--space-6);
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ink-secondary);
  letter-spacing: 0;
  text-transform: none;
}

.hero-kicker__sep {
  margin: 0 var(--space-2);
  color: var(--ink-tertiary);
}

.hero-title {
  margin: 0 0 var(--space-4);
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.hero-subtitle {
  margin: 0 0 var(--space-4);
  max-width: 46ch;
  font-family: var(--font-body);
  font-size: 1.125rem;
  font-weight: 400;
  line-height: 1.6;
  color: var(--ink-secondary);
}

.hero-explainer {
  margin: 0 0 var(--space-8);
  max-width: 56ch;
  font-family: var(--font-body);
  font-size: 1rem;
  line-height: 1.6;
  color: var(--ink-tertiary);
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  flex-wrap: wrap;
}

.hero-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0 var(--space-5);
  background: transparent;
  border: 1px solid var(--rule);
  border-radius: 0;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}

.hero-cta:hover {
  background: var(--paper-sunken);
  border-color: var(--ink-tertiary);
}

.hero-cta:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.hero-cta-arrow {
  transition: translate var(--duration-fast) var(--ease-out);
}

.hero-cta:hover .hero-cta-arrow {
  translate: 0 2px;
}

.hero-alt {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-family: var(--font-body);
  font-size: 0.875rem;
  color: var(--ink-tertiary);
  text-decoration: none;
  transition: color var(--duration-fast) var(--ease-out);
}

.hero-alt:hover {
  color: var(--ink);
}

.home-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-10) 0;
  border-bottom: 1px solid var(--rule);
  scroll-margin-top: var(--space-8);
}

.section-label {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.label-index {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ink-tertiary);
}

.label-text {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--ink);
}

.label-meta {
  margin-left: auto;
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 400;
  color: var(--ink-tertiary);
  white-space: nowrap;
}

.section-rule {
  height: 1px;
  background: var(--rule);
}

.boards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: var(--space-4);
}

.boards-grid :deep(.board-card-3d:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.recent-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--rule);
}

.recent-list .thread-row:last-child {
  border-bottom: none;
}

@media (max-width: 768px) {
  .home {
    padding: 0 var(--space-4);
  }

  .hero {
    grid-template-columns: 1fr;
    padding: var(--space-12) 0 var(--space-10);
  }

  .label-meta {
    display: none;
  }

  .boards-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-cta,
  .hero-cta-arrow,
  .hero-alt {
    transition: none;
  }
}
</style>

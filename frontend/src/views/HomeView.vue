<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import NetworkCore from '@/components/three/NetworkCore.vue'
import GridPattern from '@/components/ui/GridPattern.vue'
import BoardCard3D from '@/components/ui/BoardCard3D.vue'
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
const overlayRef = ref<HTMLElement | null>(null)

useScrollReveal(sectionRef, '.board-card-3d')
useScrollReveal(recentRef, '.thread-row')

const nodeCount = computed(() => String(store.boards.boards.length).padStart(2, '0'))
const signalCount = computed(() => String(store.recent.threads.length).padStart(2, '0'))

onMounted(() => {
  void store.fetchBoards()
  void store.fetchRecentThreads(6)

  if (prefersReducedMotion() || !overlayRef.value) return

  gsap.fromTo(
    overlayRef.value,
    { opacity: 0, y: 30 },
    { opacity: 1, y: 0, duration: 1.2, ease: 'power3.out', delay: 0.3 },
  )
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
    <NetworkCore />
    <GridPattern :cell-size="60" :opacity="0.03" />

    <div ref="overlayRef" class="overlay">
      <div class="overlay-content">
        <div class="overlay-header">
          <p class="overlay-kicker">BMSTUD Network · МГТУ им. Н. Э. Баумана</p>
          <div class="overlay-meta">
            <span class="meta-item">
              <span class="meta-label">Узлы</span>
              <span class="meta-value">{{ nodeCount }}</span>
            </span>
            <span class="meta-divider" aria-hidden="true"></span>
            <span class="meta-item">
              <span class="meta-label">Сигналы</span>
              <span class="meta-value">{{ signalCount }}</span>
            </span>
          </div>
        </div>

        <button type="button" class="overlay-cta" @click="enterNetwork">
          <span class="cta-text">Войти в сеть</span>
          <span class="cta-arrow" aria-hidden="true">↓</span>
        </button>
      </div>
    </div>

    <div class="content-layer">
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
    </div>
  </section>
</template>

<style scoped>
/* Палитра, типографика и motion-токены — глобальные (assets/main.css, assets/motion.css).
   Локальные копии здесь только разъезжались с общей системой при правке палитры. */
.home {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  color: var(--ink);
}

.overlay {
  position: relative;
  z-index: 10;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.overlay-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  align-items: center;
  pointer-events: auto;
}

.overlay-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  align-items: center;
  text-align: center;
}

.overlay-kicker {
  margin: 0;
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ink-secondary);
  letter-spacing: 0.02em;
  text-shadow: 0 2px 20px rgba(242, 237, 224, 0.8);
}

.overlay-meta {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--ink-tertiary);
  text-shadow: 0 2px 20px rgba(242, 237, 224, 0.8);
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: center;
}

.meta-label {
  font-size: 0.75rem;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-tertiary);
}

.meta-value {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--accent);
}

.meta-divider {
  width: 1px;
  height: 40px;
  background: var(--rule);
}

.overlay-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: 0 var(--space-8);
  background: rgba(242, 237, 224, 0.9);
  backdrop-filter: blur(12px);
  border: 2px solid var(--accent);
  border-radius: 0;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--duration-normal) var(--ease-out),
    border-color var(--duration-normal) var(--ease-out),
    transform var(--duration-normal) var(--ease-out);
  text-shadow: 0 1px 2px rgba(242, 237, 224, 0.5);
}

.overlay-cta:hover {
  background: rgba(242, 237, 224, 0.95);
  border-color: var(--accent-hover);
  transform: translateY(-2px);
}

.overlay-cta:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

.cta-arrow {
  transition: transform var(--duration-normal) var(--ease-out);
  font-size: 1.2rem;
}

.overlay-cta:hover .cta-arrow {
  transform: translateY(4px);
}

.content-layer {
  position: relative;
  z-index: 20;
  background: var(--paper);
  padding: 0 var(--space-6);
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
  .content-layer {
    padding: 0 var(--space-4);
  }

  .overlay-header {
    padding: 0 var(--space-4);
  }

  .label-meta {
    display: none;
  }

  .boards-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .overlay-cta,
  .cta-arrow {
    transition: none;
  }
}
</style>

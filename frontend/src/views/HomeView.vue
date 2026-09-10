<script setup lang="ts">
import { onMounted, ref } from 'vue'

import TypewriterText from '@/components/ui/TypewriterText.vue'
import GlowBorder from '@/components/ui/GlowBorder.vue'
import DepthCard from '@/components/ui/DepthCard.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useForumStore } from '@/stores/forum'
import { useScrollReveal } from '@/composables/useScrollReveal'

const store = useForumStore()
const sectionRef = ref<HTMLElement | null>(null)

useScrollReveal(sectionRef, '.board-card')

onMounted(() => {
  void store.fetchBoards()
})
</script>

<template>
  <section class="home">
    <div class="hero">
      <h1 class="hero-title">
        <TypewriterText text="BMSTUDvach" :speed="80" />
      </h1>
      <p class="hero-subtitle">
        Форум МГТУ им. Н. Э. Баумана. Разделы, треды, анонимные обсуждения.
      </p>
    </div>

    <div class="section-label">
      <span class="label-line"></span>
      <span class="label-text">Разделы</span>
      <span class="label-line"></span>
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
      <RouterLink
        v-for="board in store.boards.boards"
        :key="board.slug"
        :to="`/boards/${board.slug}`"
        class="board-card"
      >
        <GlowBorder>
          <DepthCard :depth="1">
            <div class="board-card-inner">
              <span class="board-slug">/{{ board.slug }}/</span>
              <span class="board-name">{{ board.name }}</span>
              <span v-if="board.description" class="board-desc">
                {{ board.description }}
              </span>
            </div>
          </DepthCard>
        </GlowBorder>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

/* Hero */
.hero {
  text-align: center;
  padding: var(--space-8) 0 var(--space-4);
}

.hero-title {
  font-size: clamp(2.5rem, 6vw, 4rem);
  letter-spacing: -0.03em;
  margin-bottom: var(--space-4);
  color: var(--text-primary);
}

.hero-subtitle {
  font-size: 1.1rem;
  color: var(--text-secondary);
  max-width: 50ch;
  margin: 0 auto;
  line-height: 1.6;
}

/* Section label */
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

/* Board cards grid */
.boards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.board-card {
  text-decoration: none;
  color: inherit;
  display: block;
  outline: none;
}

.board-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: var(--radius-lg);
}

.board-card-inner {
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.board-slug {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.02em;
}

.board-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.board-desc {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
}

@media (max-width: 640px) {
  .boards-grid {
    grid-template-columns: 1fr;
  }

  .hero-title {
    font-size: 2rem;
  }
}
</style>

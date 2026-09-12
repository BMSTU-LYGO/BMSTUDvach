<script setup lang="ts">
import { onMounted, ref } from 'vue'

import DepthCard from '@/components/ui/DepthCard.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import { listPlatinumStories, type PlatinumStory } from '@/api/platinum'
import { setStoryCount } from '@/three/sceneState'

/**
 * /platinum/ — the Archive Space. The actual 3D rings/fragments live in
 * the persistent network scene (mode 'platinum'); this view feeds it the
 * published-story count and renders the readable fragments underneath.
 */

const loading = ref(true)
const error = ref('')
const stories = ref<PlatinumStory[]>([])
const total = ref(0)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const page = await listPlatinumStories()
    stories.value = page.results
    total.value = page.count
    setStoryCount(page.count)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Архив недоступен.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="platinum-page">
    <header class="archive-head">
      <h1 class="archive-title">/platinum/</h1>
      <p class="archive-sub">
        Архив переработанных историй МГТУ. Фрагменты вращаются в кольцах —
        наведи курсор, чтобы сфокусироваться на фрагменте.
      </p>
      <div class="archive-stats" aria-live="polite">
        <span class="stat-node" :class="{ idle: total === 0 }"></span>
        <span class="stat-text">
          <template v-if="loading">Синхронизация архива…</template>
          <template v-else-if="total > 0">
            фрагментов в кольцах: {{ total }}
          </template>
          <template v-else>Архив пуст — кольца вращаются вхолостую</template>
        </span>
      </div>
    </header>

    <LoadingState v-if="loading" />
    <ErrorState v-else-if="error" :message="error" :on-retry="load" />
    <div v-else-if="stories.length" class="fragments">
      <DepthCard v-for="story in stories" :key="story.id" :depth="1">
        <article class="fragment-card">
          <h3>{{ story.title }}</h3>
          <p class="fragment-body">{{ story.body }}</p>
          <footer class="fragment-meta">
            <span class="text-mono">node #{{ story.id }}</span>
            <span v-if="story.published_at">
              опубликована
              {{ new Date(story.published_at).toLocaleDateString('ru-RU') }}
            </span>
          </footer>
        </article>
      </DepthCard>
    </div>
    <div v-else class="archive-empty" data-testid="platinum-empty">
      <div class="empty-rings" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <p>
        Пустой архив — это тоже красиво: три орбиты, ядро-хранилище
        и ожидание первых историй.
      </p>
    </div>
  </section>
</template>

<style scoped>
.platinum-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.archive-head {
  text-align: center;
  padding-top: var(--space-8);
}

.archive-title {
  font-size: clamp(2rem, 5vw, 3rem);
  color: var(--text-primary);
  margin-bottom: var(--space-3);
}

.archive-sub {
  color: var(--text-secondary);
  max-width: 52ch;
  margin: 0 auto var(--space-5);
  line-height: 1.6;
}

.archive-stats {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: var(--bg-surface);
}

.stat-node {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent-glow-strong);
}

.stat-node.idle {
  background: var(--text-muted);
  box-shadow: none;
  animation: pulseIdle 2.4s ease-in-out infinite;
}

@keyframes pulseIdle {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 0.8;
  }
}

.stat-text {
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

/* Fragment cards */
.fragments {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}

.fragment-card {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.fragment-card h3 {
  margin: 0;
  color: var(--accent);
  font-size: 1rem;
}

.fragment-body {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fragment-meta {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* Empty archive ornament */
.archive-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-12) 0;
  text-align: center;
}

.archive-empty p {
  color: var(--text-muted);
  max-width: 46ch;
}

.empty-rings {
  position: relative;
  width: 150px;
  height: 150px;
}

.empty-rings span {
  position: absolute;
  inset: 0;
  border: 1px solid var(--border-medium);
  border-radius: 50%;
  transform: rotateX(62deg);
}

.empty-rings span:nth-child(2) {
  inset: 18%;
  border-color: var(--border-accent);
  transform: rotateX(62deg) rotate(24deg);
  animation: ringSpin 9s linear infinite;
}

.empty-rings span:nth-child(3) {
  inset: 36%;
  transform: rotateX(62deg) rotate(-18deg);
  animation: ringSpin 6s linear infinite reverse;
}

@keyframes ringSpin {
  to {
    transform: rotateX(62deg) rotate(384deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .empty-rings span,
  .stat-node.idle {
    animation: none;
  }
}
</style>

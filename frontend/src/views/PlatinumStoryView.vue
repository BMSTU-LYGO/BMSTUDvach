<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import { getPlatinumStory, type PlatinumStory } from '@/api/platinum'
import { ApiRequestError } from '@/api/client'

/**
 * Archive reading stage. The network scene stays in archive mode; the
 * reading surface itself is deliberately quiet — editorial typography,
 * no decorative motion, comfortable measure.
 */

const route = useRoute()
const storyId = Number(route.params.storyId)

const loading = ref(true)
const error = ref('')
const story = ref<PlatinumStory | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    story.value = await getPlatinumStory(storyId)
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) {
      error.value = 'Фрагмент не найден в архиве.'
    } else {
      error.value = 'Архив недоступен.'
    }
  } finally {
    loading.value = false
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

onMounted(load)
</script>

<template>
  <article class="story-stage" data-testid="platinum-story">
    <RouterLink to="/platinum" class="story-back">← архив</RouterLink>

    <LoadingState v-if="loading" />
    <ErrorState v-else-if="error" :message="error" :on-retry="load" />

    <template v-else-if="story">
      <header class="story-head">
        <h1 class="story-title">{{ story.title }}</h1>
        <div class="story-meta">
          <span class="text-mono">node #{{ story.id }}</span>
          <span class="story-meta-sep">·</span>
          <span>{{ formatDate(story.published_at) }}</span>
          <template v-if="story.source_type">
            <span class="story-meta-sep">·</span>
            <span class="story-source">{{ story.source_type }}</span>
          </template>
        </div>
      </header>
      <div class="story-body">{{ story.body }}</div>
    </template>
  </article>
</template>

<style scoped>
.story-stage {
  max-width: 68ch;
  margin: 0 auto;
  padding: var(--space-8) 0 var(--space-16);
  animation: story-in 320ms var(--ease-out-quart);
}

@keyframes story-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.story-back {
  display: inline-block;
  font-family: var(--font-display);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  text-decoration: none;
  margin-bottom: var(--space-8);
  transition: color var(--duration-fast);
}

.story-back:hover {
  color: var(--accent);
}

.story-title {
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  line-height: 1.2;
  margin: 0 0 var(--space-4);
  color: var(--text-primary);
}

.story-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: 0.78rem;
  color: var(--text-muted);
  padding-bottom: var(--space-6);
  border-bottom: 1px solid var(--border-subtle);
}

.story-meta-sep {
  opacity: 0.5;
}

.story-source {
  font-family: var(--font-display);
  color: var(--accent-dim);
}

.story-body {
  margin-top: var(--space-6);
  font-size: 1.02rem;
  line-height: 1.8;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

@media (prefers-reduced-motion: reduce) {
  .story-stage {
    animation: none;
  }
}
</style>

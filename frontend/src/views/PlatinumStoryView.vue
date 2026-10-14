<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

/**
 * The body is stored as plain text with blank lines between paragraphs.
 * Rendering one run of `pre-wrap` makes a wall of text; splitting on the
 * blank lines gives the story its rhythm while every line break inside a
 * paragraph stays in the DOM, so the text content remains the body verbatim.
 */
const paragraphs = computed<string[]>(() => {
  const body = story.value?.body ?? ''
  return body
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
})

onMounted(load)
</script>

<template>
  <article class="story-stage" data-testid="platinum-story">
    <RouterLink to="/platinum" class="story-back">
      <span class="story-back__arrow" aria-hidden="true">←</span>
      архив
    </RouterLink>

    <LoadingState v-if="loading" />
    <ErrorState v-else-if="error" :message="error" :on-retry="load" />

    <template v-else-if="story">
      <header class="story-head">
        <h1 class="story-title">{{ story.title }}</h1>
        <dl class="story-meta">
          <div class="story-meta__cell">
            <dt class="story-meta__key">узел</dt>
            <dd class="story-meta__value text-mono">node #{{ story.id }}</dd>
          </div>
          <div class="story-meta__cell">
            <dt class="story-meta__key">опубликована</dt>
            <dd class="story-meta__value">
              <time :datetime="story.published_at ?? undefined">{{
                formatDate(story.published_at)
              }}</time>
            </dd>
          </div>
          <div v-if="story.source_type" class="story-meta__cell">
            <dt class="story-meta__key">источник</dt>
            <dd class="story-meta__value story-meta__value--source">
              {{ story.source_type }}
            </dd>
          </div>
        </dl>
      </header>
      <div class="story-body">
        <p v-for="(paragraph, index) in paragraphs" :key="index" class="story-para">
          {{ paragraph }}
        </p>
      </div>
    </template>
  </article>
</template>

<style scoped>
/* Reading stage: one measure, one hairline set of rules, accent only on
   the way back to the archive. */
.story-stage {
  --story-measure: 70ch;
  max-width: var(--story-measure);
  margin: 0 auto;
  padding: var(--space-8) 0 var(--space-16);
  animation: story-in 240ms var(--ease-out-quart);
}

@keyframes story-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

/* === Back to the archive: a node, not a bare link === */
.story-back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  margin-bottom: var(--space-8);
  padding: 0 var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-decoration: none;
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) var(--ease-out-quart),
    box-shadow var(--duration-fast) var(--ease-out-quart);
}

.story-back:hover {
  border-color: var(--border-accent);
  color: var(--accent);
  box-shadow: 0 0 20px var(--accent-glow);
}

.story-back:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.story-back__arrow {
  color: var(--accent);
}

/* === Head: title, then the metadata strip === */
.story-title {
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  line-height: 1.2;
  margin: 0 0 var(--space-5);
  color: var(--text-primary);
}

.story-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-5);
  padding-bottom: var(--space-6);
  border-bottom: 1px solid var(--border-subtle);
}

.story-meta__cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-right: var(--space-5);
}

.story-meta__cell:not(:last-child) {
  border-right: 1px solid var(--border-subtle);
}

.story-meta__key {
  font-family: var(--font-display);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.story-meta__value {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.story-meta__value--source {
  font-family: var(--font-display);
  color: var(--accent-dim);
}

/* === Body: one measure, paragraph rhythm === */
.story-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  margin-top: var(--space-6);
}

.story-para {
  max-width: var(--story-measure);
  font-size: 1.02rem;
  line-height: 1.7;
  color: var(--text-secondary);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

@media (prefers-reduced-motion: reduce) {
  .story-stage {
    animation: none;
  }

  .story-back {
    transition: none;
  }
}

@media (max-width: 640px) {
  .story-stage {
    padding: var(--space-6) 0 var(--space-12);
  }

  .story-meta {
    gap: var(--space-3) 0;
  }

  .story-meta__cell {
    padding-right: 0;
    border-right: none;
  }
}
</style>

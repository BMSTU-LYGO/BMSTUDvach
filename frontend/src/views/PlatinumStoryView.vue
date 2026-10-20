<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import { getPlatinumStory, type PlatinumStory } from '@/api/platinum'
import { ApiRequestError } from '@/api/client'
import {
  emitSceneEvent,
  focusStory,
  sceneState,
  selectStory,
  setArchiveStories,
  type ArchiveStoryRef,
} from '@/three/sceneState'
import { ringsFor } from '@/three/archive/layout'
import { gsap, prefersReducedMotion } from '@/composables/useGsap'

/**
 * Archive reading stage. The archive space keeps running behind the page:
 * the camera flies to the fragment this story belongs to and the reading
 * surface unfolds on top of it. The text itself stays editorial — one
 * measure, paragraph rhythm, no decoration.
 */

const route = useRoute()
const storyId = Number(route.params.storyId)

const loading = ref(true)
const error = ref('')
const story = ref<PlatinumStory | null>(null)
/** The frame of the reading layer — the scope of the cinematic entrance. */
const frameRef = ref<HTMLElement | null>(null)
/** The GSAP context of the entrance — reverted when the story closes. */
let revealCtx: gsap.Context | null = null

/** The camera needs a moment before the text comes in. */
const REVEAL_DELAY = 0.25

/** Publication year of a story (null = undated or unparsable date). */
function yearOf(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  const year = new Date(parsed).getFullYear()
  return Number.isFinite(year) ? year : null
}

/**
 * The scene descriptor of a story: one fragment in the archive space.
 *
 * The ring comes from the very same layout the space uses, so the fragment
 * the camera flies to lives on the epoch ring the reader would see.
 */
function archiveRef(loaded: PlatinumStory): ArchiveStoryRef {
  const year = yearOf(loaded.published_at)
  const rings = ringsFor([
    {
      id: loaded.id,
      sourceType: loaded.source_type ?? undefined,
      year: year ?? undefined,
    },
  ])
  return {
    id: loaded.id,
    title: loaded.title,
    year,
    ringIndex: rings[0]?.index ?? 0,
    sourceType: loaded.source_type ?? null,
  }
}

/**
 * The space takes the story: the camera flies to its fragment and the
 * archive knows which fragment is open.
 *
 * A reader who came straight to the story knows nothing about the archive
 * list, so the space gets this single fragment to aim at — the whole list
 * is never pulled in for the sake of one story.
 */
function openInScene(loaded: PlatinumStory) {
  // The reveal transition of the director may have opened the story already
  // (the reader came from the archive list) — the event is sent once.
  const alreadyOpen = sceneState.selectedStory === loaded.id

  if (sceneState.archiveStories.length === 0) {
    setArchiveStories([archiveRef(loaded)])
  }

  selectStory(loaded.id)
  focusStory(loaded.id)

  if (!alreadyOpen) {
    emitSceneEvent({ type: 'archive-open', target: loaded.id })
  }
}

/**
 * The way back to the archive: the fragment is closed and the space is
 * released. The link itself still navigates — the cleanup only prepares
 * the frame the archive returns to.
 */
function closeInScene() {
  selectStory(null)
  focusStory(null)
  emitSceneEvent({ type: 'archive-clear' })
}

/**
 * The cinematic entrance of the reading layer: the fragment is already in
 * the light, the text unfolds on top of it — the kicker and the metadata
 * strip first, the title after them, the paragraphs one by one.
 *
 * Under reduced motion the final frame is the first frame: nothing moves.
 */
function reveal() {
  const frame = frameRef.value
  if (!frame || !story.value || error.value) return
  if (prefersReducedMotion()) return

  // A second entrance (a retry) replaces the first one.
  revealCtx?.revert()

  revealCtx = gsap.context(() => {
    gsap.fromTo(
      '.story-stage',
      { opacity: 0, y: 18 },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: 'power3.out',
        delay: REVEAL_DELAY,
      },
    )
    gsap.fromTo(
      '.story-kicker',
      { opacity: 0, y: 10 },
      {
        opacity: 1,
        y: 0,
        duration: 0.45,
        ease: 'power2.out',
        delay: REVEAL_DELAY + 0.18,
      },
    )
    gsap.fromTo(
      '.story-meta',
      { opacity: 0, y: 10 },
      {
        opacity: 1,
        y: 0,
        duration: 0.45,
        ease: 'power2.out',
        delay: REVEAL_DELAY + 0.24,
      },
    )
    gsap.fromTo(
      '.story-title',
      { opacity: 0, y: 16 },
      {
        opacity: 1,
        y: 0,
        duration: 0.55,
        ease: 'power3.out',
        delay: REVEAL_DELAY + 0.3,
      },
    )
    gsap.fromTo(
      '.story-para',
      { opacity: 0, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: 0.45,
        ease: 'power2.out',
        delay: REVEAL_DELAY + 0.42,
        stagger: 0.05,
      },
    )
  }, frame)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const loaded = await getPlatinumStory(storyId)
    story.value = loaded
    openInScene(loaded)
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) {
      error.value = 'Фрагмент не найден в архиве.'
    } else {
      error.value = 'Архив недоступен.'
    }
  } finally {
    loading.value = false
  }
  // The stage is in the DOM only now — the entrance has something to hold.
  await nextTick()
  reveal()
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

onBeforeUnmount(() => {
  // The story was left by another route (the browser's back button): the
  // archive must not keep an open fragment. The story list itself lives in
  // PlatinumView and is left alone.
  if (sceneState.selectedStory === storyId) selectStory(null)
  if (sceneState.focusedStory === storyId) focusStory(null)
  revealCtx?.revert()
  revealCtx = null
})
</script>

<template>
  <div class="story-frame" ref="frameRef">
    <!-- The cinema layer: the rings behind the reading column dim down, so
         the fragment the camera holds is the only lit thing in the vault. -->
    <div class="story-cinema" aria-hidden="true"></div>

    <article class="story-stage" data-testid="platinum-story">
      <RouterLink to="/platinum" class="story-back" @click="closeInScene">
        <span class="story-back__arrow" aria-hidden="true">←</span>
        архив
      </RouterLink>

      <LoadingState v-if="loading" />
      <ErrorState v-else-if="error" :message="error" :on-retry="load" />

      <template v-else-if="story">
        <header class="story-head">
          <p class="story-kicker">// архив</p>
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
  </div>
</template>

<style scoped>
/* The frame holds the reading column and the cinema layer over the
   archive space. */
.story-frame {
  position: relative;
}

/* The cinema layer: a soft vignette that dims the rings behind the page.
   The reading column stays in the clear, so the contrast of the text does
   not change; the layer never takes the pointer. */
.story-cinema {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse 70% 60% at 50% 42%,
    transparent 0%,
    rgba(28, 26, 20, 0.05) 58%,
    rgba(28, 26, 20, 0.12) 100%
  );
}

/* Reading stage: one measure, one hairline set of rules, accent only on
   the way back to the archive. */
.story-stage {
  --story-measure: 70ch;
  position: relative;
  z-index: 1;
  max-width: var(--story-measure);
  margin: 0 auto;
  padding: var(--space-8) 0 var(--space-16);
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

/* === Kicker: the archive speaks before the title === */
.story-kicker {
  margin: 0 0 var(--space-3);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
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

  /* The vignette is weaker on a narrow screen: the reading column reaches
     the edges there, and the paper must stay light under the text. */
  .story-cinema {
    background: radial-gradient(
      ellipse 94% 70% at 50% 38%,
      transparent 0%,
      rgba(28, 26, 20, 0.04) 60%,
      rgba(28, 26, 20, 0.09) 100%
    );
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

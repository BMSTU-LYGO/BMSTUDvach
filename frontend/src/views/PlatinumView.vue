<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import { listPlatinumStories, type PlatinumStory } from '@/api/platinum'
import {
  emitSceneEvent,
  focusStory,
  onSceneEvent,
  sceneState,
  selectStory,
  setArchiveStories,
  setStoryCount,
  type ArchiveStoryRef,
} from '@/three/sceneState'
import { ringsFor } from '@/three/archive/layout'
import { prefersReducedMotion } from '@/composables/useGsap'
import { apiErrorMessage } from '@/api/client'

/**
 * /platinum/ — the Archive Space. The actual 3D rings/fragments live in
 * the persistent network scene (mode 'platinum'); this view is the single
 * source of truth of the archive: it feeds the space with the stories it
 * loaded and keeps the readable list in sync with the focused fragment.
 */

const router = useRouter()

const loading = ref(true)
const error = ref('')
const stories = ref<PlatinumStory[]>([])
const total = ref(0)
const page = ref(1)
const loadingMore = ref(false)
const query = ref('')
const search = ref('')
/** Story the space focuses on (null = the space orbits freely). */
const focusedId = ref<number | null>(null)
/** The list of fragments — the scroll container of the archive. */
const listRef = ref<HTMLElement | null>(null)

/** Publication year of a story (null = undated or unparsable date). */
function yearOf(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  const year = new Date(parsed).getFullYear()
  return Number.isFinite(year) ? year : null
}

/**
 * The scene descriptors of a set of stories: one fragment per story.
 *
 * The rings come from the very same layout the 3D space uses, so the epoch
 * a fragment lives on is the epoch the reader sees. The unpublished stories
 * share the innermost ring.
 */
function archiveRefs(list: PlatinumStory[]): ArchiveStoryRef[] {
  const years = new Map<number, number | null>()
  for (const story of list) years.set(story.id, yearOf(story.published_at))

  const rings = ringsFor(
    list.map((story) => ({
      id: story.id,
      sourceType: story.source_type ?? undefined,
      year: years.get(story.id) ?? undefined,
    })),
  )
  const ringOf = new Map<number, number>()
  for (const ring of rings) {
    for (const id of ring.stories) ringOf.set(id, ring.index)
  }

  return list.map((story) => ({
    id: story.id,
    title: story.title,
    year: years.get(story.id) ?? null,
    ringIndex: ringOf.get(story.id) ?? 0,
    sourceType: story.source_type ?? null,
  }))
}

/** Hand a set of stories to the archive space. */
function syncArchive(list: PlatinumStory[]) {
  setArchiveStories(archiveRefs(list))
}

async function load() {
  loading.value = true
  error.value = ''
  // The rings breathe empty while the archive answers.
  setArchiveStories([])
  try {
    const result = await listPlatinumStories({ search: search.value })
    stories.value = result.results
    total.value = result.count
    setStoryCount(result.count)
    syncArchive(result.results)
  } catch (err) {
    error.value = apiErrorMessage(err, 'Архив недоступен.')
    setArchiveStories([])
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  loadingMore.value = true
  try {
    const next = await listPlatinumStories({
      page: page.value + 1,
      search: search.value,
    })
    stories.value.push(...next.results)
    total.value = next.count
    page.value += 1
    // The space grows with the list: every loaded story is a fragment.
    syncArchive(stories.value)
  } catch {
    // keep what we already have; the archive is a slow place
  } finally {
    loadingMore.value = false
  }
}

// Debounced archive search — one source of truth, refetch from page 1.
let debounce: number | null = null
watch(query, (value) => {
  if (debounce) window.clearTimeout(debounce)
  debounce = window.setTimeout(() => {
    search.value = value.trim()
    page.value = 1
    void load()
  }, 300)
})

// The archive answers in the same register it was asked in.
const emptyMessage = computed(() =>
  search.value
    ? `По запросу «${search.value}» архив молчит.`
    : 'Пустой архив — это тоже красиво: три орбиты, ядро-хранилище и ожидание первых историй.',
)

function published(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('ru-RU') : ''
}

/* === The list speaks to the space ==================================== */

/** The reader points at a row: the space focuses that fragment. */
function focusRow(id: number) {
  if (sceneState.focusedStory === id) return
  focusStory(id)
  emitSceneEvent({ type: 'archive-focus', target: id })
}

/**
 * The reader leaves a row: the focus is released — unless the space has
 * already moved on to another fragment, which a stale leave must not
 * overwrite.
 */
function releaseRow(id: number) {
  if (sceneState.focusedStory !== id) return
  focusStory(null)
  emitSceneEvent({ type: 'archive-focus', target: null })
}

/** The row was opened: the space must know which fragment was chosen. */
function openRow(id: number) {
  selectStory(id)
}

/**
 * Bring a row into view — gently. The scroll happens only when the row is
 * really out of sight and the reader did not ask for calm motion, so the
 * list never jumps under the pointer.
 */
function revealRow(id: number) {
  const list = listRef.value
  if (!list) return
  const row = list.querySelector<HTMLElement>(`[data-story-id="${id}"]`)
  if (!row || typeof row.scrollIntoView !== 'function') return
  const bounds = list.getBoundingClientRect()
  const rect = row.getBoundingClientRect()
  // The visible band of the list: the viewport, clipped by the list itself.
  const top = Math.max(bounds.top, 0)
  const bottom = Math.min(bounds.bottom, window.innerHeight || bounds.bottom)
  const inside = rect.top >= top && rect.bottom <= bottom
  if (inside) return
  if (prefersReducedMotion()) return
  row.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'nearest',
  })
}

// The space focuses a fragment: the list marks the row and looks at it.
watch(
  () => sceneState.focusedStory,
  (id) => {
    focusedId.value = id
    if (id === null) return
    void nextTick(() => revealRow(id))
  },
  { immediate: true },
)

/* === The space speaks to the list ==================================== */

let offScene: (() => void) | null = null

onMounted(() => {
  offScene = onSceneEvent((ev) => {
    // A fragment was clicked in 3D: the archive opens the story.
    if (ev.type !== 'archive-open') return
    selectStory(ev.target)
    void router.push(`/platinum/${ev.target}`)
  })
  void load()
})

onBeforeUnmount(() => {
  offScene?.()
  offScene = null
})
</script>

<template>
  <section class="platinum-page">
    <header class="archive-head">
      <p class="archive-kicker">// archive space</p>
      <h1 class="archive-title">/platinum/</h1>
      <p class="archive-sub">
        Архив переработанных историй МГТУ. Фрагменты вращаются в кольцах — наведи
        курсор, чтобы сфокусироваться на фрагменте.
      </p>

      <div class="archive-search" role="search">
        <label class="archive-search__label" for="archive-search"
          >ПОИСК ПО АРХИВУ</label
        >
        <input
          id="archive-search"
          v-model="query"
          class="archive-search__input"
          type="search"
          placeholder="слово, тема, корпус…"
          autocomplete="off"
        />
      </div>

      <div class="archive-stats" aria-live="polite">
        <span class="stat-node" :class="{ idle: total === 0 }"></span>
        <span class="stat-text">
          <template v-if="loading">Синхронизация архива…</template>
          <template v-else-if="total > 0"> фрагментов в кольцах: {{ total }} </template>
          <template v-else>Архив пуст — кольца вращаются вхолостую</template>
        </span>
      </div>
    </header>

    <LoadingState v-if="loading" />
    <ErrorState v-else-if="error" :message="error" :on-retry="load" />

    <div v-else-if="stories.length" class="archive-fragments">
      <p class="archive-fragments__caption">
        fragments · показано {{ stories.length }} из {{ total }}
      </p>
      <ol class="fragments" :aria-busy="loadingMore" ref="listRef">
        <li v-for="story in stories" :key="story.id" class="fragment">
          <RouterLink
            :to="`/platinum/${story.id}`"
            class="fragment-link"
            :class="{ 'fragment-link--focused': focusedId === story.id }"
            :data-focused="focusedId === story.id ? 'true' : undefined"
            :data-story-id="story.id"
            data-testid="fragment-row"
            @pointerenter="focusRow(story.id)"
            @mouseenter="focusRow(story.id)"
            @pointerleave="releaseRow(story.id)"
            @mouseleave="releaseRow(story.id)"
            @focus="focusRow(story.id)"
            @blur="releaseRow(story.id)"
            @click="openRow(story.id)"
          >
            <span class="fragment-id text-mono">#{{ story.id }}</span>
            <span class="fragment-main">
              <span class="fragment-title">{{ story.title }}</span>
              <span class="fragment-teaser">{{ story.body }}</span>
            </span>
            <time
              v-if="story.published_at"
              class="fragment-date"
              :datetime="story.published_at"
              >{{ published(story.published_at) }}</time
            >
          </RouterLink>
        </li>
      </ol>
    </div>

    <div v-else class="archive-empty" data-testid="platinum-empty">
      <EmptyState :message="emptyMessage" />
    </div>

    <button
      v-if="stories.length > 0 && stories.length < total"
      type="button"
      class="archive-more"
      :disabled="loadingMore"
      @click="loadMore"
    >
      <span v-if="loadingMore" class="archive-more__dot" aria-hidden="true"></span>
      <span v-if="loadingMore">вытягиваем фрагменты…</span>
      <span v-else>ещё {{ total - stories.length }} в кольцах ↓</span>
    </button>
  </section>
</template>

<style scoped>
/* Archive Space register: mono micro-captions, hairline rules, one amber
   accent per interaction. All motion stays under 260ms. */
.platinum-page {
  --archive-duration: 200ms;
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

/* === Header: instrument panel, not a hero === */
.archive-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-top: var(--space-6);
}

.archive-kicker {
  margin: 0 0 var(--space-3);
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent-dim);
}

.archive-title {
  font-size: clamp(2rem, 5vw, 3rem);
  margin: 0 0 var(--space-4);
  color: var(--text-primary);
  text-shadow: 0 0 28px var(--accent-glow);
}

.archive-sub {
  max-width: 52ch;
  margin: 0 0 var(--space-6);
  color: var(--text-secondary);
  line-height: 1.6;
}

/* === Search: instrument, not a form field === */
.archive-search {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  max-width: 360px;
  margin-bottom: var(--space-5);
  text-align: left;
}

.archive-search__label {
  font-family: var(--font-display);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.archive-search__input {
  width: 100%;
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-display);
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  color: var(--text-primary);
  background: var(--bg-deep);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  outline: none;
  transition:
    border-color var(--archive-duration) var(--ease-out-quart),
    box-shadow var(--archive-duration) var(--ease-out-quart);
}

.archive-search__input::placeholder {
  font-family: var(--font-display);
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.archive-search__input:hover {
  border-color: var(--border-medium);
}

.archive-search__input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.archive-search__input::-webkit-search-cancel-button {
  filter: invert(0.6);
}

/* === Live counter: node on a wire === */
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
  flex-shrink: 0;
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
  font-size: 0.74rem;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

/* === Fragments: rows of the archive, not cards === */
.archive-fragments {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.archive-fragments__caption {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.fragments {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--border-subtle);
}

.fragment {
  border-bottom: 1px solid var(--border-subtle);
}

.fragment-link {
  position: relative;
  display: grid;
  grid-template-columns: 4rem 1fr auto;
  align-items: baseline;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-3);
  text-decoration: none;
  color: inherit;
  transition:
    background var(--archive-duration) var(--ease-out-quart),
    box-shadow var(--archive-duration) var(--ease-out-quart);
}

.fragment-link:hover,
.fragment-link:focus-visible {
  background: color-mix(in oklab, var(--accent) 6%, transparent);
  box-shadow: inset 2px 0 0 color-mix(in oklab, var(--accent) 70%, transparent);
}

.fragment-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.fragment-id {
  font-size: 0.74rem;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  transition: color var(--archive-duration) var(--ease-out-quart);
}

.fragment-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.fragment-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  transition: color var(--archive-duration) var(--ease-out-quart);
}

.fragment-teaser {
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fragment-date {
  font-family: var(--font-display);
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.fragment-link:hover .fragment-title,
.fragment-link:focus-visible .fragment-title {
  color: var(--accent);
}

.fragment-link:hover .fragment-id,
.fragment-link:focus-visible .fragment-id {
  color: var(--accent-dim);
}

/* The space focused this fragment: the row answers with the same hairline
   the pointer leaves on hover — one accent per interaction. */
.fragment-link--focused {
  background: color-mix(in oklab, var(--accent) 6%, transparent);
  box-shadow: inset 2px 0 0 color-mix(in oklab, var(--accent) 70%, transparent);
  transition:
    background var(--archive-duration) var(--ease-out-quart),
    box-shadow var(--archive-duration) var(--ease-out-quart);
}

.fragment-link--focused .fragment-title {
  color: var(--accent);
}

.fragment-link--focused .fragment-id {
  color: var(--accent-dim);
}

@media (max-width: 640px) {
  .fragment-link {
    grid-template-columns: 1fr;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-2);
  }

  .fragment-date {
    font-size: 0.68rem;
  }
}

/* === Load more: a dashed node, not a pill === */
.archive-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  align-self: center;
  min-height: 44px;
  padding: 0 var(--space-6);
  background: var(--bg-surface);
  border: 1px dashed var(--border-medium);
  border-radius: var(--radius-md);
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    border-color var(--archive-duration) var(--ease-out-quart),
    color var(--archive-duration) var(--ease-out-quart),
    box-shadow var(--archive-duration) var(--ease-out-quart);
}

.archive-more:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text-primary);
  box-shadow: 0 0 24px color-mix(in oklab, var(--accent) 14%, transparent);
}

.archive-more:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.archive-more:disabled {
  color: var(--text-muted);
  cursor: progress;
}

.archive-more__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: archive-pulse 1.2s var(--ease-out-quart) infinite;
}

@keyframes archive-pulse {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}

/* === Empty archive: the shared state speaks for itself === */
.archive-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-10) 0 var(--space-12);
}

@media (prefers-reduced-motion: reduce) {
  .archive-search__input,
  .fragment-link,
  .fragment-link--focused,
  .fragment-id,
  .fragment-title,
  .archive-more {
    transition: none;
  }

  .archive-more__dot,
  .stat-node.idle {
    animation: none;
  }
}
</style>

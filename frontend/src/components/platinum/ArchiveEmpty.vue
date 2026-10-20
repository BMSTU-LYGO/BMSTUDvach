<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * «АРХИВ МОЛЧИТ» — the archive's own instrument panel for its four quiet
 * states: an empty vault, a silent search, syncing rings, a broken line.
 *
 * Presentational by contract: props in, events out, one slot for the
 * caller's action. No API, no store, no router, no three — the panel is the
 * archive's voice, the view decides what the archive says.
 *
 * Register: editorial archive. Hairline rules instead of a card, one amber
 * accent for the vault itself, mono for the data, serif for the line.
 */

type ArchiveMode = 'empty' | 'search' | 'error' | 'loading'

const props = withDefaults(
  defineProps<{
    /** Which of the four quiet states the panel speaks for. */
    mode?: ArchiveMode
    /** The query the archive was asked in (search state). */
    query?: string
    /** How many fragments the vault actually holds. */
    total?: number
    /** Error text (error state) or a hint (loading state). */
    detail?: string
  }>(),
  {
    mode: 'empty',
    query: '',
    total: 0,
    detail: '',
  },
)

const emit = defineEmits<{
  /** The line broke — ask the archive again. */
  retry: []
  /** The search found nothing — let the archive forget the query. */
  reset: []
}>()

const uid = useId()
const titleId = `archive-empty-title-${uid}`

/** The archive always has three orbits, however many fragments it holds. */
const ORBITS = 3

/** The vault's own mood, spelled in mono like the rest of the instrument. */
const VAULT_STATE: Record<ArchiveMode, string> = {
  empty: 'idle',
  search: 'search',
  loading: 'sync',
  error: 'error',
}

const title = computed(() => {
  switch (props.mode) {
    case 'search':
      return `По запросу «${props.query}» архив молчит.`
    case 'loading':
      return 'Синхронизация архива…'
    case 'error':
      return props.detail || 'Архив недоступен.'
    default:
      return 'Кольца вращаются вхолостую'
  }
})

const caption = computed(
  () =>
    `fragments: ${props.total} · orbits: ${ORBITS} · vault: ${VAULT_STATE[props.mode]}`,
)

/**
 * The rings are the archive's body: they turn while it syncs and keep
 * turning while it waits for its first story.
 */
const showsRings = computed(() => props.mode === 'loading' || props.mode === 'empty')
</script>

<template>
  <section
    class="archive-empty"
    :class="`archive-empty--${props.mode}`"
    data-testid="archive-empty"
    :role="props.mode === 'error' ? 'alert' : 'status'"
    :aria-live="props.mode === 'error' ? undefined : 'polite'"
    :aria-busy="props.mode === 'loading' ? 'true' : undefined"
    :aria-labelledby="titleId"
  >
    <div
      v-if="showsRings"
      class="archive-empty__rings"
      data-testid="archive-empty-rings"
      aria-hidden="true"
    >
      <span class="archive-empty__ring archive-empty__ring--outer"></span>
      <span class="archive-empty__ring archive-empty__ring--middle"></span>
      <span class="archive-empty__ring archive-empty__ring--inner"></span>
    </div>

    <div class="archive-empty__body">
      <h2 :id="titleId" class="archive-empty__title" data-testid="archive-empty-title">
        {{ title }}
      </h2>

      <p class="archive-empty__caption" data-testid="archive-empty-caption">
        <span class="archive-empty__node" aria-hidden="true"></span>
        <span class="archive-empty__metrics">{{ caption }}</span>
      </p>

      <p v-if="props.mode === 'loading' && props.detail" class="archive-empty__hint">
        {{ props.detail }}
      </p>

      <div
        v-if="props.mode === 'empty' || $slots.default"
        class="archive-empty__action"
      >
        <slot>
          <p v-if="props.mode === 'empty'" class="archive-empty__hint">
            Создай историю — она встанет в кольцо.
          </p>
        </slot>
      </div>

      <button
        v-if="props.mode === 'search'"
        type="button"
        class="archive-empty__link"
        data-testid="archive-empty-reset"
        @click="emit('reset')"
      >
        сбросить поиск
      </button>

      <button
        v-if="props.mode === 'error'"
        type="button"
        class="archive-empty__link"
        data-testid="archive-empty-retry"
        @click="emit('retry')"
      >
        попробовать снова
      </button>
    </div>
  </section>
</template>

<style scoped>
/* === The panel: a ruled section of the page, never a card === */
.archive-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-5);
  min-height: 288px;
  padding: var(--space-8) var(--space-4);
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  text-align: center;
}

.archive-empty__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  max-width: 46ch;
}

/* === The line: serif, calm, no shouting === */
.archive-empty__title {
  margin: 0;
  max-width: 44ch;
  font-family: var(--font-display);
  font-size: clamp(1.25rem, 2.6vw, 1.7rem);
  font-weight: 600;
  line-height: 1.3;
  color: var(--ink);
  text-wrap: balance;
  overflow-wrap: anywhere;
  hyphens: auto;
}

/* === The data: mono, tertiary, one amber node for the vault === */
.archive-empty__caption {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: var(--ink-tertiary);
}

.archive-empty__node {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #d4882a;
}

.archive-empty__metrics {
  font-variant-numeric: tabular-nums;
}

/* === The hint: one quiet line under the instrument === */
.archive-empty__hint {
  margin: 0;
  max-width: 42ch;
  font-family: var(--font-body);
  font-size: 0.86rem;
  line-height: 1.6;
  color: var(--ink-secondary);
}

.archive-empty__action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

/* === The rings: the archive's body, hairline and turning === */
.archive-empty__rings {
  position: relative;
  width: 104px;
  height: 104px;
  flex-shrink: 0;
}

.archive-empty__ring {
  position: absolute;
  top: 50%;
  left: 50%;
  border: 1px dashed var(--rule);
  border-radius: 50%;
  transform-origin: center;
  will-change: transform;
}

.archive-empty__ring--outer {
  width: 104px;
  height: 104px;
  margin: -52px 0 0 -52px;
  animation: archive-orbit 38s linear infinite;
}

.archive-empty__ring--middle {
  width: 72px;
  height: 72px;
  margin: -36px 0 0 -36px;
  animation: archive-orbit 27s linear infinite reverse;
}

.archive-empty__ring--inner {
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border-color: #d4882a;
  animation: archive-orbit 18s linear infinite;
}

@keyframes archive-orbit {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* === The action: a link that is still a button === */
.archive-empty__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 var(--space-2);
  background: none;
  border: none;
  border-bottom: 1px solid var(--rule);
  color: var(--accent);
  font-family: var(--font-body);
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}

.archive-empty__link:hover {
  color: var(--accent-hover);
  border-bottom-color: var(--accent);
}

.archive-empty__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* === Narrow screens: the line wraps, the panel breathes less === */
@media (max-width: 640px) {
  .archive-empty {
    min-height: 240px;
    padding: var(--space-6) var(--space-2);
  }

  .archive-empty__title {
    font-size: 1.2rem;
  }

  .archive-empty__caption {
    font-size: 0.66rem;
    letter-spacing: 0.05em;
  }
}

/* === Reduced motion: the rings rest, the links do not shimmer === */
@media (prefers-reduced-motion: reduce) {
  .archive-empty__ring {
    animation: none;
    will-change: auto;
  }

  .archive-empty__link {
    transition: none;
  }
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Rule sheet (P3-T4).
 *
 * The board rules used to be an accordion: a label row, a text toggle
 * button, and a three-line clamp. Rules are not a dropdown — they are a
 * margin note the board runs against its own /slug/ title, so the sheet
 * reads like one: a hairline ruler on the left field, a small kicker, and
 * the first rule already set in the editorial (display) face.
 *
 * One gesture opens it: the marker node on the ruler or the first line.
 * There is no second-person command text anywhere — the state lives on the
 * marker (`aria-expanded`), the keyboard reaches it by tab, and the rest
 * of the note is ruled in line by line through a clip-path mask (the
 * ruler itself draws downward while the lines unveil). A one-line rule is
 * a note that is already read: no marker, no gesture, no mask.
 */
const props = defineProps<{ rules: string }>()

const open = ref(false)

const lines = computed(() =>
  props.rules
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0),
)

const lead = computed(() => lines.value[0] ?? '')
const rest = computed(() => lines.value.slice(1))
// a note that fits on its first line needs no opening gesture at all
const canOpen = computed(() => rest.value.length > 0)

function toggle() {
  if (!canOpen.value) return
  open.value = !open.value
}
</script>

<template>
  <aside
    class="rule-sheet"
    :class="{ 'rule-sheet--open': open, 'rule-sheet--ruled': canOpen }"
    data-testid="board-rules"
  >
    <button
      v-if="canOpen"
      type="button"
      class="rule-sheet__marker"
      data-testid="board-rules-open"
      :aria-expanded="open"
      aria-controls="rule-sheet-more"
      :title="open ? 'Сложить правила' : 'Раскрыть правила'"
      @click="toggle"
    >
      <span class="rule-sheet__spine" aria-hidden="true"></span>
      <span class="rule-sheet__fill" aria-hidden="true"></span>
      <span class="rule-sheet__notch" aria-hidden="true"></span>
    </button>
    <span v-else class="rule-sheet__rule" aria-hidden="true"></span>

    <div class="rule-sheet__body">
      <span class="rule-sheet__kicker">Правила записа</span>
      <button
        v-if="canOpen"
        type="button"
        class="rule-sheet__lead"
        tabindex="-1"
        @click="toggle"
      >
        {{ lead }}<span class="rule-sheet__ellipsis" aria-hidden="true">…</span>
      </button>
      <p v-else class="rule-sheet__lead rule-sheet__lead--still">{{ lead }}</p>

      <!-- the mask: rows wait behind their own hairline, unveiled top-down -->
      <div
        v-if="canOpen"
        id="rule-sheet-more"
        class="rule-sheet__more"
        :aria-hidden="open ? undefined : 'true'"
      >
        <div class="rule-sheet__rows">
          <p
            v-for="(line, i) in rest"
            :key="i"
            class="rule-sheet__row"
            :style="{ '--row': i }"
          >
            {{ line }}
          </p>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.rule-sheet {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: stretch;
  /* the note hangs into the page's left field — it is a margin note */
  margin-left: calc(var(--space-2) * -1);
}

/* ── the left field: one vertical ruler with a node on it ── */
.rule-sheet__marker {
  position: relative;
  width: 44px; /* tap zone stays ≥44px on mobile too */
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--ink-tertiary);
}

.rule-sheet__rule {
  position: relative;
  width: 1px;
  margin: 0 calc(var(--space-5) - 1px);
  background: var(--rule);
}

.rule-sheet__spine {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  margin-left: -0.5px;
  background: var(--rule);
}

/* the ruler draws itself downward while the note opens */
.rule-sheet__fill {
  position: absolute;
  left: 50%;
  top: 0;
  width: 1px;
  height: 0;
  margin-left: -0.5px;
  background: var(--accent);
  transition: height 320ms var(--ease-out);
}

.rule-sheet__notch {
  position: absolute;
  left: 50%;
  top: 0;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border: 1px solid currentColor;
  border-radius: 50%;
  background: var(--paper);
  transition:
    color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}

.rule-sheet__marker:hover {
  color: var(--accent);
}

.rule-sheet__marker:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.rule-sheet--open .rule-sheet__fill {
  height: 100%;
}

.rule-sheet--open .rule-sheet__marker {
  color: var(--accent);
}

.rule-sheet--open .rule-sheet__notch {
  background: var(--accent);
}

/* ── the note itself ── */
.rule-sheet__body {
  min-width: 0;
  padding: var(--space-1) 0 var(--space-2);
}

.rule-sheet__kicker {
  display: block;
  font-family: var(--font-display);
  font-size: 0.64rem;
  letter-spacing: 0.22em;
  color: var(--ink-tertiary);
}

.rule-sheet__lead {
  display: block;
  width: 100%;
  margin: var(--space-1) 0 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  color: var(--ink);
  font-family: var(--font-display);
  font-size: clamp(1.05rem, 2.2vw, 1.2rem);
  font-weight: 500;
  line-height: 1.45;
}

.rule-sheet__lead--still {
  cursor: default;
}

.rule-sheet__lead:hover {
  color: var(--accent);
}

.rule-sheet__lead:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.rule-sheet__ellipsis {
  color: var(--ink-tertiary);
}

.rule-sheet--open .rule-sheet__ellipsis {
  display: none;
}

/* ── the mask: the height unfolds, the rows are ruled in ── */
.rule-sheet__more {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 320ms var(--ease-out);
}

.rule-sheet__rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-height: 0;
  overflow: hidden;
}

.rule-sheet__row {
  margin: 0;
  color: var(--ink-secondary);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  /* each row waits behind its own hairline at the top edge */
  clip-path: inset(0 0 100% 0);
  visibility: hidden;
}

.rule-sheet--open .rule-sheet__more {
  grid-template-rows: 1fr;
}

.rule-sheet--open .rule-sheet__row {
  visibility: visible;
  animation: rule-sheet-unveil 300ms var(--ease-out) both;
  /* one row after another, like a note being ruled in */
  animation-delay: calc(var(--row) * 55ms);
}

@keyframes rule-sheet-unveil {
  from {
    clip-path: inset(0 0 100% 0);
  }

  to {
    clip-path: inset(0 0 0 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rule-sheet__fill,
  .rule-sheet__more,
  .rule-sheet__notch {
    transition: none;
  }

  /* reduced motion rules the sheet in at once — no mask, no delay */
  .rule-sheet__row {
    clip-path: none;
    animation: none;
  }
}
</style>

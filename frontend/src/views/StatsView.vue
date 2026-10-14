<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import ErrorState from '@/components/ErrorState.vue'
import LoadingState from '@/components/LoadingState.vue'
import {
  getTelemetry,
  getTelemetryActivity,
  type Telemetry,
  type TelemetryActivity,
  type TelemetryActivityPoint,
} from '@/api/telemetry'

/**
 * STATS-01 — публичная страница статистики сети.
 *
 * Верх — та же сводка, что и в рейке на главной (переиспользуем
 * `getTelemetry`): разделы, треды, сообщения, вложения, 24 часа и самый
 * активный раздел. Ниже — суточный график активности (`getTelemetryActivity`)
 * на CSS-столбиках: без сторонних библиотек, с честной доступностью —
 * визуальные столбики помечены `aria-hidden`, а точные значения отданы
 * экранному читалку отдельным списком.
 */

type Range = 7 | 30

interface SummaryCell {
  key: string
  label: string
  value: string
  hint: string
}

const telemetry = ref<Telemetry | null>(null)
const summaryLoading = ref(true)
const summaryFailed = ref(false)

const selectedDays = ref<Range>(7)
const activity = ref<TelemetryActivity | null>(null)
const activityLoading = ref(true)
const activityFailed = ref(false)

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

async function loadSummary(): Promise<void> {
  summaryLoading.value = true
  summaryFailed.value = false
  try {
    telemetry.value = await getTelemetry()
  } catch {
    summaryFailed.value = true
  } finally {
    summaryLoading.value = false
  }
}

async function loadActivity(): Promise<void> {
  activityLoading.value = true
  activityFailed.value = false
  try {
    activity.value = await getTelemetryActivity(selectedDays.value)
  } catch {
    activityFailed.value = true
  } finally {
    activityLoading.value = false
  }
}

function selectDays(days: Range): void {
  if (selectedDays.value !== days) selectedDays.value = days
}

watch(selectedDays, loadActivity)
onMounted(() => {
  void loadSummary()
  void loadActivity()
})

const summaryCells = computed<SummaryCell[]>(() => {
  const t = telemetry.value
  if (!t) {
    return [
      { key: 'boards', label: 'РАЗДЕЛЫ', value: '—', hint: 'Активные разделы' },
      { key: 'threads', label: 'ТРЕДЫ', value: '—', hint: 'Видимые треды' },
      { key: 'posts', label: 'СООБЩЕНИЯ', value: '—', hint: 'Видимые сообщения' },
      { key: 'attachments', label: 'ВЛОЖЕНИЯ', value: '—', hint: 'Видимые вложения' },
      { key: 'day', label: '24Ч', value: '—', hint: 'За последние 24 часа' },
      { key: 'active', label: 'АКТИВ', value: '—', hint: 'Самый активный раздел' },
    ]
  }
  return [
    {
      key: 'boards',
      label: 'РАЗДЕЛЫ',
      value: pad(t.boards, 2),
      hint: `Активные разделы: ${t.boards}`,
    },
    {
      key: 'threads',
      label: 'ТРЕДЫ',
      value: pad(t.threads, 3),
      hint: `Видимые треды: ${t.threads}`,
    },
    {
      key: 'posts',
      label: 'СООБЩЕНИЯ',
      value: pad(t.posts, 3),
      hint: `Видимые сообщения: ${t.posts}`,
    },
    {
      key: 'attachments',
      label: 'ВЛОЖЕНИЯ',
      value: pad(t.attachments, 3),
      hint: `Видимые вложения: ${t.attachments}`,
    },
    {
      key: 'day',
      label: '24Ч',
      value: `+${pad(t.last_24h.posts, 3)}`,
      hint: `За 24 часа: сообщений ${t.last_24h.posts}, тредов ${t.last_24h.threads}`,
    },
    {
      key: 'active',
      label: 'АКТИВ',
      value: t.busiest_board ? `/${t.busiest_board.slug}/` : '—',
      hint: t.busiest_board
        ? `Самый активный раздел: /${t.busiest_board.slug}/ — ${t.busiest_board.posts} сообщений`
        : 'Самый активный раздел появится с первым сообщением',
    },
  ]
})

const points = computed<TelemetryActivityPoint[]>(() => activity.value?.points ?? [])

const maxValue = computed<number>(() => {
  const totals = points.value.map((p) => p.posts + p.threads)
  return Math.max(1, ...totals)
})

function barPercent(value: number): string {
  return `${(value / maxValue.value) * 100}%`
}

const labelStep = computed<number>(() => (selectedDays.value <= 7 ? 1 : 5))

function showLabel(index: number): boolean {
  if (index === 0 || index === points.value.length - 1) return true
  return index % labelStep.value === 0
}

function dayParts(iso: string): { y: string; m: string; d: string } {
  const [y, m, d] = iso.split('-')
  return { y, m, d }
}

function shortDate(iso: string): string {
  const { m, d } = dayParts(iso)
  return `${d}.${m}`
}

function fullDate(iso: string): string {
  const { y, m, d } = dayParts(iso)
  return `${d}.${m}.${y}`
}

function barTitle(point: TelemetryActivityPoint): string {
  return `${fullDate(point.date)} — сообщений ${point.posts}, тредов ${point.threads}`
}
</script>

<template>
  <section class="stats" data-testid="stats-page">
    <header class="stats__head">
      <span class="stats__kicker">// network telemetry</span>
      <h1 class="stats__title">СТАТИСТИКА СЕТИ</h1>
      <p class="stats__lead">
        Публичная телеметрия BMSTUDvach: сколько видно узлов, тредов и сигналов и
        как сеть жила последние дни.
      </p>
    </header>

    <section class="summary" aria-labelledby="summary-title">
      <h2 id="summary-title" class="section-title">СВОДКА</h2>
      <LoadingState v-if="summaryLoading" label="Загрузка сводки…" />
      <ErrorState
        v-else-if="summaryFailed"
        message="Сводка сети недоступна."
        :on-retry="loadSummary"
      />
      <dl v-else class="cells">
        <div
          v-for="cell in summaryCells"
          :key="cell.key"
          class="cell"
          :data-testid="`stat-cell-${cell.key}`"
        >
          <dt class="cell__label">{{ cell.label }}</dt>
          <dd class="cell__value" :title="cell.hint">{{ cell.value }}</dd>
        </div>
      </dl>
    </section>

    <section class="activity" aria-labelledby="activity-title">
      <div class="activity__head">
        <h2 id="activity-title" class="section-title">АКТИВНОСТЬ</h2>
        <div class="toggle" role="group" aria-label="Окно графика активности">
          <button
            type="button"
            class="toggle__btn"
            :class="{ 'toggle__btn--active': selectedDays === 7 }"
            data-testid="range-7"
            :aria-pressed="selectedDays === 7"
            @click="selectDays(7)"
          >
            7 ДНЕЙ
          </button>
          <button
            type="button"
            class="toggle__btn"
            :class="{ 'toggle__btn--active': selectedDays === 30 }"
            data-testid="range-30"
            :aria-pressed="selectedDays === 30"
            @click="selectDays(30)"
          >
            30 ДНЕЙ
          </button>
        </div>
      </div>

      <LoadingState v-if="activityLoading" label="Загрузка активности…" />
      <ErrorState
        v-else-if="activityFailed"
        message="Серия активности недоступна."
        :on-retry="loadActivity"
      />

      <div v-else-if="activity" class="chart" data-testid="activity-chart">
        <ul class="chart__data">
          <li v-for="point in points" :key="point.date">
            {{ fullDate(point.date) }}: сообщений {{ point.posts }}, тредов
            {{ point.threads }}
          </li>
        </ul>

        <div class="chart__bars" aria-hidden="true">
          <div
            v-for="(point, index) in points"
            :key="point.date"
            class="chart__col"
            :title="barTitle(point)"
          >
            <div class="chart__stack">
              <span
                class="chart__bar chart__bar--posts"
                :style="{ height: barPercent(point.posts) }"
              ></span>
              <span
                class="chart__bar chart__bar--threads"
                :style="{ height: barPercent(point.threads) }"
              ></span>
            </div>
            <span class="chart__label">{{ showLabel(index) ? shortDate(point.date) : '' }}</span>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.stats {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
}

/* === head === */
.stats__head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
}

.stats__kicker {
  font-family: var(--font-display);
  font-size: 0.66rem;
  letter-spacing: 0.2em;
  color: var(--accent-dim);
}

.stats__title {
  margin: 0;
  font-size: clamp(1.6rem, 4vw, 2.6rem);
  letter-spacing: 0.04em;
  color: var(--text-primary);
}

.stats__lead {
  max-width: 60ch;
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.7;
}

.section-title {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.section-title::before {
  content: '';
  width: 6px;
  height: 6px;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow-strong);
}

.summary,
.activity {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* === summary cells === */
.cells {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-3);
  margin: 0;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  border-left: 2px solid var(--border-accent);
}

.cell__label {
  font-family: var(--font-display);
  font-size: 0.62rem;
  letter-spacing: 0.16em;
  color: var(--text-muted);
}

.cell__value {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

/* === activity chart === */
.activity__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.toggle {
  margin-left: auto;
  display: inline-flex;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.toggle__btn {
  min-height: 36px;
  padding: 0 var(--space-3);
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out-quart),
    background var(--duration-fast) var(--ease-out-quart);
}

.toggle__btn:hover {
  color: var(--text-primary);
}

.toggle__btn--active {
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 12%, transparent);
}

.toggle__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.chart {
  padding: var(--space-5);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.chart__data {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  list-style: none;
}

.chart__bars {
  display: flex;
  align-items: flex-end;
  gap: var(--space-1);
  height: 220px;
  padding-top: var(--space-2);
  border-bottom: 1px solid var(--border-medium);
}

.chart__col {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
}

.chart__stack {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column-reverse;
  justify-content: flex-start;
  width: 100%;
  max-width: 34px;
  min-height: 0;
}

.chart__bar {
  width: 100%;
  min-height: 0;
  background: var(--accent);
  transition: height var(--duration-normal) var(--ease-out-quart);
}

.chart__bar--posts {
  background: var(--accent);
}

.chart__bar--threads {
  background: var(--accent-dim);
}

.chart__col:hover .chart__bar {
  filter: brightness(1.2);
}

.chart__label {
  height: 1.2em;
  margin-top: var(--space-1);
  font-family: var(--font-display);
  font-size: 0.56rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .chart__bar,
  .toggle__btn {
    transition: none;
  }
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { getTelemetry } from '@/api/telemetry'
import type { Telemetry } from '@/api/telemetry'

/**
 * Сетевая телеметрия (TELEMETRY-01) — моно-рейка со сводкой сети под
 * hero. Данные грузит сам компонент: на время загрузки значения —
 * прочерки, при ошибке рейл не рендерится вовсе (главная не ломается).
 */

interface Cell {
  key: string
  label: string
  value: string
  title: string
}

const telemetry = ref<Telemetry | null>(null)
const failed = ref(false)

onMounted(async () => {
  try {
    telemetry.value = await getTelemetry()
  } catch {
    failed.value = true
  }
})

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

const cells = computed<Cell[]>(() => {
  const t = telemetry.value
  if (!t) {
    return [
      {
        key: 'boards',
        label: 'РАЗДЕЛЫ',
        value: '—',
        title: 'Активные разделы: загрузка',
      },
      { key: 'threads', label: 'ТРЕДЫ', value: '—', title: 'Видимые треды: загрузка' },
      {
        key: 'posts',
        label: 'СООБЩЕНИЯ',
        value: '—',
        title: 'Видимые сообщения: загрузка',
      },
      {
        key: 'day',
        label: '24Ч',
        value: '—',
        title: 'За последние 24 часа: загрузка',
      },
      {
        key: 'active',
        label: 'АКТИВ',
        value: '—',
        title: 'Самый активный раздел: загрузка',
      },
    ]
  }
  return [
    {
      key: 'boards',
      label: 'РАЗДЕЛЫ',
      value: pad(t.boards, 2),
      title: `Активные разделы: ${t.boards}`,
    },
    {
      key: 'threads',
      label: 'ТРЕДЫ',
      value: pad(t.threads, 3),
      title: `Видимые треды: ${t.threads}`,
    },
    {
      key: 'posts',
      label: 'СООБЩЕНИЯ',
      value: pad(t.posts, 3),
      title: `Видимые сообщения: ${t.posts}`,
    },
    {
      key: 'day',
      label: '24Ч',
      value: `+${pad(t.last_24h.posts, 3)}`,
      title: `За последние 24 часа: сообщений ${t.last_24h.posts}, тредов ${t.last_24h.threads}`,
    },
    {
      key: 'active',
      label: 'АКТИВ',
      value: t.busiest_board ? `/${t.busiest_board.slug}/` : '—',
      title: t.busiest_board
        ? `Самый активный раздел: /${t.busiest_board.slug}/ — ${t.busiest_board.posts} сообщений`
        : 'Самый активный раздел появится с первым сообщением',
    },
  ]
})
</script>

<template>
  <div
    v-if="!failed"
    class="telemetry-rail"
    role="group"
    aria-label="Сетевая телеметрия"
    data-testid="telemetry-rail"
  >
    <span class="telemetry-rail__lead" aria-hidden="true">ТЕЛЕМЕТРИЯ</span>
    <span
      v-for="cell in cells"
      :key="cell.key"
      class="telemetry-rail__cell"
      :class="`telemetry-rail__cell--${cell.key}`"
      :data-testid="`telemetry-cell-${cell.key}`"
      :title="cell.title"
      :aria-label="cell.title"
    >
      <span class="telemetry-rail__label">{{ cell.label }}</span>
      <span class="telemetry-rail__value">{{ cell.value }}</span>
    </span>
  </div>
</template>

<style scoped>
.telemetry-rail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
  min-height: 44px;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.telemetry-rail__lead {
  color: var(--accent-dim);
  font-size: 0.62rem;
  letter-spacing: 0.22em;
  border: 1px solid color-mix(in oklab, var(--accent) 40%, transparent);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
}

.telemetry-rail__cell {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-2);
  white-space: nowrap;
}

.telemetry-rail__cell + .telemetry-rail__cell {
  border-left: 1px solid var(--border-subtle);
  padding-left: var(--space-4);
}

.telemetry-rail__label {
  color: var(--text-muted);
}

.telemetry-rail__value {
  color: var(--accent);
  font-weight: 600;
}

.telemetry-rail__cell--active .telemetry-rail__value {
  color: var(--accent-dim);
}

@media (max-width: 640px) {
  .telemetry-rail {
    font-size: 0.66rem;
    gap: var(--space-1) var(--space-3);
    padding: var(--space-2) var(--space-3);
  }

  .telemetry-rail__cell + .telemetry-rail__cell {
    padding-left: var(--space-3);
  }

  .telemetry-rail__lead {
    width: 100%;
  }
}
</style>

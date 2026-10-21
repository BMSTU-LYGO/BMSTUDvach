<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { getTelemetry } from '@/api/telemetry'
import type { Telemetry } from '@/api/telemetry'

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
        label: 'Разделы',
        value: '—',
        title: 'Активные разделы: загрузка',
      },
      { key: 'threads', label: 'Треды', value: '—', title: 'Видимые треды: загрузка' },
      {
        key: 'posts',
        label: 'Сообщения',
        value: '—',
        title: 'Видимые сообщения: загрузка',
      },
      {
        key: 'day',
        label: '24 часа',
        value: '—',
        title: 'За последние 24 часа: загрузка',
      },
      {
        key: 'active',
        label: 'Актив',
        value: '—',
        title: 'Самый активный раздел: загрузка',
      },
    ]
  }
  return [
    {
      key: 'boards',
      label: 'Разделы',
      value: pad(t.boards, 2),
      title: `Активные разделы: ${t.boards}`,
    },
    {
      key: 'threads',
      label: 'Треды',
      value: pad(t.threads, 3),
      title: `Видимые треды: ${t.threads}`,
    },
    {
      key: 'posts',
      label: 'Сообщения',
      value: pad(t.posts, 3),
      title: `Видимые сообщения: ${t.posts}`,
    },
    {
      key: 'day',
      label: '24 часа',
      value: `+${pad(t.last_24h.posts, 3)}`,
      title: `За последние 24 часа: сообщений ${t.last_24h.posts}, тредов ${t.last_24h.threads}`,
    },
    {
      key: 'active',
      label: 'Актив',
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
    <span class="telemetry-rail__lead" aria-hidden="true">Телеметрия</span>
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
  gap: var(--space-3) var(--space-5);
  min-height: 44px;
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--rule);
  border-radius: 0;
  background: var(--paper-raised);
}

.telemetry-rail__lead {
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ink-tertiary);
  margin-right: var(--space-2);
}

.telemetry-rail__cell {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-2);
  white-space: nowrap;
  padding: var(--space-1) var(--space-2);
  border-radius: 0;
  transition: background var(--motion-hover);
}

.telemetry-rail__cell:hover {
  background: var(--paper-sunken);
}

.telemetry-rail__cell + .telemetry-rail__cell {
  border-left: 1px solid var(--rule);
  padding-left: var(--space-5);
}

.telemetry-rail__label {
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 400;
  color: var(--ink-secondary);
}

.telemetry-rail__value {
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--ink);
}

.telemetry-rail__cell--active .telemetry-rail__value {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  color: var(--accent);
}

@media (max-width: 640px) {
  .telemetry-rail {
    font-size: 0.875rem;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-3) var(--space-4);
  }

  .telemetry-rail__cell + .telemetry-rail__cell {
    padding-left: var(--space-3);
  }

  .telemetry-rail__lead {
    width: 100%;
    margin-bottom: var(--space-1);
  }
}
</style>

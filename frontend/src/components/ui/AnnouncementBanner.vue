<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import type { Announcement } from '@/api/announcements'
import { fetchActiveAnnouncements } from '@/api/announcements'

/**
 * Полоса объявлений (ANNOUNCE-01) — строка поверх контента, под шапкой.
 *
 * Объявление публичное и некритичное: пустой ответ и ошибка сети просто
 * не рисуют баннер. Скрытые объявления уходят в sessionStorage, поэтому
 * в пределах сессии один раз закрытое не всплывает снова.
 */

const DISMISSED_KEY = 'bmstud-announcement-dismissed'

const announcements = ref<Announcement[]>([])
const dismissed = ref<number[]>(readDismissed())
const index = ref(0)

onMounted(() => {
  void load()
})

async function load(): Promise<void> {
  try {
    const list = await fetchActiveAnnouncements()
    announcements.value = Array.isArray(list) ? list.filter(sane) : []
  } catch {
    announcements.value = []
  }
}

const visible = computed<Announcement[]>(() =>
  announcements.value.filter((item) => !dismissed.value.includes(item.id)),
)

const active = computed<Announcement | null>(() => {
  if (index.value < 0 || index.value >= visible.value.length) return null
  return visible.value[index.value]
})

function dismiss(): void {
  const current = active.value
  if (!current) return
  dismissed.value = [...dismissed.value, current.id]
  writeDismissed(dismissed.value)
  const left = announcements.value.filter(
    (item) => !dismissed.value.includes(item.id),
  ).length
  if (left > 0 && index.value >= left) index.value = 0
}

function sane(item: Announcement): boolean {
  return (
    !!item &&
    typeof item.id === 'number' &&
    typeof item.text === 'string' &&
    item.text.trim().length > 0
  )
}

function readDismissed(): number[] {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => typeof id === 'number')
      : []
  } catch {
    return []
  }
}

function writeDismissed(ids: number[]): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(ids))
  } catch {
    // приватный режим — тогда просто не запоминаем
  }
}
</script>

<template>
  <div
    v-if="active"
    class="announce"
    role="status"
    aria-live="polite"
    data-testid="announcement-banner"
  >
    <p class="announce__text" data-testid="announcement-text">
      {{ active.text }}
    </p>

    <div v-if="visible.length > 1" class="announce__rail">
      <button
        v-for="(item, i) in visible"
        :key="item.id"
        type="button"
        class="announce__dot"
        :class="{ 'announce__dot--on': i === index }"
        :aria-label="`Объявление ${i + 1} из ${visible.length}`"
        :aria-pressed="i === index ? 'true' : 'false'"
        :data-testid="`announcement-dot-${i}`"
        @click="index = i"
      />
    </div>

    <button
      type="button"
      class="announce__close"
      aria-label="Скрыть объявление"
      data-testid="announcement-dismiss"
      @click="dismiss"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.announce {
  position: relative;
  z-index: var(--z-raised);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 1000px;
  width: 100%;
  margin: var(--space-4) auto 0;
  padding: var(--space-2) var(--space-3);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-left: 2px solid var(--accent);
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-size: 0.75rem;
  letter-spacing: 0.03em;
  color: var(--text-secondary);
  box-shadow: var(--shadow-sm);
}

.announce__text {
  margin: 0;
  flex: 1;
  min-width: 0;
  line-height: 1.5;
  color: var(--text-primary);
}

.announce__rail {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.announce__dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
}

.announce__dot::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid var(--border-medium);
  background: transparent;
  transition:
    background var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart);
}

.announce__dot:hover::before {
  border-color: var(--accent);
}

.announce__dot--on::before {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}

.announce__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  padding: 0;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out-quart);
}

.announce__close:hover {
  color: var(--accent);
}

.announce__dot:focus-visible,
.announce__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

@media (max-width: 640px) {
  .announce {
    font-size: 0.7rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .announce__dot::before,
  .announce__close {
    transition: none;
  }
}
</style>

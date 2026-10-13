<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { TRIPCODE_MAX, useMentions } from '@/composables/useMentions'

/**
 * Маяк ответов (MENTION-01) — компактная строка «ОТВЕТЫ · +N» на главной.
 *
 * Ответы ищутся только по трипкоду `!xxxxxxxx`: аккаунтов нет, значит
 * «мои» посты отличает лишь он. Секрет «Имя#секрет» сюда не вводится и
 * не хранится — устройство знает только коды, за которыми стоит следить.
 *
 * Маяк вспомогательный: загрузка и ошибки сети показывают «—» и
 * скрывают список, но никогда не ломают главную.
 */

const {
  tripcodes,
  unread,
  unreadCount,
  loading,
  failed,
  addTripcode,
  removeTripcode,
  markSeen,
  refresh,
} = useMentions()

const expanded = ref(false)
const draft = ref('')
const rejected = ref(false)

onMounted(() => {
  void refresh()
})

const badge = computed(() => {
  if (loading.value || failed.value) return '—'
  return unreadCount.value > 0 ? `+${pad(unreadCount.value)}` : 'НЕТ ОТВЕТОВ'
})

const badgeTitle = computed(() => {
  if (loading.value) return 'Проверяем ответы на ваши посты'
  if (failed.value) return 'Не удалось получить ответы'
  return unreadCount.value > 0
    ? `Непрочитанных ответов: ${unreadCount.value}`
    : 'Ответов на ваши посты пока нет'
})

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function submit(): void {
  if (!addTripcode(draft.value)) {
    rejected.value = true
    return
  }
  draft.value = ''
  rejected.value = false
  void refresh()
}
</script>

<template>
  <section class="beacon" data-testid="mentions-beacon">
    <button
      type="button"
      class="beacon__toggle"
      :class="{ 'beacon__toggle--unread': unreadCount > 0 }"
      :aria-expanded="expanded ? 'true' : 'false'"
      :aria-label="
        expanded ? 'Свернуть ответы на мои посты' : 'Показать ответы на мои посты'
      "
      data-testid="mentions-toggle"
      @click="expanded = !expanded"
    >
      <span class="beacon__lead" aria-hidden="true">ОТВЕТЫ</span>
      <span
        class="beacon__value"
        :class="{ 'beacon__value--unread': unreadCount > 0 }"
        :title="badgeTitle"
        :aria-label="badgeTitle"
        data-testid="mentions-count"
        >{{ badge }}</span
      >
    </button>

    <div v-if="expanded" class="beacon__panel" data-testid="mentions-panel">
      <p v-if="loading" class="beacon__note" data-testid="mentions-loading">
        сверяем сигналы…
      </p>
      <p v-else-if="failed" class="beacon__note" data-testid="mentions-failed">
        ответы недоступны
      </p>
      <p v-else-if="!unread.length" class="beacon__note" data-testid="mentions-empty">
        НЕТ ОТВЕТОВ
      </p>
      <ul v-else class="beacon__list" data-testid="mentions-list">
        <li v-for="mention in unread" :key="mention.post" class="beacon__item">
          <RouterLink
            class="beacon__link"
            :to="`/threads/${mention.thread}#post-${mention.post}`"
            :data-testid="`mention-item-${mention.post}`"
            @click="markSeen(mention.post)"
          >
            <span class="beacon__title">{{ mention.thread_title }}</span>
            <span class="beacon__snippet">{{ mention.snippet }}</span>
          </RouterLink>
        </li>
      </ul>

      <form class="beacon__manage" @submit.prevent="submit">
        <input
          v-model="draft"
          class="beacon__input"
          type="text"
          :maxlength="TRIPCODE_MAX"
          autocomplete="off"
          spellcheck="false"
          placeholder="!xxxxxxxx"
          aria-label="Трипкод, за которым следить"
          data-testid="mentions-trip-input"
          @input="rejected = false"
        />
        <button type="submit" class="beacon__action" data-testid="mentions-add">
          следить
        </button>
      </form>

      <p
        v-if="rejected"
        class="beacon__warn"
        role="status"
        data-testid="mentions-reject"
      >
        Нужен трипкод вида !xxxxxxxx — секрет не хранится.
      </p>

      <ul v-if="tripcodes.length" class="beacon__trips" data-testid="mentions-trips">
        <li v-for="code in tripcodes" :key="code" class="beacon__trip">
          <span class="beacon__trip-code">{{ code }}</span>
          <button
            type="button"
            class="beacon__remove"
            :aria-label="`Убрать ${code} из списка`"
            :data-testid="`mentions-remove-${code}`"
            @click="removeTripcode(code)"
          >
            убрать
          </button>
        </li>
      </ul>
      <p v-else class="beacon__hint">
        Добавьте трипкод — маяк найдёт ответы на ваши посты.
      </p>
    </div>
  </section>
</template>

<style scoped>
.beacon {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.beacon__toggle {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 44px;
  padding: var(--space-3) var(--space-4);
  background: none;
  border: none;
  border-radius: var(--radius-lg);
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  cursor: pointer;
  text-align: left;
}

.beacon__toggle:hover {
  background: color-mix(in oklab, var(--accent) 6%, transparent);
}

.beacon__lead {
  font-size: 0.62rem;
  letter-spacing: 0.22em;
  color: var(--accent-dim);
  border: 1px solid color-mix(in oklab, var(--accent) 40%, transparent);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  flex-shrink: 0;
}

.beacon__value {
  color: var(--text-muted);
  font-weight: 600;
}

.beacon__value--unread {
  color: var(--accent);
}

/* === Развёрнутый вид === */
.beacon__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0 var(--space-4) var(--space-4);
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-3);
}

.beacon__note,
.beacon__hint,
.beacon__warn {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.beacon__warn {
  color: var(--danger);
}

.beacon__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.beacon__item + .beacon__item {
  border-top: 1px solid var(--border-subtle);
}

.beacon__link {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 44px;
  justify-content: center;
  padding: var(--space-2) var(--space-3);
  text-decoration: none;
  color: inherit;
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
}

.beacon__link:hover {
  background: color-mix(in oklab, var(--accent) 8%, transparent);
}

.beacon__title {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.beacon__snippet {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* === Управление трипкодами === */
.beacon__manage {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.beacon__input {
  flex: 1;
  min-width: 140px;
  min-height: 44px;
  padding: 0 var(--space-2);
  background: color-mix(in oklab, var(--bg-raised) 60%, transparent);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 0.75rem;
  outline: none;
}

.beacon__input::placeholder {
  color: var(--text-muted);
}

.beacon__input:focus-visible,
.beacon__toggle:focus-visible,
.beacon__action:focus-visible,
.beacon__remove:focus-visible,
.beacon__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.beacon__action,
.beacon__remove {
  min-height: 44px;
  padding: 0 var(--space-3);
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-family: var(--font-display);
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  cursor: pointer;
}

.beacon__action:hover,
.beacon__remove:hover {
  color: var(--accent);
  border-color: color-mix(in oklab, var(--accent) 45%, transparent);
}

.beacon__trips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.beacon__trip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding-left: var(--space-2);
}

.beacon__trip-code {
  font-size: 0.68rem;
  color: var(--accent-dim);
}

.beacon__trip .beacon__remove {
  min-height: 32px;
  padding: 0 var(--space-2);
  border: none;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .beacon {
    font-size: 0.66rem;
  }

  .beacon__link {
    padding: var(--space-2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .beacon__toggle,
  .beacon__link,
  .beacon__action,
  .beacon__remove {
    transition: none;
  }
}
</style>

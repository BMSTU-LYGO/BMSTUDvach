<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { TRIPCODE_MAX, useMentions } from '@/composables/useMentions'

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
  return unreadCount.value > 0 ? `+${pad(unreadCount.value)}` : 'Нет ответов'
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
      <span class="beacon__lead">Ответы</span>
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
        Нет ответов
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
  border: 1px solid var(--rule);
  border-radius: 0;
  background: var(--paper-raised);
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
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 400;
  cursor: pointer;
  text-align: left;
  transition: background var(--motion-hover);
}

.beacon__toggle:hover {
  background: var(--paper-sunken);
}

.beacon__lead {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ink-tertiary);
}

.beacon__value {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--ink-secondary);
}

.beacon__value--unread {
  color: var(--accent);
  font-weight: 600;
}

.beacon__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0 var(--space-4) var(--space-4);
  border-top: 1px solid var(--rule);
  padding-top: var(--space-3);
}

.beacon__note,
.beacon__hint,
.beacon__warn {
  margin: 0;
  font-family: var(--font-body);
  font-size: 0.875rem;
  color: var(--ink-secondary);
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
  border: 1px solid var(--rule);
  border-radius: 0;
  overflow: hidden;
}

.beacon__item + .beacon__item {
  border-top: 1px solid var(--rule);
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
  font-family: var(--font-body);
  font-size: 0.875rem;
  transition: background var(--motion-hover);
}

.beacon__link:hover {
  background: var(--paper-sunken);
}

.beacon__title {
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.beacon__snippet {
  color: var(--ink-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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
  background: var(--paper-raised);
  border: 1px solid var(--rule);
  border-radius: 0;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.875rem;
  outline: none;
  transition: border-color var(--motion-hover);
}

.beacon__input::placeholder {
  color: var(--ink-tertiary);
}

.beacon__input:focus-visible {
  border-bottom: 2px solid var(--accent);
}

.beacon__toggle:focus-visible,
.beacon__action:focus-visible,
.beacon__remove:focus-visible,
.beacon__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.beacon__action,
.beacon__remove {
  min-height: 44px;
  padding: 0 var(--space-3);
  background: none;
  border: 1px solid var(--rule);
  border-radius: 0;
  color: var(--ink-secondary);
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--motion-hover),
    border-color var(--motion-hover);
}

.beacon__action:hover,
.beacon__remove:hover {
  background: var(--paper-sunken);
  border-color: var(--ink-tertiary);
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
  border: 1px solid var(--rule);
  padding-left: var(--space-2);
}

.beacon__trip-code {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--accent);
}

.beacon__trip .beacon__remove {
  min-height: 32px;
  padding: 0 var(--space-2);
  border: none;
  color: var(--ink-tertiary);
}

@media (max-width: 640px) {
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

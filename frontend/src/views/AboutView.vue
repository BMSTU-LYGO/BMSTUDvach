<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import DepthCard from '@/components/ui/DepthCard.vue'
import {
  collectLocalDataKeys,
  downloadLocalData,
  resetLocalData,
} from '@/composables/useLocalData'

const storedKeys = ref<string[]>(collectLocalDataKeys())
const confirmingReset = ref(false)
const resetNotice = ref('')

const CONFIRM_MS = 4000
let confirmTimer: number | null = null

function clearTimer() {
  if (confirmTimer !== null) {
    window.clearTimeout(confirmTimer)
    confirmTimer = null
  }
}

function resetConfirmState() {
  clearTimer()
  confirmingReset.value = false
}

function armConfirm() {
  clearTimer()
  confirmingReset.value = true
  confirmTimer = window.setTimeout(resetConfirmState, CONFIRM_MS)
}

function onDownload() {
  resetConfirmState()
  downloadLocalData()
  storedKeys.value = collectLocalDataKeys()
}

function onReset() {
  if (!confirmingReset.value) {
    armConfirm()
    return
  }
  const removed = resetLocalData()
  resetConfirmState()
  storedKeys.value = []
  resetNotice.value = `Удалено ключей: ${removed}. Локальные данные стерты с этого устройства.`
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && confirmingReset.value) resetConfirmState()
}

onBeforeUnmount(clearTimer)
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <section class="about-page">
    <h1 class="about-title">О проекте</h1>

    <div class="about-cards">
      <DepthCard :depth="1">
        <div class="about-card-inner">
          <h3>Что это</h3>
          <p>
            BMSTUDvach — анонимный форум МГТУ им. Н. Э. Баумана, собранный как
            инженерная сеть: доски — узлы, треды — каналы, ответы — сигналы.
            Быстрые треды, вложения, жалобы и модерация — без аккаунтов.
          </p>
        </div>
      </DepthCard>

      <DepthCard :depth="1">
        <div class="about-card-inner">
          <h3>Анонимность</h3>
          <p>
            Каждый автор — «Аноним». Личности не хранятся; технический отпечаток
            используется только для защиты от спама и троттлинга. Анонимность —
            не бесконтрольность: жалобы ведут в модерацию.
          </p>
        </div>
      </DepthCard>

      <DepthCard :depth="1">
        <div class="about-card-inner">
          <h3>Платины</h3>
          <p>
            Отдельный архив переработанных историй в тематике вуза: генератор
            хранит исходник и результат раздельно, публикация — после проверки.
            Читается в <RouterLink to="/platinum">/platinum/</RouterLink>.
          </p>
        </div>
      </DepthCard>

      <DepthCard :depth="1">
        <div class="about-card-inner">
          <h3>Стек</h3>
          <p class="about-stack">
            <span class="stack-tag">Django 5.2</span>
            <span class="stack-tag">DRF</span>
            <span class="stack-tag">Vue 3</span>
            <span class="stack-tag">TypeScript</span>
            <span class="stack-tag">PostgreSQL</span>
            <span class="stack-tag">Three.js</span>
            <span class="stack-tag">GSAP</span>
            <span class="stack-tag">Docker</span>
          </p>
        </div>
      </DepthCard>

      <DepthCard :depth="1">
        <div class="about-card-inner">
          <h3>Приватность и данные</h3>
          <p>
            Форум анонимный, поэтому все ваши следы живут только в этом браузере,
            в localStorage. Никакого профиля на сервере нет: удалить их — значит
            удалить с устройства.
          </p>
          <p class="privacy-hint">
            Что хранится: личности и трипкоды (<code>bmstud-identity</code>,
            <code>bmstud-identities</code>), уведомления об упоминаниях
            (<code>bmstud-mentions-seen</code>), отметки «прочитано» в тредах
            (<code>bmstud-thread-seen</code>, <code>bmstud-thread-position</code>),
            список отслеживаемых тредов (<code>bmstudvach-watchlist</code>), режим доски
            и порядок сортировки (<code>board-view-mode</code>,
            <code>board-thread-order</code>), черновики постов
            (<code>draft:*</code>) и настройки интерфейса — звук, скан-линии,
            качество 3D (<code>bmstudvach-sound</code>, <code>bmstudvach-crt</code>,
            <code>bmstudvach-3d</code>).
          </p>
          <p class="privacy-hint">
            Сейчас в хранилище:
            <template v-if="storedKeys.length">
              {{ storedKeys.length }} ключей —
              <span class="privacy-keys">{{ storedKeys.join(', ') }}</span>
            </template>
            <template v-else>пусто, ваших ключей нет.</template>
          </p>

          <div class="privacy-actions">
            <button
              type="button"
              class="privacy-button"
              aria-label="Скачать все локальные данные одним JSON-файлом"
              @click="onDownload"
            >
              Скачать мои данные
            </button>
            <button
              type="button"
              class="privacy-button privacy-button-danger"
              :class="{ 'is-confirming': confirmingReset }"
              :aria-label="
                confirmingReset
                  ? 'Подтвердить стирание локальных данных, повторное нажатие'
                  : 'Стереть все локальные данные этого устройства'
              "
              @click="onReset"
              @keydown.esc="resetConfirmState"
            >
              {{ confirmingReset ? 'Точно стереть?' : 'Стереть локальные данные' }}
            </button>
          </div>

          <p v-if="resetNotice" class="privacy-status" role="status" aria-live="polite">
            {{ resetNotice }}
          </p>
        </div>
      </DepthCard>
    </div>
  </section>
</template>

<style scoped>
.about-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.about-title {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  color: var(--text-primary);
}

.about-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.about-card-inner {
  padding: var(--space-6);
}

.about-card-inner h3 {
  margin-bottom: var(--space-3);
  color: var(--accent);
}

.about-card-inner p {
  color: var(--text-secondary);
  line-height: 1.7;
}

.about-card-inner p a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px dotted color-mix(in oklab, var(--accent) 55%, transparent);
}

.about-card-inner p a:hover {
  color: var(--text-primary);
}

.about-stack {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.stack-tag {
  display: inline-block;
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-display);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-glow);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-sm);
}

.privacy-hint {
  margin-top: var(--space-3);
  font-size: 0.9rem;
  color: var(--text-muted);
  line-height: 1.7;
}

.privacy-hint code {
  font-family: var(--font-display);
  font-size: 0.8em;
  color: var(--accent);
  background: var(--accent-glow);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-1);
  overflow-wrap: anywhere;
}

.privacy-keys {
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.privacy-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.privacy-button {
  min-height: 44px;
  padding: var(--space-2) var(--space-5);
  font-family: var(--font-display);
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-glow);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart);
}

.privacy-button:hover {
  background: var(--accent-glow-strong);
}

.privacy-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.privacy-button-danger {
  color: var(--danger);
  background: color-mix(in oklab, var(--danger) 18%, transparent);
  border-color: color-mix(in oklab, var(--danger) 45%, transparent);
}

.privacy-button-danger:hover {
  color: var(--text-primary);
  background: color-mix(in oklab, var(--danger) 35%, transparent);
}

.privacy-button-danger.is-confirming {
  color: var(--text-primary);
  background: var(--danger);
  border-color: var(--danger);
}

.privacy-status {
  margin-top: var(--space-4);
  font-family: var(--font-display);
  font-size: 0.85rem;
  color: var(--success);
}

@media (prefers-reduced-motion: reduce) {
  .privacy-button {
    transition: none;
  }
}
</style>

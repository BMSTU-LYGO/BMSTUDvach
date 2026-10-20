<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import NetworkIcon from '@/components/composer/NetworkIcon.vue'
import NotFoundState from '@/components/NotFoundState.vue'
import { ApiRequestError, apiErrorMessage } from '@/api/client'
import {
  fetchFingerprintPosts,
  fetchModerationLog,
  fetchReportQueue,
  moderatePost,
  moderateThread,
  pinThread,
  resolveReport,
  staffLogin,
  staffLogout,
  staffMe,
  unpinThread,
  type FingerprintPost,
  type ModerationLogEntry,
  type QueuedReport,
  type ThreadState,
} from '@/api/moderation'

/**
 * STAFF CONSOLE (NEXT-09) — moderation without the Django admin.
 *
 * Session-based staff login; the report queue carries everything needed
 * to act on a complaint: dismiss it, or hide the post and mark the
 * report actioned. Every action lands in the audit journal, and the
 * quick thread/post tools live at the bottom.
 */

const REASON_LABELS: Record<string, string> = {
  spam: 'спам',
  abuse: 'оскорбления',
  illegal: 'нелегал',
  offtopic: 'оффтоп',
  other: 'другое',
}

const ACTION_LABELS: Record<string, string> = {
  hide_post: 'пост скрыт',
  show_post: 'пост показан',
  hide_thread: 'тред скрыт',
  show_thread: 'тред показан',
  lock_thread: 'тред закрыт',
  unlock_thread: 'тред открыт',
  pin_thread: 'тред закреплён',
  unpin_thread: 'тред откреплён',
  report_action: 'жалоба обработана',
  report_dismiss: 'жалоба отклонена',
}

const TARGET_LABELS: Record<string, string> = {
  post: 'пост',
  thread: 'тред',
  report: 'жалоба',
}

/** Severity of a complaint reason — drives the row rail + glow. */
const REASON_LEVELS: Record<string, 'high' | 'mid' | 'low'> = {
  illegal: 'high',
  abuse: 'high',
  spam: 'mid',
  offtopic: 'low',
  other: 'low',
}

/** Severity of a journal action — destructive, restorative or neutral. */
const ACTION_LEVELS: Record<string, 'accent' | 'danger' | 'muted'> = {
  report_action: 'accent',
  report_dismiss: 'muted',
  hide_post: 'danger',
  show_post: 'accent',
  hide_thread: 'danger',
  show_thread: 'accent',
  lock_thread: 'danger',
  unlock_thread: 'accent',
  pin_thread: 'accent',
  unpin_thread: 'muted',
}

const isStaff = ref(false)
const checking = ref(true)
/** Проверка доступа сорвалась (сеть/сервер) — это не «нет сессии». */
const accessFailed = ref(false)
const username = ref('')
const password = ref('')
const loginError = ref('')

const reports = ref<QueuedReport[]>([])
const loading = ref(false)
const busy = ref<number | null>(null)
const consoleError = ref('')

/** Poster-fingerprint drill-down: one report row expanded at a time. */
const fpOpenFor = ref<number | null>(null)
const fpLoading = ref(false)
const fpError = ref('')
const fpFingerprint = ref('')
const fpCount = ref(0)
const fpPosts = ref<FingerprintPost[]>([])

const logEntries = ref<ModerationLogEntry[]>([])
const logLoading = ref(false)
const logError = ref('')

const targetKind = ref<'post' | 'thread'>('post')
const targetId = ref('')

/** Telemetry padding: ids and counters always read as fixed-width digits. */
function pad(value: number): string {
  return String(value).padStart(3, '0')
}

function reasonLevel(reason: string): string {
  return REASON_LEVELS[reason] ?? 'low'
}

function actionLevel(action: string): string {
  return ACTION_LEVELS[action] ?? 'muted'
}

/** 401/403 — это не сбой, а «сессии нет»: гейт всё равно нужно показать. */
function isAuthError(err: unknown): boolean {
  return err instanceof ApiRequestError && (err.status === 401 || err.status === 403)
}

async function check() {
  checking.value = true
  accessFailed.value = false
  try {
    const me = await staffMe()
    isStaff.value = me.is_staff
    if (me.is_staff) {
      await Promise.all([loadQueue(), loadLog()])
    }
  } catch (err) {
    isStaff.value = false
    accessFailed.value = !isAuthError(err)
  } finally {
    checking.value = false
  }
}

async function loadQueue() {
  loading.value = true
  consoleError.value = ''
  try {
    const data = await fetchReportQueue()
    reports.value = data.reports
  } catch (err) {
    consoleError.value = apiErrorMessage(err, 'Очередь жалоб недоступна.')
  } finally {
    loading.value = false
  }
}

/** Audit journal: the last staff actions, newest first. */
async function loadLog() {
  logLoading.value = true
  logError.value = ''
  try {
    const entries = await fetchModerationLog()
    logEntries.value = entries ?? []
  } catch (err) {
    logError.value = apiErrorMessage(err, 'Журнал действий недоступен.')
  } finally {
    logLoading.value = false
  }
}

function logTarget(entry: ModerationLogEntry): string {
  const kind = TARGET_LABELS[entry.target_type] ?? entry.target_type
  return `${kind} #${entry.target_id}`
}

async function onLogin() {
  loginError.value = ''
  accessFailed.value = false
  try {
    await staffLogin(username.value, password.value)
    isStaff.value = true
    password.value = ''
    await Promise.all([loadQueue(), loadLog()])
  } catch (err) {
    loginError.value = apiErrorMessage(err, 'Не удалось войти.')
  }
}

async function onLogout() {
  try {
    await staffLogout()
  } catch {
    // even if the round-trip fails, drop the console locally
  }
  isStaff.value = false
  reports.value = []
  logEntries.value = []
}

async function act(report: QueuedReport, action: 'dismiss' | 'action') {
  busy.value = report.id
  consoleError.value = ''
  try {
    await resolveReport(report.id, action)
    reports.value = reports.value.filter((r) => r.id !== report.id)
    await loadLog()
  } catch (err) {
    consoleError.value = apiErrorMessage(err, 'Не удалось применить действие.')
  } finally {
    busy.value = null
  }
}

/** Toggle the inline list of every post left with a report's fingerprint. */
async function toggleFingerprint(report: QueuedReport) {
  if (fpOpenFor.value === report.id) {
    fpOpenFor.value = null
    return
  }
  const fingerprint = report.post.poster_fingerprint
  fpOpenFor.value = report.id
  fpLoading.value = true
  fpError.value = ''
  fpFingerprint.value = fingerprint
  fpCount.value = 0
  fpPosts.value = []
  try {
    const data = await fetchFingerprintPosts(fingerprint)
    if (fpOpenFor.value !== report.id) return
    fpFingerprint.value = data.fingerprint
    fpCount.value = data.count
    fpPosts.value = data.posts
  } catch (err) {
    if (fpOpenFor.value === report.id) {
      fpError.value = apiErrorMessage(err, 'Посты по отпечатку недоступны.')
    }
  } finally {
    if (fpOpenFor.value === report.id) fpLoading.value = false
  }
}

const toolStatus = ref('')
const targetPinned = ref(false)

function currentTargetId(): number | null {
  const id = Number(targetId.value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

async function runTool(action: 'hide' | 'show' | 'lock' | 'unlock') {
  toolStatus.value = ''
  const id = currentTargetId()
  if (id === null) {
    toolStatus.value = 'нужен числовой id'
    return
  }
  try {
    if (targetKind.value === 'post') {
      await moderatePost(id, action === 'lock' || action === 'unlock' ? 'hide' : action)
      toolStatus.value = `пост #${id}: ${action === 'hide' ? 'скрыт' : 'показан'}`
    } else {
      await moderateThread(id, action)
      toolStatus.value = `тред #${id}: ${action}`
    }
    await loadLog()
  } catch (err) {
    toolStatus.value = apiErrorMessage(err, 'действие не удалось')
  }
}

async function togglePin() {
  toolStatus.value = ''
  const id = currentTargetId()
  if (id === null) {
    toolStatus.value = 'нужен числовой id'
    return
  }
  try {
    const state: ThreadState = targetPinned.value
      ? await unpinThread(id)
      : await pinThread(id)
    targetPinned.value = state.is_pinned
    toolStatus.value = `тред #${id}: ${state.is_pinned ? 'закреплён' : 'откреплён'}`
    await loadLog()
  } catch (err) {
    toolStatus.value = apiErrorMessage(err, 'действие не удалось')
  }
}

const emptyQueue = computed(() => !loading.value && reports.value.length === 0)

onMounted(check)
</script>

<template>
  <section
    class="console"
    :class="{ 'console--locked': !isStaff && !checking }"
    data-testid="moderation-console"
  >
    <header class="console__head">
      <span class="console__kicker">// moderation console</span>
      <h1 class="console__title">МОДЕРАЦИЯ</h1>
      <p v-if="isStaff" class="console__who">
        <span class="console__dot" aria-hidden="true"></span>
        сессия: {{ username || 'staff' }}
      </p>
      <p v-else class="console__who console__who--locked">
        <span class="console__dot" aria-hidden="true"></span>
        сессия: нет доступа
      </p>
    </header>

    <div v-if="checking" class="console__state">проверка доступа…</div>

    <!-- доступ закрыт: проверка сорвалась — вежливо, без «красной стены» -->
    <NotFoundState
      v-else-if="accessFailed"
      variant="sealed"
      title="ACCESS SEALED"
      message="Проверка доступа не прошла: консоль осталась закрытой."
      action-label="проверить снова"
      :on-action="check"
    />

    <!-- staff gate -->
    <form
      v-else-if="!isStaff"
      class="login"
      data-testid="staff-login"
      @submit.prevent="onLogin"
    >
      <span class="login__kicker">// staff gate</span>
      <p class="login__hint">
        Вход для персонала. Учётные данные проверяются против Staff-флага.
      </p>
      <label class="login__field">
        <span class="login__label">ЛОГИН</span>
        <input v-model="username" type="text" autocomplete="username" required />
      </label>
      <label class="login__field">
        <span class="login__label">ПАРОЛЬ</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </label>
      <p v-if="loginError" class="login__error" role="alert">{{ loginError }}</p>
      <button type="submit" class="login__submit">ВОЙТИ</button>
    </form>

    <template v-else>
      <!-- report queue -->
      <section class="panel queue" aria-labelledby="queue-title">
        <div class="queue__head">
          <h2 id="queue-title" class="queue__title">ОЧЕРЕДЬ ЖАЛОБ</h2>
          <span class="panel__count">В ОЧЕРЕДИ: {{ pad(reports.length) }}</span>
          <div class="queue__controls">
            <button type="button" class="queue__refresh" @click="loadQueue">
              обновить
            </button>
            <button type="button" class="queue__logout" @click="onLogout">выйти</button>
          </div>
        </div>

        <p v-if="consoleError" class="queue__error" role="alert">{{ consoleError }}</p>
        <div v-else-if="loading" class="console__state">загрузка очереди…</div>
        <p v-else-if="emptyQueue" class="queue__empty" data-testid="queue-empty">
          очередь пуста — сеть чиста
        </p>

        <article
          v-for="report in reports"
          :key="report.id"
          class="report"
          :class="[
            `report--${reasonLevel(report.reason)}`,
            { 'report--busy': busy === report.id },
          ]"
          :data-testid="'report-row'"
        >
          <div class="report__meta">
            <span class="report__id">#{{ pad(report.id) }}</span>
            <time class="report__time" :datetime="report.created_at">
              {{ new Date(report.created_at).toLocaleString('ru-RU') }}
            </time>
          </div>

          <div class="report__main">
            <header class="report__head">
              <span class="report__reason">{{
                REASON_LABELS[report.reason] ?? report.reason
              }}</span>
              <span class="report__target">пост #{{ report.post.id }}</span>
              <span class="report__thread">/{{ report.post.thread }}/</span>
            </header>

            <p class="report__snippet">{{ report.post.body }}</p>
            <p v-if="report.comment" class="report__comment">«{{ report.comment }}»</p>
            <p v-if="report.post.is_hidden" class="report__hidden">пост уже скрыт</p>
          </div>

          <footer class="report__actions">
            <button
              type="button"
              class="report__btn report__btn--danger"
              :disabled="busy === report.id"
              @click="act(report, 'action')"
            >
              скрыть пост + меры
            </button>
            <button
              type="button"
              class="report__btn"
              :disabled="busy === report.id"
              @click="act(report, 'dismiss')"
            >
              отклонить
            </button>
            <button
              type="button"
              class="report__btn report__btn--fingerprint"
              data-testid="fingerprint-toggle"
              :aria-expanded="fpOpenFor === report.id"
              :aria-controls="`fingerprint-panel-${report.id}`"
              @click="toggleFingerprint(report)"
            >
              Посты автора
            </button>
            <a
              class="report__link"
              :href="`/threads/${report.post.thread}#post-${report.post.id}`"
              target="_blank"
              rel="noopener noreferrer"
            >
              открыть в треде ↗
            </a>
          </footer>

          <div
            v-if="fpOpenFor === report.id"
            :id="`fingerprint-panel-${report.id}`"
            class="fingerprint"
            data-testid="fingerprint-panel"
          >
            <p class="fingerprint__bar">
              <span class="fingerprint__label">отпечаток</span>
              <code class="fingerprint__hash">{{ fpFingerprint }}</code>
              <span class="fingerprint__count">постов: {{ pad(fpCount) }}</span>
            </p>
            <p v-if="fpLoading" class="fingerprint__state">загрузка постов…</p>
            <p v-else-if="fpError" class="fingerprint__error" role="alert">
              {{ fpError }}
            </p>
            <p
              v-else-if="!fpPosts.length"
              class="fingerprint__empty"
              data-testid="fingerprint-empty"
            >
              у этого отпечатка больше нет постов
            </p>
            <ul v-else class="fingerprint__list">
              <li
                v-for="item in fpPosts"
                :key="item.id"
                class="fingerprint__post"
                data-testid="fingerprint-post"
              >
                <div class="fingerprint__meta">
                  <span class="fingerprint__id">#{{ pad(item.id) }}</span>
                  <span class="fingerprint__thread">{{ item.thread_title }}</span>
                  <span
                    v-if="item.is_hidden"
                    class="fingerprint__flag fingerprint__flag--hidden"
                  >
                    скрыт
                  </span>
                  <span v-if="item.sage" class="fingerprint__flag">sage</span>
                  <time class="fingerprint__time" :datetime="item.created_at">
                    {{ new Date(item.created_at).toLocaleString('ru-RU') }}
                  </time>
                </div>
                <p class="fingerprint__body">{{ item.body }}</p>
              </li>
            </ul>
          </div>
        </article>
      </section>

      <!-- audit journal -->
      <section class="panel journal" aria-labelledby="journal-title">
        <div class="journal__head">
          <h2 id="journal-title" class="journal__title">ЖУРНАЛ</h2>
          <span class="panel__count">ЗАПИСЕЙ: {{ pad(logEntries.length) }}</span>
          <button
            type="button"
            class="journal__refresh"
            data-testid="log-refresh"
            @click="loadLog"
          >
            обновить
          </button>
        </div>

        <p v-if="logError" class="journal__error" role="alert">{{ logError }}</p>
        <div v-else-if="logLoading" class="console__state">загрузка журнала…</div>
        <p
          v-else-if="!logEntries.length"
          class="journal__empty"
          data-testid="log-empty"
        >
          действий пока не было
        </p>

        <ol
          v-else
          class="journal__list"
          role="log"
          aria-label="Журнал действий модерации"
          data-testid="moderation-log"
        >
          <li
            v-for="entry in logEntries"
            :key="entry.id"
            class="journal__row"
            :class="`journal__row--${actionLevel(entry.action)}`"
          >
            <span class="journal__actor">{{ entry.actor }}</span>
            <span class="journal__action">
              {{ ACTION_LABELS[entry.action] ?? entry.action }}
            </span>
            <span class="journal__target">{{ logTarget(entry) }}</span>
            <time class="journal__time" :datetime="entry.created_at">
              {{ new Date(entry.created_at).toLocaleString('ru-RU') }}
            </time>
          </li>
        </ol>
      </section>

      <!-- quick tools -->
      <section class="tools" aria-labelledby="tools-title">
        <h2 id="tools-title" class="tools__title">БЫСТРЫЕ ДЕЙСТВИЯ</h2>
        <div class="tools__row">
          <div class="tools__switch" role="group" aria-label="Тип цели">
            <button
              type="button"
              :class="{ 'tools__seg--active': targetKind === 'post' }"
              :aria-pressed="targetKind === 'post'"
              @click="targetKind = 'post'"
            >
              пост
            </button>
            <button
              type="button"
              :class="{ 'tools__seg--active': targetKind === 'thread' }"
              :aria-pressed="targetKind === 'thread'"
              @click="targetKind = 'thread'"
            >
              тред
            </button>
          </div>
          <input
            v-model="targetId"
            type="number"
            min="1"
            placeholder="id"
            class="tools__id"
          />
          <button type="button" class="tools__btn" @click="runTool('hide')">
            скрыть
          </button>
          <button type="button" class="tools__btn" @click="runTool('show')">
            показать
          </button>
          <button
            v-if="targetKind === 'thread'"
            type="button"
            class="tools__btn"
            @click="runTool('lock')"
          >
            закрыть
          </button>
          <button
            v-if="targetKind === 'thread'"
            type="button"
            class="tools__btn"
            @click="runTool('unlock')"
          >
            открыть
          </button>
          <button
            v-if="targetKind === 'thread'"
            type="button"
            class="tools__btn tools__btn--pin"
            data-testid="pin-toggle"
            :aria-pressed="targetPinned"
            @click="togglePin"
          >
            <NetworkIcon name="pin" :size="12" />
            {{ targetPinned ? 'Открепить' : 'Закрепить' }}
          </button>
          <span v-if="toolStatus" class="tools__status">{{ toolStatus }}</span>
        </div>
        <p class="tools__hint">
          <NetworkIcon name="warning" :size="12" /> действия применяются сразу и видны
          всем
        </p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.console {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* === frame: head === */
.console__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

/* === Знак консоли: красный живёт только у staff-сессии ===
   Закрытая консоль — не красная стена: знак и точка сессии гаснут. */
.console__kicker {
  font-family: var(--font-display);
  font-size: 0.66rem;
  letter-spacing: 0.2em;
  color: var(--danger);
}

.console--locked .console__kicker {
  color: var(--ink-tertiary);
}

.console__title {
  margin: 0;
  font-size: clamp(1.4rem, 3vw, 2rem);
  letter-spacing: 0.04em;
}

.console__who {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.console__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
}

/* Сессии нет — это не тревога, а факт: точка просто гаснет. */
.console__who--locked .console__dot {
  background: var(--ink-tertiary);
}

.console__state {
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

/* === sections: hairline-ruled panels with uppercase captions === */
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.panel__count {
  font-family: var(--font-display);
  font-size: 0.6rem;
  letter-spacing: 0.14em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.queue__title,
.journal__title,
.tools__title {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  color: var(--text-secondary);
}

.queue__title::before,
.journal__title::before,
.tools__title::before {
  content: '';
  width: 6px;
  height: 6px;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow-strong);
}

/* === staff gate === */
.login {
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}

.login__kicker {
  font-family: var(--font-display);
  font-size: 0.62rem;
  letter-spacing: 0.2em;
  color: var(--danger);
}

.login__hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.login__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.login__label {
  font-family: var(--font-display);
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  color: var(--text-muted);
}

.login__field input {
  background: var(--bg-deep);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 0.85rem;
  min-height: 44px;
  padding: 0 var(--space-3);
  /* фокус — единственная реакция поля: кромка и мягкий ореол */
  transition:
    border-color var(--motion-hover),
    box-shadow var(--motion-hover);
}

.login__field input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.login__error {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.74rem;
  color: var(--danger);
}

.login__submit {
  min-height: 44px;
  padding: 0 var(--space-4);
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  color: oklch(0.12 0.02 260);
  font-family: var(--font-display);
  font-size: 0.74rem;
  letter-spacing: 0.16em;
  cursor: pointer;
  transition:
    background-color var(--motion-hover),
    box-shadow var(--motion-hover);
}

.login__submit:hover {
  box-shadow: 0 0 16px var(--accent-glow-strong);
}

/* === queue === */
.queue__head,
.journal__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border-subtle);
}

.queue__controls {
  margin-left: auto;
  display: inline-flex;
  gap: var(--space-2);
}

.queue__refresh,
.queue__logout {
  min-height: 32px;
  padding: 0 var(--space-3);
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  /* тихая реакция: цвет и кромка */
  transition:
    color var(--motion-hover),
    border-color var(--motion-hover);
}

.queue__refresh:hover,
.queue__logout:hover {
  color: var(--accent);
  border-color: var(--border-accent);
}

.queue__error {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.74rem;
  color: var(--danger);
}

.queue__empty {
  margin: 0;
  font-size: 0.84rem;
  color: var(--text-muted);
}

/* dense telemetry rows: meta | payload | actions, split by hairlines */
.report {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: start;
  padding: var(--space-3) var(--space-4);
  border-left: 2px solid var(--border-medium);
  border-top: 1px solid var(--border-subtle);
  /* Длинная очередь: только тихая реакция наведения — подложка.
     Никаких трансформаций по строкам. */
  transition: background-color var(--motion-hover);
}

.report:first-of-type {
  border-top: none;
}

.report:last-of-type {
  border-bottom: 1px solid var(--border-subtle);
}

.report:nth-of-type(even) {
  background: color-mix(in oklab, var(--text-primary) 3%, transparent);
}

.report:hover {
  background: var(--bg-raised);
}

.report--high {
  border-left-color: var(--danger);
}

.report--mid {
  border-left-color: var(--accent);
}

.report--low {
  border-left-color: var(--border-medium);
}

.report--busy {
  opacity: 0.55;
}

.report__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: var(--space-3);
  border-right: 1px dashed var(--border-subtle);
  font-family: var(--font-display);
  font-size: 0.6rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.report__id {
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}

.report__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.report__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.report__reason {
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  color: var(--danger);
}

.report__target {
  font-family: var(--font-display);
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.report__thread,
.report__time {
  font-family: var(--font-display);
  font-size: 0.64rem;
  color: var(--text-muted);
}

.report__time {
  margin-left: auto;
}

.report__snippet {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--text-primary);
}

.report__comment {
  margin: 0;
  font-size: 0.8rem;
  font-style: italic;
  color: var(--text-secondary);
}

.report__hidden {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.64rem;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.report__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-self: center;
}

.report__btn {
  min-height: 36px;
  padding: 0 var(--space-3);
  background: none;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 0.74rem;
  cursor: pointer;
  /* тихая реакция: цвет и кромка */
  transition:
    color var(--motion-hover),
    border-color var(--motion-hover);
}

.report__btn:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--accent);
}

.report__btn--danger:hover:not(:disabled) {
  color: var(--danger);
  border-color: var(--danger-dim);
}

.report__btn:disabled {
  opacity: 0.5;
  cursor: progress;
}

.report__link {
  font-size: 0.74rem;
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px dotted color-mix(in oklab, var(--accent) 55%, transparent);
}

.report__btn--fingerprint {
  min-height: 44px;
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  color: var(--accent);
  border-color: var(--border-accent);
}

.report__btn--fingerprint:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--accent);
}

/* === fingerprint drill-down: full-width panel under a report row === */
.fingerprint {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-left: 2px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--bg-deep);
}

.fingerprint__bar {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 0;
}

.fingerprint__label {
  font-family: var(--font-display);
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.fingerprint__hash {
  font-family: var(--font-display);
  font-size: 0.66rem;
  color: var(--text-secondary);
  word-break: break-all;
}

.fingerprint__count {
  margin-left: auto;
  font-family: var(--font-display);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.fingerprint__state,
.fingerprint__empty {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.fingerprint__error {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.74rem;
  color: var(--danger);
}

.fingerprint__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  max-height: 300px;
  overflow-y: auto;
}

.fingerprint__post {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-2);
  border-bottom: 1px dashed var(--border-subtle);
}

.fingerprint__post:last-child {
  border-bottom: none;
}

.fingerprint__meta {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-variant-numeric: tabular-nums;
}

.fingerprint__id {
  color: var(--accent-dim);
}

.fingerprint__thread {
  color: var(--text-secondary);
}

.fingerprint__flag {
  padding: 1px 6px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  font-size: 0.56rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.fingerprint__flag--hidden {
  color: var(--danger);
  border-color: var(--danger-dim);
}

.fingerprint__time {
  margin-left: auto;
  color: var(--text-muted);
  white-space: nowrap;
}

.fingerprint__body {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--text-primary);
}

/* === journal === */
.journal__refresh {
  margin-left: auto;
  min-height: 32px;
  padding: 0 var(--space-3);
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition:
    color var(--motion-hover),
    border-color var(--motion-hover);
}

.journal__refresh:hover {
  color: var(--accent);
  border-color: var(--border-accent);
}

.journal__error {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.74rem;
  color: var(--danger);
}

.journal__empty {
  margin: 0;
  font-size: 0.84rem;
  color: var(--text-muted);
}

.journal__list {
  list-style: none;
  margin: 0;
  padding: var(--space-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  max-height: 340px;
  overflow-y: auto;
}

.journal__row {
  display: grid;
  grid-template-columns: minmax(88px, auto) minmax(0, 1.1fr) minmax(0, 0.9fr) auto;
  gap: var(--space-3);
  align-items: baseline;
  padding: 6px var(--space-3);
  font-family: var(--font-display);
  font-size: 0.68rem;
  line-height: 1.6;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  border-left: 2px solid transparent;
  border-bottom: 1px dashed var(--border-subtle);
  /* журнал — длинный список: только подложка при наведении */
  transition: background-color var(--motion-hover);
}

.journal__row:last-child {
  border-bottom: none;
}

.journal__row:hover {
  background: var(--bg-raised);
}

.journal__row--accent {
  border-left-color: var(--accent);
}

.journal__row--danger {
  border-left-color: var(--danger);
}

.journal__row--muted {
  border-left-color: var(--border-medium);
}

.journal__actor {
  color: var(--accent);
}

.journal__action {
  color: var(--text-secondary);
}

.journal__target {
  color: var(--text-muted);
}

.journal__time {
  margin-left: auto;
  color: var(--text-muted);
  white-space: nowrap;
}

/* === quick tools === */
.tools {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}

.tools__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tools__switch {
  display: inline-flex;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.tools__switch button {
  min-height: 44px;
  padding: 0 var(--space-3);
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition:
    color var(--motion-hover),
    background-color var(--motion-hover);
}

.tools__seg--active {
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 12%, transparent);
}

.tools__id {
  width: 96px;
  min-height: 44px;
  padding: 0 var(--space-2);
  background: var(--bg-deep);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 0.8rem;
  outline: none;
  font-variant-numeric: tabular-nums;
  transition:
    border-color var(--motion-hover),
    box-shadow var(--motion-hover);
}

.tools__id:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.tools__btn {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 var(--space-3);
  background: none;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-family: var(--font-display);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition:
    color var(--motion-hover),
    border-color var(--motion-hover);
}

.tools__btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.tools__btn--pin {
  color: var(--accent);
  border-color: var(--border-accent);
}

.tools__status {
  font-family: var(--font-display);
  font-size: 0.7rem;
  color: var(--accent-dim);
  font-variant-numeric: tabular-nums;
}

.tools__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 0.72rem;
  color: var(--text-muted);
}

/* === responsive: rows fold into stacked cards === */
@media (max-width: 720px) {
  .report {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
  }

  .report__meta {
    flex-direction: row;
    align-items: baseline;
    gap: var(--space-3);
    padding-right: 0;
    border-right: none;
  }

  .report__actions {
    align-self: stretch;
  }
}

@media (max-width: 560px) {
  .journal__row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .journal__time {
    margin-left: 0;
  }

  .console__who {
    margin-left: 0;
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .report,
  .journal__row,
  .login__field input,
  .login__submit,
  .queue__refresh,
  .queue__logout,
  .journal__refresh,
  .tools__switch button,
  .tools__id,
  .tools__btn {
    transition: none;
  }
}
</style>

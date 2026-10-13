<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import NetworkIcon from '@/components/composer/NetworkIcon.vue'
import { apiErrorMessage } from '@/api/client'
import {
  fetchReportQueue,
  moderatePost,
  moderateThread,
  pinThread,
  resolveReport,
  staffLogin,
  staffLogout,
  staffMe,
  unpinThread,
  type QueuedReport,
  type ThreadState,
} from '@/api/moderation'

/**
 * STAFF CONSOLE (NEXT-09) — moderation without the Django admin.
 *
 * Session-based staff login; the report queue carries everything needed
 * to act on a complaint: dismiss it, or hide the post and mark the
 * report actioned. Quick thread/post tools live at the bottom.
 */

const REASON_LABELS: Record<string, string> = {
  spam: 'спам',
  abuse: 'оскорбления',
  illegal: 'нелегал',
  offtopic: 'оффтоп',
  other: 'другое',
}

const isStaff = ref(false)
const checking = ref(true)
const username = ref('')
const password = ref('')
const loginError = ref('')

const reports = ref<QueuedReport[]>([])
const loading = ref(false)
const busy = ref<number | null>(null)
const consoleError = ref('')

const targetKind = ref<'post' | 'thread'>('post')
const targetId = ref('')

async function check() {
  checking.value = true
  try {
    const me = await staffMe()
    isStaff.value = me.is_staff
    if (me.is_staff) await loadQueue()
  } catch {
    isStaff.value = false
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

async function onLogin() {
  loginError.value = ''
  try {
    await staffLogin(username.value, password.value)
    isStaff.value = true
    password.value = ''
    await loadQueue()
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
}

async function act(report: QueuedReport, action: 'dismiss' | 'action') {
  busy.value = report.id
  consoleError.value = ''
  try {
    await resolveReport(report.id, action)
    reports.value = reports.value.filter((r) => r.id !== report.id)
  } catch (err) {
    consoleError.value = apiErrorMessage(err, 'Не удалось применить действие.')
  } finally {
    busy.value = null
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
  } catch (err) {
    toolStatus.value = apiErrorMessage(err, 'действие не удалось')
  }
}

const emptyQueue = computed(() => !loading.value && reports.value.length === 0)

onMounted(check)
</script>

<template>
  <section class="console" data-testid="moderation-console">
    <header class="console__head">
      <span class="console__kicker">// moderation console</span>
      <h1 class="console__title">ЖУРНАЛ МОДЕРАЦИИ</h1>
      <p v-if="isStaff" class="console__who">сессия: {{ username || 'staff' }}</p>
    </header>

    <div v-if="checking" class="console__state">проверка доступа…</div>

    <!-- staff gate -->
    <form v-else-if="!isStaff" class="login" data-testid="staff-login" @submit.prevent="onLogin">
      <p class="login__hint">Вход для персонала. Учётные данные проверяются против Staff-флага.</p>
      <label class="login__field">
        <span class="login__label">ЛОГИН</span>
        <input v-model="username" type="text" autocomplete="username" required />
      </label>
      <label class="login__field">
        <span class="login__label">ПАРОЛЬ</span>
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="loginError" class="login__error" role="alert">{{ loginError }}</p>
      <button type="submit" class="login__submit">ВОЙТИ</button>
    </form>

    <template v-else>
      <div class="queue">
        <div class="queue__head">
          <h2 class="queue__title">ОЧЕРЕДЬ ЖАЛОБ</h2>
          <button type="button" class="queue__refresh" @click="loadQueue">обновить</button>
          <button type="button" class="queue__logout" @click="onLogout">выйти</button>
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
          :data-testid="'report-row'"
        >
          <header class="report__head">
            <span class="report__reason">{{ REASON_LABELS[report.reason] ?? report.reason }}</span>
            <span class="report__target">пост #{{ report.post.id }}</span>
            <span class="report__thread">/{{ report.post.thread }}/</span>
            <time class="report__time">
              {{ new Date(report.created_at).toLocaleString('ru-RU') }}
            </time>
          </header>

          <p class="report__snippet">{{ report.post.body }}</p>
          <p v-if="report.comment" class="report__comment">«{{ report.comment }}»</p>
          <p v-if="report.post.is_hidden" class="report__hidden">пост уже скрыт</p>

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
            <a
              class="report__link"
              :href="`/threads/${report.post.thread}#post-${report.post.id}`"
              target="_blank"
              rel="noopener noreferrer"
            >
              открыть в треде ↗
            </a>
          </footer>
        </article>
      </div>

      <!-- quick tools -->
      <div class="tools">
        <h2 class="tools__title">БЫСТРЫЕ ДЕЙСТВИЯ</h2>
        <div class="tools__row">
          <div class="tools__switch" role="group" aria-label="Тип цели">
            <button
              type="button"
              :class="{ 'tools__seg--active': targetKind === 'post' }"
              @click="targetKind = 'post'"
            >
              пост
            </button>
            <button
              type="button"
              :class="{ 'tools__seg--active': targetKind === 'thread' }"
              @click="targetKind = 'thread'"
            >
              тред
            </button>
          </div>
          <input v-model="targetId" type="number" min="1" placeholder="id" class="tools__id" />
          <button type="button" class="tools__btn" @click="runTool('hide')">скрыть</button>
          <button type="button" class="tools__btn" @click="runTool('show')">показать</button>
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
          <NetworkIcon name="warning" :size="12" /> действия применяются сразу и видны всем
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.console {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.console__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.console__kicker {
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  color: var(--danger);
}

.console__title {
  margin: 0;
  font-size: clamp(1.4rem, 3vw, 2rem);
}

.console__who {
  margin-left: auto;
  font-family: var(--font-display);
  font-size: 0.72rem;
  color: var(--text-muted);
}

.console__state {
  font-size: 0.88rem;
  color: var(--text-muted);
}

/* staff gate */
.login {
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
}

.login__hint {
  margin: 0;
  font-size: 0.82rem;
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
  letter-spacing: 0.16em;
  color: var(--text-muted);
}

.login__field input {
  background: none;
  border: none;
  border-bottom: 1px solid var(--border-medium);
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 0.95rem;
  min-height: 36px;
  transition: border-color 200ms;
}

.login__field input:focus {
  border-bottom-color: var(--accent);
}

.login__error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--danger);
}

.login__submit {
  min-height: 44px;
  background: none;
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  color: var(--accent);
  font-family: var(--font-display);
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: background 160ms;
}

.login__submit:hover {
  background: color-mix(in oklab, var(--accent) 10%, transparent);
}

/* queue */
.queue {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.queue__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.queue__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  color: var(--text-muted);
}

.queue__refresh,
.queue__logout {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  padding: 4px;
}

.queue__refresh:hover,
.queue__logout:hover {
  color: var(--accent);
}

.queue__error {
  margin: 0;
  font-size: 0.84rem;
  color: var(--danger);
}

.queue__empty {
  margin: 0;
  font-size: 0.88rem;
  color: var(--text-muted);
}

.report {
  padding: var(--space-4);
  border: 1px solid var(--border-subtle);
  border-left: 2px solid var(--danger-dim);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.report__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.report__reason {
  font-family: var(--font-display);
  font-size: 0.74rem;
  color: var(--danger);
}

.report__target {
  font-family: var(--font-display);
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.report__thread,
.report__time {
  font-family: var(--font-display);
  font-size: 0.66rem;
  color: var(--text-muted);
}

.report__time {
  margin-left: auto;
}

.report__snippet {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--text-primary);
}

.report__comment {
  margin: 0;
  font-size: 0.82rem;
  font-style: italic;
  color: var(--text-secondary);
}

.report__hidden {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.66rem;
  color: var(--text-muted);
}

.report__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-1);
}

.report__btn {
  min-height: 34px;
  padding: 0 var(--space-3);
  background: none;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 0.76rem;
  cursor: pointer;
  transition: color 160ms, border-color 160ms;
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
  font-size: 0.76rem;
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px dotted color-mix(in oklab, var(--accent) 55%, transparent);
}

/* quick tools */
.tools {
  padding: var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
}

.tools__title {
  margin: 0 0 var(--space-3);
  font-family: var(--font-display);
  font-size: 0.66rem;
  letter-spacing: 0.18em;
  color: var(--text-muted);
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
  font-size: 0.76rem;
  cursor: pointer;
}

.tools__seg--active {
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 10%, transparent);
}

.tools__id {
  width: 90px;
  min-height: 44px;
  padding: 0 var(--space-2);
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-display);
  outline: none;
}

.tools__id:focus {
  border-color: var(--accent);
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
  font-size: 0.76rem;
  cursor: pointer;
}

.tools__btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.tools__btn--pin {
  color: var(--accent);
  border-color: var(--border-accent);
}

.tools__btn--pin:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.tools__status {
  font-family: var(--font-display);
  font-size: 0.7rem;
  color: var(--accent-dim);
}

.tools__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: var(--space-3) 0 0;
  font-size: 0.72rem;
  color: var(--text-muted);
}
</style>

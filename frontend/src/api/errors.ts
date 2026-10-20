import type { ApiRequestError } from '@/api/client'

/**
 * Таксономия ошибок передачи (P1-T1).
 *
 * Одна чистая функция `classifyError` превращает любой отказ `fetch`/DRF в
 * `TransmitError` — структурную ошибку с русским `messageRu`, который можно
 * показать пользователю как есть. Ни одна ветка не отдаёт англоязычный
 * «Failed to fetch»/«Request failed» в `messageRu`: такие detail'ы либо
 * отбрасываются, либо уходят в необязательное поле `detail` (отладка).
 *
 * Контракт бэкенда (backend/apps/common/exceptions.py, apps/forum):
 * - 429 DRF-throttle: `detail: "Request was throttled. Expected available in
 *   N seconds."` (при активном i18n — русский вариант с тем же N секунд);
 * - 400: `{detail: "Validation error", errors: {field: [msgs]}}`; закрытый
 *   тред приходит тоже как 400 — `PostCreateSerializer.validate` поднимает
 *   ValidationError("Thread is locked.") в `non_field_errors`;
 * - 404: `{detail: "Not found."}`; 5xx — всё остальное; 413 отдаёт прокси.
 */

export type TransmitErrorKind =
  | 'offline'
  | 'throttle'
  | 'validation'
  | 'tooLarge'
  | 'locked'
  | 'notFound'
  | 'server'
  | 'unknown'

export interface TransmitError {
  kind: TransmitErrorKind
  /** Готовое русское сообщение для пользователя. */
  messageRu: string
  /** Сырой англоязычный detail — только для отладки, не для UI. */
  detail?: string
  /** Через сколько секунд повторять (429). */
  retryAfterSec?: number
  /** Ошибки по полям формы (400). */
  fields?: Record<string, string[]>
}

/** Русские сообщения: единственный источник текста ошибок для UI. */
const MESSAGE = {
  offline: 'Сеть недоступна. Черновик сохранён — попробуем, когда связь вернётся.',
  throttle: (seconds: number) => `Слишком много сигналов. Повтор через ${seconds} с.`,
  validation: 'Сигнал не прошёл проверку. Проверь поля и попробуй снова.',
  tooLarge: 'Файл или сообщение больше, чем выдерживает сеть.',
  locked: 'Тред закрыт для новых сигналов.',
  notFound: 'Пост или тред больше не здесь.',
  server: 'Сервер сети не отвечает. Попробуй ещё раз.',
  unknown: 'Сигнал не отправлен. Попробуй ещё раз.',
} as const

/**
 * Оценка повтора, когда DRF не прислал секунд: самый частый scope
 * (post_create — 120/hour) даёт ≈30 с на сигнал, берём её как вежливый пол.
 */
const THROTTLE_FALLBACK_SEC = 30

/** EN DRF: «Expected available in 45 seconds.» (в старых DRF — «45.0»). */
const RETRY_AFTER_PATTERNS = [
  /available in\s+(\d+(?:[.,]\d+)?)\s*sec/i,
  // RU i18n: «…доступности через 45 секунд.»
  /(\d+)\s*сек/i,
]

/** Сигнатура закрытого треда в detail/errors: EN «Thread is locked.», RU «закрыт». */
const LOCKED_PATTERNS = [/locked/i, /\block\b/i, /закрыт/i, /заблокир/i]

/** Бесполезные detail'ы: как messageRu они не показываются никогда. */
const NOISE_DETAILS = ['failed to fetch', 'request failed', 'validation error']

function asApiError(err: unknown): ApiRequestError | null {
  if (typeof err !== 'object' || err === null) return null
  const status = (err as { status?: unknown }).status
  if (typeof status !== 'number') return null
  return err as ApiRequestError
}

function errorName(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const name = (err as { name?: unknown }).name
    if (typeof name === 'string') return name
  }
  return ''
}

function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return typeof err === 'string' ? err : ''
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Сетевой отказ без HTTP-статуса: `fetch` бросает TypeError при обрыве связи,
 * AbortError — при отмене запроса, текст сообщения зависит от браузера.
 */
function isNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true
  if (errorName(err) === 'AbortError') return true
  return /failed to fetch|networkerror|load failed/i.test(errorMessage(err))
}

/** Первый непустой и небесполезный detail — кандидат в `detail`. */
function informativeDetail(...candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) continue
    const trimmed = candidate.trim()
    if (trimmed.length === 0) continue
    if (NOISE_DETAILS.includes(trimmed.toLowerCase())) continue
    return trimmed
  }
  return undefined
}

/** Ошибки по полям без пустых сообщений (двухуровневый фильтр, как в UI). */
function filterFields(
  errors: Record<string, string[]> | undefined,
): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const [field, messages] of Object.entries(errors ?? {})) {
    const list = Array.isArray(messages) ? messages : []
    const clean = list.filter((m) => typeof m === 'string' && m.length > 0)
    if (clean.length > 0) fields[field] = clean
  }
  return fields
}

function mentionsLock(candidates: (string | undefined)[]): boolean {
  return candidates.some(
    (candidate) =>
      typeof candidate === 'string' && LOCKED_PATTERNS.some((p) => p.test(candidate)),
  )
}

function lockCandidates(apiError: ApiRequestError | null): (string | undefined)[] {
  if (!apiError) return []
  return [apiError.message, ...Object.values(apiError.errors ?? {}).flat()]
}

function parseRetryAfterSec(detail: string | undefined): number | undefined {
  if (!detail) return undefined
  for (const pattern of RETRY_AFTER_PATTERNS) {
    const match = pattern.exec(detail)
    if (!match) continue
    const seconds = Number.parseFloat(match[1].replace(',', '.'))
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds)
  }
  return undefined
}

/**
 * Классифицирует любой отказ API в `TransmitError` с русским `messageRu`.
 * Чистая функция: единственная внешняя зависимость — `navigator.onLine`
 * (мокается в тестах через `Object.defineProperty`).
 */
export function classifyError(err: unknown): TransmitError {
  // Сеть отвалилась ещё до запроса (или во время него) — черновик цел.
  if (isNetworkFailure(err) && isOffline()) {
    return {
      kind: 'offline',
      messageRu: MESSAGE.offline,
      detail: informativeDetail(errorMessage(err)),
    }
  }

  const apiError = asApiError(err)
  const status = apiError?.status
  const detail = apiError?.message

  if (status === 429) {
    const retryAfterSec = parseRetryAfterSec(detail) ?? THROTTLE_FALLBACK_SEC
    return {
      kind: 'throttle',
      messageRu: MESSAGE.throttle(retryAfterSec),
      retryAfterSec,
      detail: informativeDetail(detail),
    }
  }

  if (status === 413) {
    return {
      kind: 'tooLarge',
      messageRu: MESSAGE.tooLarge,
      detail: informativeDetail(detail),
    }
  }

  // Бэкенд отдаёт закрытый тред как 400 (non_field_errors «Thread is
  // locked.»), поэтому проверка блокировки идёт до общего validation-потока
  // и на 403/409 тоже — на случай явного отказа от прокси/модерации.
  if (
    (status === 403 || status === 409 || status === 400) &&
    mentionsLock(lockCandidates(apiError))
  ) {
    const locked: TransmitError = { kind: 'locked', messageRu: MESSAGE.locked }
    const raw = informativeDetail(detail)
    if (raw) locked.detail = raw
    const fields = filterFields(apiError?.errors)
    if (Object.keys(fields).length > 0) locked.fields = fields
    return locked
  }

  if (status === 400) {
    const fields = filterFields(apiError?.errors)
    const messages = Object.values(fields).flat()
    const validation: TransmitError = {
      kind: 'validation',
      messageRu:
        messages.length > 0 ? messages.slice(0, 2).join(' · ') : MESSAGE.validation,
    }
    if (Object.keys(fields).length > 0) validation.fields = fields
    const raw = informativeDetail(detail)
    if (raw) validation.detail = raw
    return validation
  }

  if (status === 404) {
    return {
      kind: 'notFound',
      messageRu: MESSAGE.notFound,
      detail: informativeDetail(detail),
    }
  }

  if (status !== undefined && status >= 500) {
    return {
      kind: 'server',
      messageRu: MESSAGE.server,
      detail: informativeDetail(detail),
    }
  }

  return {
    kind: 'unknown',
    messageRu: MESSAGE.unknown,
    detail: informativeDetail(detail, errorMessage(err)),
  }
}

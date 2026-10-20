import { afterEach, describe, expect, it } from 'vitest'

import { ApiRequestError } from '@/api/client'
import { classifyError, type TransmitError, type TransmitErrorKind } from '@/api/errors'

/** Проверка «в messageRu есть русские буквы» + зафиксированный kind. */
function expectRu(result: TransmitError, kind: TransmitErrorKind) {
  expect(result.kind).toBe(kind)
  expect(result.messageRu).toMatch(/[а-яА-ЯёЁ]/)
}

function setBrowserOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

function abortError(): Error {
  return Object.assign(new Error('The operation was aborted.'), {
    name: 'AbortError',
  })
}

afterEach(() => {
  setBrowserOnline(true)
})

describe('classifyError: throttle (429)', () => {
  it('парсит EN DRF detail «Expected available in N seconds.»', () => {
    const err = new ApiRequestError(
      429,
      'Request was throttled. Expected available in 45 seconds.',
    )
    const result = classifyError(err)
    expect(result.kind).toBe('throttle')
    expect(result.retryAfterSec).toBe(45)
    expect(result.messageRu).toBe('Слишком много сигналов. Повтор через 45 с.')
  })

  it('округляет дробные секунды DRF вверх', () => {
    const err = new ApiRequestError(
      429,
      'Request was throttled. Expected available in 31.0 seconds.',
    )
    expect(classifyError(err).retryAfterSec).toBe(31)
  })

  it('парсит русский i18n-вариант detail', () => {
    const err = new ApiRequestError(
      429,
      'Запрос был пропущен. Ожидайте доступности через 12 секунд.',
    )
    const result = classifyError(err)
    expect(result.kind).toBe('throttle')
    expect(result.retryAfterSec).toBe(12)
    expect(result.messageRu).toBe('Слишком много сигналов. Повтор через 12 с.')
  })

  it('без секунд в detail — fallback-оценка', () => {
    const err = new ApiRequestError(429, 'Request was throttled.')
    const result = classifyError(err)
    expect(result.kind).toBe('throttle')
    expect(result.retryAfterSec).toBe(30)
    expect(result.messageRu).toBe('Слишком много сигналов. Повтор через 30 с.')
  })
})

describe('classifyError: validation (400)', () => {
  it('с полями: messageRu — первые два сообщения через « · », fields отфильтрованы', () => {
    const err = new ApiRequestError(400, 'Validation error', {
      title: ['Too short'],
      body: ['Must not be empty'],
      attachments: ['Unsupported attachment type: image/svg+xml.'],
      sage: [''],
    })
    const result = classifyError(err)
    expect(result.kind).toBe('validation')
    expect(result.messageRu).toBe('Too short · Must not be empty')
    expect(result.fields).toEqual({
      title: ['Too short'],
      body: ['Must not be empty'],
      attachments: ['Unsupported attachment type: image/svg+xml.'],
    })
  })

  it('без полей: русский fallback', () => {
    const result = classifyError(new ApiRequestError(400, 'Validation error'))
    expectRu(result, 'validation')
    expect(result.messageRu).toMatch(/проверку/)
    expect(result.fields).toBeUndefined()
  })

  it('закрытый тред приходит как 400 non_field_errors «Thread is locked.»', () => {
    const err = new ApiRequestError(400, 'Validation error', {
      non_field_errors: ['Thread is locked.'],
    })
    const result = classifyError(err)
    expectRu(result, 'locked')
    expect(result.messageRu).toBe('Тред закрыт для новых сигналов.')
  })
})

describe('classifyError: locked (403/409)', () => {
  it('403 с detail про блокировку', () => {
    const result = classifyError(new ApiRequestError(403, 'Thread is locked.'))
    expectRu(result, 'locked')
    expect(result.messageRu).toBe('Тред закрыт для новых сигналов.')
  })

  it('409 с полем-сообщением про lock', () => {
    const err = new ApiRequestError(409, 'Conflict', { thread: ['locked'] })
    expectRu(classifyError(err), 'locked')
  })

  it('403 без намёка на блокировку — unknown, не выдуманный locked', () => {
    const result = classifyError(
      new ApiRequestError(403, 'CSRF Failed: CSRF token missing.'),
    )
    expect(result.kind).toBe('unknown')
  })
})

describe('classifyError: остальные статусы', () => {
  it('404 → notFound', () => {
    const result = classifyError(new ApiRequestError(404, 'Not found.'))
    expectRu(result, 'notFound')
    expect(result.messageRu).toBe('Пост или тред больше не здесь.')
  })

  it('413 → tooLarge', () => {
    const result = classifyError(new ApiRequestError(413, 'Request entity too large'))
    expectRu(result, 'tooLarge')
    expect(result.messageRu).toBe('Файл или сообщение больше, чем выдерживает сеть.')
  })

  it('500 → server', () => {
    const result = classifyError(new ApiRequestError(500, 'Request failed'))
    expectRu(result, 'server')
    expect(result.messageRu).toBe('Сервер сети не отвечает. Попробуй ещё раз.')
  })

  it('503 → server', () => {
    const result = classifyError(new ApiRequestError(503, 'Service unavailable'))
    expectRu(result, 'server')
  })
})

describe('classifyError: offline', () => {
  it('TypeError + navigator.onLine=false → offline', () => {
    setBrowserOnline(false)
    const result = classifyError(new TypeError('Failed to fetch'))
    expectRu(result, 'offline')
    expect(result.messageRu).toBe(
      'Сеть недоступна. Черновик сохранён — попробуем, когда связь вернётся.',
    )
  })

  it('AbortError + offline → offline', () => {
    setBrowserOnline(false)
    expectRu(classifyError(abortError()), 'offline')
  })

  it('TypeError + navigator.onLine=true → НЕ offline (unknown)', () => {
    setBrowserOnline(true)
    const result = classifyError(new TypeError('Failed to fetch'))
    expect(result.kind).toBe('unknown')
    expectRu(result, 'unknown')
  })

  it('Error с текстом «NetworkError» + offline → offline', () => {
    setBrowserOnline(false)
    const result = classifyError(
      new Error('NetworkError when attempting to fetch resource.'),
    )
    expectRu(result, 'offline')
  })
})

describe('classifyError: unknown', () => {
  it('мусор любого вида → unknown с русским fallback', () => {
    for (const junk of ['nope', null, undefined, 42, {}, new Error('boom')]) {
      const result = classifyError(junk)
      expectRu(result, 'unknown')
      expect(result.messageRu).toBe('Сигнал не отправлен. Попробуй ещё раз.')
    }
  })

  it('английский detail уходит в detail, не в messageRu', () => {
    const result = classifyError(new Error('boom'))
    expect(result.detail).toBe('boom')
    expect(result.messageRu).not.toContain('boom')
  })
})

describe('classifyError: запрет англоязычных messageRu', () => {
  it('«Failed to fetch»/«Request failed» никогда не становятся messageRu', () => {
    const cases: unknown[] = [
      new TypeError('Failed to fetch'),
      new Error('Failed to fetch'),
      abortError(),
      new ApiRequestError(400, 'Request failed'),
      new ApiRequestError(500, 'Request failed'),
      new ApiRequestError(404, 'Failed to fetch'),
    ]
    for (const err of cases) {
      const result = classifyError(err)
      expect(result.messageRu).not.toMatch(/failed to fetch|request failed/i)
      expect(result.messageRu).toMatch(/[а-яА-ЯёЁ]/)
    }
  })

  it('messageRu offline/locked неотличим от русского regardless of detail', () => {
    setBrowserOnline(false)
    const result = classifyError(new TypeError('Failed to fetch'))
    expect(result.detail).toBeUndefined()
    expectRu(result, 'offline')
  })
})

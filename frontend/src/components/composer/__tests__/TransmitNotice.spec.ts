import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import type { TransmitError, TransmitErrorKind } from '@/api/errors'
import TransmitNotice from '../TransmitNotice.vue'

function notice(error: TransmitError | null) {
  return mount(TransmitNotice, { props: { error } })
}

function failure(
  kind: TransmitErrorKind,
  patch: Partial<TransmitError> = {},
): TransmitError {
  const base: TransmitError = { kind, messageRu: 'Сигнал не отправлен.' }
  return { ...base, ...patch }
}

const retry = (wrapper: ReturnType<typeof notice>) =>
  wrapper.find('[data-testid="transmit-notice-retry"]')

// re-found every time: a wrapper captured before a re-render goes stale
const countdown = (wrapper: ReturnType<typeof notice>) =>
  wrapper.find('[data-testid="transmit-notice-countdown"]')

describe('TransmitNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders nothing while there is no error', () => {
    const wrapper = notice(null)
    expect(wrapper.find('[data-testid="transmit-notice"]').exists()).toBe(false)
  })

  it('is a polite inline status node, not a banner', () => {
    const wrapper = notice(failure('server'))

    const node = wrapper.find('[data-testid="transmit-notice"]')
    expect(node.exists()).toBe(true)
    expect(node.attributes('role')).toBe('alert')
    expect(node.attributes('aria-live')).toBe('polite')
    expect(node.attributes('data-kind')).toBe('server')
    expect(wrapper.text()).toContain('Сигнал не отправлен.')
  })

  it('shows the classified Russian message for an offline failure', () => {
    const wrapper = notice(
      failure('offline', {
        messageRu:
          'Сеть недоступна. Черновик сохранён — попробуем, когда связь вернётся.',
      }),
    )

    expect(wrapper.text()).toContain('Сеть недоступна')
    expect(wrapper.text()).toContain('связь вернётся')
  })

  describe('throttle countdown', () => {
    it('counts the seconds down and only then offers the retry button', async () => {
      const wrapper = notice(
        failure('throttle', {
          messageRu: 'Слишком много сигналов. Повтор через 3 с.',
          retryAfterSec: 3,
        }),
      )

      const liveCountdown = countdown(wrapper)
      expect(liveCountdown.text()).toBe('повтор через 3с')
      expect(retry(wrapper).exists()).toBe(false)

      await vi.advanceTimersByTimeAsync(1000)
      await nextTick()
      expect(countdown(wrapper).text()).toBe('повтор через 2с')
      expect(retry(wrapper).exists()).toBe(false)

      await vi.advanceTimersByTimeAsync(1000)
      await nextTick()
      expect(countdown(wrapper).text()).toBe('повтор через 1с')
      expect(retry(wrapper).exists()).toBe(false)

      await vi.advanceTimersByTimeAsync(1000)
      await nextTick()
      expect(countdown(wrapper).exists()).toBe(false)
      expect(retry(wrapper).exists()).toBe(true)
      expect(retry(wrapper).text()).toBe('повторить')
    })

    it('shows the retry button at once when the API sent no seconds', () => {
      const wrapper = notice(failure('throttle'))
      expect(retry(wrapper).exists()).toBe(true)
    })

    it('restarts the countdown for a fresh throttle refusal', async () => {
      const wrapper = notice(failure('throttle', { retryAfterSec: 5 }))

      await vi.advanceTimersByTimeAsync(2000)
      await nextTick()
      expect(countdown(wrapper).text()).toBe('повтор через 3с')

      await wrapper.setProps({
        error: failure('throttle', { messageRu: 'Снова лимит.', retryAfterSec: 2 }),
      })
      await nextTick()

      expect(countdown(wrapper).text()).toBe('повтор через 2с')
      expect(retry(wrapper).exists()).toBe(false)
    })

    it('stops its interval on unmount', async () => {
      const wrapper = notice(failure('throttle', { retryAfterSec: 30 }))
      expect(vi.getTimerCount()).toBeGreaterThan(0)

      wrapper.unmount()

      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('validation fields', () => {
    it('lists «поле: сообщение» for the first three fields with Russian labels', () => {
      const wrapper = notice(
        failure('validation', {
          messageRu: 'Сигнал не прошёл проверку.',
          fields: {
            title: ['Пустой заголовок.', 'Слишком коротко.'],
            body: ['Пустой сигнал.'],
            attachments: ['Файл слишком большой.'],
            reason: ['Неизвестная причина.'],
          },
        }),
      )

      const rows = wrapper.findAll('.notice__field')
      expect(rows).toHaveLength(3)
      expect(rows[0].attributes('data-field')).toBe('title')
      expect(rows[0].text()).toContain('заголовок')
      expect(rows[0].text()).toContain('Пустой заголовок.')
      expect(rows[0].text()).toContain('Слишком коротко.')
      expect(rows[1].text()).toContain('сообщение')
      expect(rows[1].text()).toContain('Пустой сигнал.')
      expect(rows[2].text()).toContain('файлы')
      expect(rows[2].text()).toContain('Файл слишком большой.')
      expect(wrapper.text()).not.toContain('причина')
    })

    it('labels comment, reason and the general bucket too', () => {
      const wrapper = notice(
        failure('validation', {
          fields: {
            comment: ['Комментарий слишком длинный.'],
            reason: ['Выбери причину.'],
            non_field_errors: ['Тред закрыт.'],
          },
        }),
      )

      const rows = wrapper.findAll('.notice__field')
      expect(rows.map((r) => r.text())).toEqual([
        'комментарий: Комментарий слишком длинный.',
        'причина: Выбери причину.',
        'общее: Тред закрыт.',
      ])
    })

    it('does not duplicate the message that is built from the fields themselves', () => {
      const wrapper = notice(
        failure('validation', {
          messageRu: 'Пустой заголовок. · Пустой сигнал.',
          fields: { title: ['Пустой заголовок.'], body: ['Пустой сигнал.'] },
        }),
      )

      expect(wrapper.find('.notice__message').exists()).toBe(false)
      expect(wrapper.findAll('.notice__field')).toHaveLength(2)
    })

    it('shows the message when the validation error carries no fields', () => {
      const wrapper = notice(
        failure('validation', {
          messageRu: 'Сигнал не прошёл проверку. Проверь поля.',
        }),
      )

      expect(wrapper.findAll('.notice__field')).toHaveLength(0)
      expect(wrapper.text()).toContain('Сигнал не прошёл проверку')
    })
  })

  describe('retry button visibility', () => {
    it.each(['offline', 'server', 'unknown'] as TransmitErrorKind[])(
      'offers a retry for a recoverable %s failure',
      (kind) => {
        expect(retry(notice(failure(kind))).exists()).toBe(true)
      },
    )

    it.each(['locked', 'notFound', 'validation', 'tooLarge'] as TransmitErrorKind[])(
      'offers no retry for %s — trying again changes nothing',
      (kind) => {
        expect(retry(notice(failure(kind))).exists()).toBe(false)
      },
    )

    it('hides the retry while a throttle window is still running', () => {
      const wrapper = notice(failure('throttle', { retryAfterSec: 10 }))
      expect(retry(wrapper).exists()).toBe(false)
    })
  })

  it('emits retry when the button is pressed', async () => {
    const wrapper = notice(failure('offline'))

    await retry(wrapper).trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})

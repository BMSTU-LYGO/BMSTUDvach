import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

import { ApiRequestError } from '@/api/client'
import { useTransmit } from '@/composables/useTransmit'

/** `useTransmit` is a setup() composable — it needs an owner instance. */
function mountTransmit() {
  let api: ReturnType<typeof useTransmit> | null = null
  const Host = defineComponent({
    setup() {
      api = useTransmit()
      return () => h('div')
    },
  })
  const wrapper = mount(Host)
  return { wrapper, api: api! }
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

/** Let the promise chain of an awaited call settle (no timers involved). */
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

function offlineFailure() {
  return new TypeError('Failed to fetch')
}

describe('useTransmit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    setOnline(true)
  })

  it('tracks submitting through a success and bumps successToken', async () => {
    const { wrapper, api } = mountTransmit()
    const call = vi.fn(async () => 'готово')

    const attempt = api.run('сигнал', call)

    expect(api.submitting.value).toBe(true)
    expect(api.error.value).toBe(null)

    const result = await attempt

    expect(result).toBe('готово')
    expect(api.submitting.value).toBe(false)
    expect(api.successToken.value).toBe(1)
    expect(api.error.value).toBe(null)
    expect(api.lastInput.value).toBe('сигнал')
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('сигнал')

    wrapper.unmount()
  })

  it('classifies the failure and leaves the form usable', async () => {
    const { wrapper, api } = mountTransmit()
    const failure = new ApiRequestError(400, 'Validation error', {
      body: ['Пустой сигнал.'],
    })

    await api.run('', async () => {
      throw failure
    })

    expect(api.error.value?.kind).toBe('validation')
    expect(api.error.value?.fields?.body).toEqual(['Пустой сигнал.'])
    expect(api.error.value?.messageRu).toContain('Пустой сигнал.')
    expect(api.submitting.value).toBe(false)
    expect(api.successToken.value).toBe(0)
    // the attempt is retained, so a retry is still possible
    expect(api.lastInput.value).toBe('')

    wrapper.unmount()
  })

  it('retry() repeats the last attempt with the stored input', async () => {
    const { wrapper, api } = mountTransmit()
    const call = vi.fn(async () => {
      throw new ApiRequestError(500, 'Server error')
    })

    await api.run('сигнал', call)
    expect(call).toHaveBeenCalledTimes(1)
    expect(api.error.value?.kind).toBe('server')

    await api.retry()

    expect(call).toHaveBeenCalledTimes(2)
    expect(call).toHaveBeenLastCalledWith('сигнал')
    expect(api.error.value?.kind).toBe('server')

    wrapper.unmount()
  })

  it('ignores a second run while one attempt is in flight', async () => {
    const { wrapper, api } = mountTransmit()
    let release: (value: string) => void = () => {}
    const first = api.run(
      'первый',
      () => new Promise<string>((resolve) => (release = resolve)),
    )

    await api.run('второй', async () => 'ok')

    expect(api.lastInput.value).toBe('первый')
    release('ok')
    expect(await first).toBe('ok')
    expect(api.successToken.value).toBe(1)

    wrapper.unmount()
  })

  it('auto-retries once when the browser comes back online', async () => {
    setOnline(false)
    const { wrapper, api } = mountTransmit()
    const call = vi
      .fn()
      .mockRejectedValueOnce(offlineFailure())
      .mockResolvedValueOnce('отправлено')

    await api.run('сигнал', call)
    expect(api.error.value?.kind).toBe('offline')
    expect(api.error.value?.messageRu).toContain('Сеть недоступна')
    expect(call).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('online'))
    await flush()

    expect(call).toHaveBeenCalledTimes(2)
    expect(api.error.value).toBe(null)
    expect(api.successToken.value).toBe(1)
    expect(api.submitting.value).toBe(false)

    // the listener fired once and is gone — no silent retry loop
    window.dispatchEvent(new Event('online'))
    await flush()
    expect(call).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('re-arms the auto-retry when the reconnect attempt fails again', async () => {
    setOnline(false)
    const { wrapper, api } = mountTransmit()
    const call = vi.fn().mockRejectedValue(offlineFailure())

    await api.run('сигнал', call)
    window.dispatchEvent(new Event('online'))
    await flush()

    expect(call).toHaveBeenCalledTimes(2)
    expect(api.error.value?.kind).toBe('offline')

    wrapper.unmount()
  })

  it('drops the online listener when the owner unmounts', async () => {
    setOnline(false)
    const { wrapper, api } = mountTransmit()
    const call = vi.fn().mockRejectedValue(offlineFailure())

    await api.run('сигнал', call)
    expect(api.error.value?.kind).toBe('offline')

    const removeSpy = vi.spyOn(window, 'removeEventListener')
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function))

    window.dispatchEvent(new Event('online'))
    await flush()
    expect(call).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('respects a throttle limit — no timers, no automatic retry', async () => {
    const { wrapper, api } = mountTransmit()
    const call = vi.fn(async () => {
      throw new ApiRequestError(
        429,
        'Request was throttled. Expected available in 30 seconds.',
      )
    })

    await api.run('сигнал', call)

    expect(api.error.value?.kind).toBe('throttle')
    expect(api.error.value?.retryAfterSec).toBe(30)
    expect(api.error.value?.messageRu).toContain('Повтор через 30 с')

    // the whole limit window passes: the composable schedules nothing
    vi.advanceTimersByTime(60_000)
    await flush()

    expect(vi.getTimerCount()).toBe(0)
    expect(call).toHaveBeenCalledTimes(1)
    expect(api.error.value?.kind).toBe('throttle')

    wrapper.unmount()
  })

  it('reset() clears the error and the retained attempt', async () => {
    const { wrapper, api } = mountTransmit()
    const call = vi.fn(async () => {
      throw new ApiRequestError(500, 'Server error')
    })

    await api.run('сигнал', call)
    api.reset()

    expect(api.error.value).toBe(null)
    expect(api.submitting.value).toBe(false)
    expect(api.lastInput.value).toBe(null)

    await api.retry()
    expect(call).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('warns the console only for failures it cannot classify', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { wrapper, api } = mountTransmit()

    await api.run('сигнал', async () => {
      throw new Error('совсем неожиданный сбой')
    })
    expect(api.error.value?.kind).toBe('unknown')
    expect(warn).toHaveBeenCalledTimes(1)

    await api.run({ title: 'тред' }, async () => {
      throw new ApiRequestError(400, 'Validation error', {
        title: ['Пустой заголовок.'],
      })
    })
    expect(warn).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import LaunchBay from '../LaunchBay.vue'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

function mountBay(props: Record<string, unknown> = {}) {
  return mount(LaunchBay, {
    props: { boardSlug: 'b', ...props },
    attachTo: document.body,
  })
}

describe('LaunchBay', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders an editorial title surface and telemetry', async () => {
    const wrapper = mountBay()
    await nextTick()

    const title = wrapper.find('[data-testid="launch-title"]')
    expect(title.exists()).toBe(true)
    expect(title.attributes('aria-label')).toBe('Заголовок треда')
    expect(wrapper.text()).toContain('NEW TRANSMISSION')
    expect(wrapper.text()).toContain('/b/')
    // instrumentation rail, not a form sidebar
    expect(wrapper.text()).toContain('BUFFER')
  })

  it('focuses the title on open', async () => {
    const wrapper = mountBay()
    await nextTick()
    expect(document.activeElement).toBe(wrapper.find('[data-testid="launch-title"]').element)
  })

  it('emits launch without clearing itself — parent owns the API', async () => {
    const wrapper = mountBay()
    await nextTick()

    await wrapper.find('[data-testid="launch-title"]').setValue('Срочно: ИУ7')
    const surface = wrapper.find('[data-testid="signal-input"]')
    await surface.setValue('После обновления всё сломалось')

    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')![0][0]).toMatchObject({
      title: 'Срочно: ИУ7',
      body: 'После обновления всё сломалось',
    })

    // no success yet → input must survive
    expect((wrapper.find('[data-testid="launch-title"]').element as HTMLInputElement).value).toBe(
      'Срочно: ИУ7',
    )
  })

  it('plays the launch sequence and hands the stage back after success', async () => {
    const wrapper = mountBay()
    await nextTick()

    await wrapper.setProps({ successToken: 1 })
    expect(wrapper.classes()).toContain('launch-bay--launched')

    vi.runAllTimers()
    await nextTick()
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('keeps title/body on API failure and shows the error', async () => {
    const wrapper = mountBay()
    await nextTick()
    await wrapper.find('[data-testid="launch-title"]').setValue('Тред')
    await wrapper.find('[data-testid="signal-input"]').setValue('Тело')

    await wrapper.setProps({ submitError: 'Сеть недоступна' })
    await nextTick()

    expect(wrapper.find('[data-testid="launch-error"]').text()).toContain('Сеть недоступна')
    expect((wrapper.find('[data-testid="launch-title"]').element as HTMLInputElement).value).toBe('Тред')
    expect(wrapper.emitted('done')).toBeFalsy()
  })

  it('launches on Cmd/Ctrl+Enter and closes on Escape', async () => {
    const wrapper = mountBay()
    await nextTick()

    await wrapper.find('[data-testid="launch-title"]').setValue('Тред')
    await wrapper.find('[data-testid="signal-input"]').setValue('Тело')
    await wrapper.find('[data-testid="launch-title"]').trigger('keydown', { key: 'Enter', metaKey: true })
    expect(wrapper.emitted('submit')).toHaveLength(1)

    await wrapper.find('[data-testid="launch-title"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('restores a buffered draft silently', async () => {
    localStorageMock.setItem(
      'draft:launch-b',
      JSON.stringify({ title: 'Черновик', body: 'Недописанное', files: [], timestamp: Date.now() }),
    )
    const wrapper = mountBay()
    await nextTick()

    expect((wrapper.find('[data-testid="launch-title"]').element as HTMLInputElement).value).toBe(
      'Черновик',
    )
    expect((wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value).toBe(
      'Недописанное',
    )
  })

  it('keeps the transmit node disabled while empty', () => {
    const wrapper = mountBay()
    expect(wrapper.find('.transmit').attributes('aria-disabled')).toBe('true')
  })
})

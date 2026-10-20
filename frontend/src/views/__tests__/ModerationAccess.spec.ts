import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/moderation', () => ({
  staffLogin: vi.fn(),
  staffMe: vi.fn(),
  staffLogout: vi.fn(),
  fetchReportQueue: vi.fn(),
  fetchFingerprintPosts: vi.fn(),
  fetchModerationLog: vi.fn(),
  resolveReport: vi.fn(),
  moderatePost: vi.fn(),
  moderateThread: vi.fn(),
  pinThread: vi.fn(),
  unpinThread: vi.fn(),
}))

import ModerationView from '@/views/ModerationView.vue'
import ModerationViewSource from '@/views/ModerationView.vue?raw'
import { staffMe } from '@/api/moderation'
import { ApiRequestError } from '@/api/client'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/moderation', component: ModerationView }],
  })
  await router.push('/moderation')
  await router.isReady()

  const wrapper = mount(ModerationView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('ModerationView — закрытый доступ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('показывает состояние «доступ закрыт», если проверка сорвалась', async () => {
    vi.mocked(staffMe).mockRejectedValue(new ApiRequestError(500, 'Сервер недоступен'))

    const wrapper = await mountView()
    await flushPromises()

    const state = wrapper.find('[data-testid="state-not-found"]')
    expect(state.exists()).toBe(true)
    expect(state.attributes('data-variant')).toBe('sealed')
    expect(wrapper.find('.state__label').text()).toContain('ACCESS SEALED')
    expect(wrapper.find('.state__message').text()).toContain('Проверка доступа')
    // Гейт не показываем: сначала нужно понять, что с доступом.
    expect(wrapper.find('[data-testid="staff-login"]').exists()).toBe(false)
  })

  it('предлагает повторить проверку доступа', async () => {
    vi.mocked(staffMe).mockRejectedValue(new ApiRequestError(500, 'Сервер недоступен'))

    const wrapper = await mountView()
    await flushPromises()

    expect(staffMe).toHaveBeenCalledTimes(1)

    await wrapper.find('.state__button').trigger('click')
    await flushPromises()

    expect(staffMe).toHaveBeenCalledTimes(2)
  })

  it('отсутствие сессии (401/403) — это гейт, а не ошибка', async () => {
    vi.mocked(staffMe).mockRejectedValue(new ApiRequestError(403, 'Нет доступа'))

    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="staff-login"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="state-not-found"]').exists()).toBe(false)
  })

  it('анонимному посетителю показывает вход, а не состояние', async () => {
    vi.mocked(staffMe).mockResolvedValue({ is_staff: false })

    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="staff-login"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="state-not-found"]').exists()).toBe(false)
  })

  it('не орёт красным, когда консоль закрыта', () => {
    expect(ModerationViewSource).toMatch(
      /\.console__who--locked \.console__dot\s*\{[^}]*background:\s*var\(--ink-tertiary\)/,
    )
    expect(ModerationViewSource).not.toMatch(
      /\.console__who--locked \.console__dot\s*\{[^}]*var\(--danger\)/,
    )
    // Закрытая консоль гасит и знак: красный живёт только у staff-сессии.
    expect(ModerationViewSource).toMatch(/\.console--locked \.console__kicker/)
  })
})

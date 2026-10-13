import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

vi.mock('@/api/moderation', () => ({
  staffLogin: vi.fn(),
  staffMe: vi.fn(),
  staffLogout: vi.fn(),
  fetchReportQueue: vi.fn(),
  resolveReport: vi.fn(),
  moderatePost: vi.fn(),
  moderateThread: vi.fn(),
  pinThread: vi.fn(),
  unpinThread: vi.fn(),
}))

import ModerationView from '@/views/ModerationView.vue'
import {
  fetchReportQueue,
  pinThread,
  resolveReport,
  staffLogin,
  staffMe,
  unpinThread,
} from '@/api/moderation'

const queue = {
  reports: [
    {
      id: 5,
      reason: 'spam',
      comment: 'флуд ссылками',
      status: 'new',
      created_at: '2026-10-01T10:00:00Z',
      post: {
        id: 42,
        thread: 7,
        thread_title: 'Тред',
        is_hidden: false,
        body: 'Купите курсы со скидкой',
      },
    },
  ],
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/moderation', component: ModerationView }],
  })
  await router.push('/moderation')
  await router.isReady()
  return mount(ModerationView, { global: { plugins: [router] }, attachTo: document.body })
}

describe('ModerationView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(staffMe).mockResolvedValue({ is_staff: false })
  })

  it('gates non-staff behind a login form', async () => {
    const wrapper = await mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="staff-login"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="report-row"]').exists()).toBe(false)
  })

  it('logs staff in and shows the queue', async () => {
    vi.mocked(staffLogin).mockResolvedValue({ is_staff: true, username: 'moder' })
    vi.mocked(fetchReportQueue).mockResolvedValue(queue)

    const wrapper = await mountView()
    await flushPromises()

    await wrapper.find('input[type="text"]').setValue('moder')
    await wrapper.find('input[type="password"]').setValue('pass123')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(staffLogin).toHaveBeenCalledWith('moder', 'pass123')
    const row = wrapper.find('[data-testid="report-row"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('спам')
    expect(row.text()).toContain('#42')
    expect(row.text()).toContain('Купите курсы')
  })

  it('actioning a report removes it from the queue', async () => {
    vi.mocked(staffLogin).mockResolvedValue({ is_staff: true, username: 'moder' })
    vi.mocked(fetchReportQueue).mockResolvedValue(queue)
    vi.mocked(resolveReport).mockResolvedValue({ id: 5, status: 'actioned' })

    const wrapper = await mountView()
    await flushPromises()
    await wrapper.find('input[type="text"]').setValue('moder')
    await wrapper.find('input[type="password"]').setValue('pass123')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const actionBtn = wrapper
      .findAll('.report__btn')
      .find((b) => b.text().includes('скрыть пост'))!
    await actionBtn.trigger('click')
    await flushPromises()

    expect(resolveReport).toHaveBeenCalledWith(5, 'action')
    expect(wrapper.find('[data-testid="queue-empty"]').exists()).toBe(true)
  })

  it('shows a Russian error on bad login', async () => {
    vi.mocked(staffLogin).mockRejectedValue(new Error('Неверные учётные данные или нет доступа.'))

    const wrapper = await mountView()
    await flushPromises()
    await wrapper.find('input[type="text"]').setValue('x')
    await wrapper.find('input[type="password"]').setValue('y')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.find('.login__error').text()).toContain('Неверные учётные данные')
  })
})

describe('ModerationView quick tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(staffLogin).mockResolvedValue({ is_staff: true, username: 'moder' })
    vi.mocked(fetchReportQueue).mockResolvedValue(queue)
    vi.mocked(pinThread).mockResolvedValue({
      id: 7,
      is_hidden: false,
      is_locked: false,
      is_pinned: true,
    })
    vi.mocked(unpinThread).mockResolvedValue({
      id: 7,
      is_hidden: false,
      is_locked: false,
      is_pinned: false,
    })
  })

  async function mountStaffConsole() {
    const wrapper = await mountView()
    await flushPromises()
    await wrapper.find('input[type="text"]').setValue('moder')
    await wrapper.find('input[type="password"]').setValue('pass123')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    return wrapper
  }

  it('offers the pin toggle for thread targets only', async () => {
    const wrapper = await mountStaffConsole()
    expect(wrapper.find('[data-testid="pin-toggle"]').exists()).toBe(false)

    await wrapper.findAll('.tools__switch button')[1].trigger('click')
    expect(wrapper.find('[data-testid="pin-toggle"]').exists()).toBe(true)
  })

  it('pins and unpins the target thread', async () => {
    const wrapper = await mountStaffConsole()
    await wrapper.findAll('.tools__switch button')[1].trigger('click')
    await wrapper.find('.tools__id').setValue('7')

    const pinBtn = wrapper.find('[data-testid="pin-toggle"]')
    expect(pinBtn.text()).toContain('Закрепить')
    expect(pinBtn.attributes('aria-pressed')).toBe('false')

    await pinBtn.trigger('click')
    await flushPromises()
    expect(pinThread).toHaveBeenCalledWith(7)
    expect(pinBtn.text()).toContain('Открепить')
    expect(pinBtn.attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.tools__status').text()).toContain('закреплён')

    await pinBtn.trigger('click')
    await flushPromises()
    expect(unpinThread).toHaveBeenCalledWith(7)
    expect(pinBtn.text()).toContain('Закрепить')
    expect(wrapper.find('.tools__status').text()).toContain('откреплён')
  })

  it('reports an api failure instead of flipping the toggle', async () => {
    vi.mocked(pinThread).mockRejectedValue(new Error('действие не удалось'))
    const wrapper = await mountStaffConsole()
    await wrapper.findAll('.tools__switch button')[1].trigger('click')
    await wrapper.find('.tools__id').setValue('7')

    await wrapper.find('[data-testid="pin-toggle"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.tools__status').text()).toContain('действие не удалось')
    expect(wrapper.find('[data-testid="pin-toggle"]').text()).toContain('Закрепить')
  })
})

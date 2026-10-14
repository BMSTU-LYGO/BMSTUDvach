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
  fetchFingerprintPosts: vi.fn(),
  fetchModerationLog: vi.fn(),
  resolveReport: vi.fn(),
  moderatePost: vi.fn(),
  moderateThread: vi.fn(),
  pinThread: vi.fn(),
  unpinThread: vi.fn(),
}))

import ModerationView from '@/views/ModerationView.vue'
import {
  fetchFingerprintPosts,
  fetchModerationLog,
  fetchReportQueue,
  pinThread,
  resolveReport,
  staffLogin,
  staffMe,
  unpinThread,
  type ModerationLogEntry,
} from '@/api/moderation'

const FINGERPRINT = 'a'.repeat(64)

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
        poster_fingerprint: FINGERPRINT,
      },
    },
  ],
}

const fingerprintPosts = {
  fingerprint: FINGERPRINT,
  count: 2,
  posts: [
    {
      id: 42,
      thread: 7,
      thread_title: 'Тред',
      body: 'Купите курсы со скидкой',
      is_hidden: false,
      sage: false,
      created_at: '2026-10-01T10:00:00Z',
    },
    {
      id: 43,
      thread: 7,
      thread_title: 'Тред',
      body: 'Ещё одна волна спама',
      is_hidden: true,
      sage: true,
      created_at: '2026-09-30T10:00:00Z',
    },
  ],
}

const log: ModerationLogEntry[] = [
  {
    id: 2,
    actor: 'moder',
    action: 'lock_thread',
    target_type: 'thread',
    target_id: 7,
    note: '',
    created_at: '2026-10-02T12:30:00Z',
  },
  {
    id: 1,
    actor: 'alice',
    action: 'hide_post',
    target_type: 'post',
    target_id: 42,
    note: '',
    created_at: '2026-10-01T10:00:00Z',
  },
]

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/moderation', component: ModerationView }],
  })
  await router.push('/moderation')
  await router.isReady()
  return mount(ModerationView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
}

describe('ModerationView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(staffMe).mockResolvedValue({ is_staff: false })
    vi.mocked(fetchModerationLog).mockResolvedValue([])
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
    vi.mocked(fetchModerationLog).mockResolvedValue(log)

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
    vi.mocked(staffLogin).mockRejectedValue(
      new Error('Неверные учётные данные или нет доступа.'),
    )

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

describe('ModerationView journal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(staffMe).mockResolvedValue({ is_staff: true, username: 'moder' })
    vi.mocked(fetchReportQueue).mockResolvedValue(queue)
    vi.mocked(fetchModerationLog).mockResolvedValue(log)
  })

  it('renders the audit journal of recent staff actions', async () => {
    const wrapper = await mountView()
    await flushPromises()

    const journal = wrapper.find('[data-testid="moderation-log"]')
    expect(journal.exists()).toBe(true)
    expect(journal.attributes('role')).toBe('log')
    expect(journal.attributes('aria-label')).toContain('Журнал')
    expect(fetchModerationLog).toHaveBeenCalled()

    const rows = journal.findAll('.journal__row')
    expect(rows).toHaveLength(2)
    // newest first: actor · action · target
    expect(rows[0].text()).toContain('moder')
    expect(rows[0].text()).toContain('тред закрыт')
    expect(rows[0].text()).toContain('тред #7')
    expect(rows[1].text()).toContain('alice')
    expect(rows[1].text()).toContain('пост скрыт')
    expect(rows[1].text()).toContain('пост #42')
  })

  it('refreshes the journal after a moderation action', async () => {
    vi.mocked(resolveReport).mockResolvedValue({ id: 5, status: 'actioned' })
    const wrapper = await mountView()
    await flushPromises()
    expect(fetchModerationLog).toHaveBeenCalledTimes(1)

    const actionBtn = wrapper
      .findAll('.report__btn')
      .find((b) => b.text().includes('скрыть пост'))!
    await actionBtn.trigger('click')
    await flushPromises()

    expect(fetchModerationLog).toHaveBeenCalledTimes(2)
  })

  it('shows an error when the journal cannot be loaded', async () => {
    vi.mocked(fetchModerationLog).mockRejectedValue(new Error('Журнал недоступен.'))
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.find('.journal__error').text()).toContain('Журнал недоступен')
    expect(wrapper.find('[data-testid="moderation-log"]').exists()).toBe(false)
  })

  it('reports an empty journal', async () => {
    vi.mocked(fetchModerationLog).mockResolvedValue([])
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="log-empty"]').text()).toContain(
      'действий пока не было',
    )
    expect(wrapper.find('[data-testid="moderation-log"]').exists()).toBe(false)
  })
})

describe('ModerationView console chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(staffMe).mockResolvedValue({ is_staff: true, username: 'moder' })
    vi.mocked(fetchReportQueue).mockResolvedValue(queue)
    vi.mocked(fetchModerationLog).mockResolvedValue(log)
  })

  it('exposes the console sections as labelled landmarks', async () => {
    const wrapper = await mountView()
    await flushPromises()

    const queueSection = wrapper.find('section[aria-labelledby="queue-title"]')
    expect(queueSection.exists()).toBe(true)
    expect(queueSection.find('#queue-title').text()).toContain('ОЧЕРЕДЬ ЖАЛОБ')

    const journalSection = wrapper.find('section[aria-labelledby="journal-title"]')
    expect(journalSection.exists()).toBe(true)
    expect(journalSection.find('#journal-title').text()).toContain('ЖУРНАЛ')

    const toolsSection = wrapper.find('section[aria-labelledby="tools-title"]')
    expect(toolsSection.exists()).toBe(true)
    expect(toolsSection.find('#tools-title').text()).toContain('БЫСТРЫЕ ДЕЙСТВИЯ')
  })

  it('tags report rows and journal rows with severity levels', async () => {
    const wrapper = await mountView()
    await flushPromises()

    const row = wrapper.find('[data-testid="report-row"]')
    expect(row.classes()).toContain('report--mid')

    const rows = wrapper.findAll('.journal__row')
    expect(rows[0].classes()).toContain('journal__row--danger')
    expect(rows[1].classes()).toContain('journal__row--danger')
  })

  it('marks the target-kind switch with pressed state', async () => {
    const wrapper = await mountView()
    await flushPromises()

    const segs = wrapper.findAll('.tools__switch button')
    expect(segs[0].attributes('aria-pressed')).toBe('true')
    expect(segs[1].attributes('aria-pressed')).toBe('false')

    await segs[1].trigger('click')
    expect(segs[0].attributes('aria-pressed')).toBe('false')
    expect(segs[1].attributes('aria-pressed')).toBe('true')
  })
})

describe('ModerationView fingerprint tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(staffMe).mockResolvedValue({ is_staff: true, username: 'moder' })
    vi.mocked(fetchReportQueue).mockResolvedValue(queue)
    vi.mocked(fetchModerationLog).mockResolvedValue([])
    vi.mocked(fetchFingerprintPosts).mockResolvedValue(fingerprintPosts)
  })

  async function mountConsole() {
    const wrapper = await mountView()
    await flushPromises()
    return wrapper
  }

  it('expands a compact list of the fingerprint posts', async () => {
    const wrapper = await mountConsole()
    const toggle = wrapper.find('[data-testid="fingerprint-toggle"]')
    expect(toggle.text()).toContain('Посты автора')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="fingerprint-panel"]').exists()).toBe(false)

    await toggle.trigger('click')
    await flushPromises()

    expect(fetchFingerprintPosts).toHaveBeenCalledWith(FINGERPRINT)
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const panel = wrapper.find('[data-testid="fingerprint-panel"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('постов: 002')

    const posts = panel.findAll('[data-testid="fingerprint-post"]')
    expect(posts).toHaveLength(2)
    expect(posts[0].text()).toContain('#042')
    expect(posts[0].text()).toContain('Тред')
    expect(posts[1].text()).toContain('#043')
    expect(posts[1].text()).toContain('скрыт')
  })

  it('closes the list on a second click', async () => {
    const wrapper = await mountConsole()
    const toggle = wrapper.find('[data-testid="fingerprint-toggle"]')

    await toggle.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="fingerprint-panel"]').exists()).toBe(true)

    await toggle.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="fingerprint-panel"]').exists()).toBe(false)
    expect(toggle.attributes('aria-expanded')).toBe('false')
  })

  it('shows an honest error when the lookup fails', async () => {
    vi.mocked(fetchFingerprintPosts).mockRejectedValue(
      new Error('Посты по отпечатку недоступны.'),
    )
    const wrapper = await mountConsole()

    await wrapper.find('[data-testid="fingerprint-toggle"]').trigger('click')
    await flushPromises()

    const panel = wrapper.find('[data-testid="fingerprint-panel"]')
    expect(panel.exists()).toBe(true)
    expect(panel.find('[role="alert"]').text()).toContain('Посты по отпечатку')
    expect(panel.find('[data-testid="fingerprint-post"]').exists()).toBe(false)
  })
})

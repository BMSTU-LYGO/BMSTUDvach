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

vi.mock('@/api/mentions', () => ({
  getMentions: vi.fn(),
}))

import MentionsBeacon from '@/components/home/MentionsBeacon.vue'
import { getMentions } from '@/api/mentions'

const TRIP = '!u3V2icOT'

function mention(
  post: number,
  thread: number,
  title: string,
  snippet: string,
  hour: number,
) {
  return {
    post,
    thread,
    thread_title: title,
    body: ' Ответ ',
    created_at: `2026-10-13T${String(hour).padStart(2, '0')}:00:00Z`,
    snippet,
  }
}

const mentionsFor = () => [
  mention(31, 7, 'Срочно про ИУ7', 'Смотри >>31 и думай', 12),
  mention(32, 8, 'Расписание сессии', '>>31 ответ', 13),
]

async function mountBeacon() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/threads/:id', component: { template: '<div />' } },
    ],
  })
  const wrapper = mount(MentionsBeacon, { global: { plugins: [router] } })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('MentionsBeacon', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.mocked(getMentions).mockReset()
  })

  it('says "НЕТ ОТВЕТОВ" and skips the api without tripcodes', async () => {
    const wrapper = await mountBeacon()
    const count = wrapper.find('[data-testid="mentions-count"]')
    expect(count.text()).toBe('Нет ответов')
    expect(getMentions).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="mentions-toggle"]').trigger('click')
    expect(wrapper.find('[data-testid="mentions-list"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mentions-empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Добавьте трипкод')
  })

  it('counts unread mentions and links them to the post anchor', async () => {
    localStorageMock.setItem('bmstud-identities', JSON.stringify([TRIP]))
    vi.mocked(getMentions).mockImplementation((trip: string) =>
      Promise.resolve({
        tripcode: trip,
        count: 2,
        mentions: mentionsFor(),
      }),
    )
    const wrapper = await mountBeacon()

    expect(getMentions).toHaveBeenCalledWith(TRIP)
    expect(wrapper.find('[data-testid="mentions-count"]').text()).toBe('+02')

    await wrapper.find('[data-testid="mentions-toggle"]').trigger('click')
    const items = wrapper.findAll('[data-testid^="mention-item-"]')
    expect(items).toHaveLength(2)
    // свежие ответы сверху
    expect(items[0].attributes('href')).toBe('/threads/8#post-32')
    expect(items[0].text()).toContain('Расписание сессии')
    expect(items[1].attributes('href')).toBe('/threads/7#post-31')
    expect(items[1].text()).toContain('Смотри >>31 и думай')

    // прочитанный ответ уходит из счётчика и из списка
    await items[0].trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="mentions-count"]').text()).toBe('+01')
    const seen = JSON.parse(localStorageMock.getItem('bmstud-mentions-seen') ?? '[]')
    expect(seen).toContain(32)
  })

  it('adds and removes a tripcode through localStorage', async () => {
    vi.mocked(getMentions).mockResolvedValue({
      tripcode: TRIP,
      count: 0,
      mentions: [],
    })
    const wrapper = await mountBeacon()
    await wrapper.find('[data-testid="mentions-toggle"]').trigger('click')

    await wrapper.find('[data-testid="mentions-trip-input"]').setValue(TRIP)
    await wrapper.find('[data-testid="mentions-add"]').trigger('submit')
    await flushPromises()

    expect(JSON.parse(localStorageMock.getItem('bmstud-identities') ?? '[]')).toContain(
      TRIP,
    )
    expect(wrapper.find('[data-testid="mentions-trips"]').text()).toContain(TRIP)

    await wrapper.find(`[data-testid="mentions-remove-${TRIP}"]`).trigger('click')
    expect(
      JSON.parse(localStorageMock.getItem('bmstud-identities') ?? '[]'),
    ).not.toContain(TRIP)
    expect(wrapper.find('[data-testid="mentions-trips"]').exists()).toBe(false)
  })

  it('refuses to store a raw "Имя#секрет"', async () => {
    const wrapper = await mountBeacon()
    await wrapper.find('[data-testid="mentions-toggle"]').trigger('click')

    await wrapper.find('[data-testid="mentions-trip-input"]').setValue('Имя#sekret')
    await wrapper.find('[data-testid="mentions-add"]').trigger('submit')

    expect(localStorageMock.getItem('bmstud-identities')).toBeNull()
    expect(wrapper.find('[data-testid="mentions-reject"]').exists()).toBe(true)
    expect(getMentions).not.toHaveBeenCalled()
  })

  it('shows a dash and hides the list when the api fails', async () => {
    localStorageMock.setItem('bmstud-identities', JSON.stringify([TRIP]))
    vi.mocked(getMentions).mockRejectedValue(new Error('network down'))
    const wrapper = await mountBeacon()

    expect(wrapper.find('[data-testid="mentions-count"]').text()).toBe('—')
    await wrapper.find('[data-testid="mentions-toggle"]').trigger('click')
    expect(wrapper.find('[data-testid="mentions-list"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mentions-failed"]').exists()).toBe(true)
  })
})

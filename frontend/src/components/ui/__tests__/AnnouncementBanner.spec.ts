import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const sessionStorageMock = (() => {
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
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock })

vi.mock('@/api/announcements', () => ({
  fetchActiveAnnouncements: vi.fn(),
}))

import AnnouncementBanner from '@/components/ui/AnnouncementBanner.vue'
import { fetchActiveAnnouncements } from '@/api/announcements'

const DISMISSED_KEY = 'bmstud-announcement-dismissed'

function announcement(id: number, text: string) {
  return { id, text }
}

async function mountBanner() {
  const wrapper = mount(AnnouncementBanner)
  await flushPromises()
  await flushPromises()
  return wrapper
}

function dismissedIds(): number[] {
  return JSON.parse(sessionStorageMock.getItem(DISMISSED_KEY) ?? '[]')
}

describe('AnnouncementBanner', () => {
  beforeEach(() => {
    sessionStorageMock.clear()
    vi.mocked(fetchActiveAnnouncements).mockReset()
  })

  it('renders the announcement text', async () => {
    vi.mocked(fetchActiveAnnouncements).mockResolvedValue([
      announcement(7, 'Кафедра собралась в 18:30'),
    ])
    const wrapper = await mountBanner()

    expect(fetchActiveAnnouncements).toHaveBeenCalled()
    const banner = wrapper.find('[data-testid="announcement-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Кафедра собралась в 18:30')
    expect(banner.find('[data-testid="announcement-text"]').text()).toBe(
      'Кафедра собралась в 18:30',
    )
    expect(banner.attributes('aria-live')).toBe('polite')
  })

  it('renders nothing when there are no announcements', async () => {
    vi.mocked(fetchActiveAnnouncements).mockResolvedValue([])
    const wrapper = await mountBanner()

    expect(wrapper.find('[data-testid="announcement-banner"]').exists()).toBe(
      false,
    )
  })

  it('stays silent when the api fails', async () => {
    vi.mocked(fetchActiveAnnouncements).mockRejectedValue(new Error('сеть лежит'))
    const wrapper = await mountBanner()

    expect(wrapper.find('[data-testid="announcement-banner"]').exists()).toBe(
      false,
    )
    expect(wrapper.text()).toBe('')
  })

  it('remembers the dismissal in sessionStorage and hides the banner', async () => {
    vi.mocked(fetchActiveAnnouncements).mockResolvedValue([
      announcement(7, 'Собрание кафедры'),
    ])
    const wrapper = await mountBanner()

    await wrapper.find('[data-testid="announcement-dismiss"]').trigger('click')

    expect(dismissedIds()).toEqual([7])
    expect(wrapper.find('[data-testid="announcement-banner"]').exists()).toBe(
      false,
    )
  })

  it('switches between several announcements with the dots', async () => {
    vi.mocked(fetchActiveAnnouncements).mockResolvedValue([
      announcement(1, 'Первое объявление'),
      announcement(2, 'Второе объявление'),
      announcement(3, 'Третье объявление'),
    ])
    const wrapper = await mountBanner()

    const dots = wrapper.findAll('[data-testid^="announcement-dot-"]')
    expect(dots).toHaveLength(3)
    expect(wrapper.find('[data-testid="announcement-text"]').text()).toBe(
      'Первое объявление',
    )

    await wrapper.find('[data-testid="announcement-dot-1"]').trigger('click')
    expect(wrapper.find('[data-testid="announcement-text"]').text()).toBe(
      'Второе объявление',
    )
    expect(dots[0].attributes('aria-pressed')).toBe('false')
    expect(dots[1].attributes('aria-pressed')).toBe('true')
  })

  it('advances to the next announcement after a dismissal', async () => {
    vi.mocked(fetchActiveAnnouncements).mockResolvedValue([
      announcement(1, 'Первое объявление'),
      announcement(2, 'Второе объявление'),
    ])
    const wrapper = await mountBanner()

    await wrapper.find('[data-testid="announcement-dismiss"]').trigger('click')

    expect(dismissedIds()).toEqual([1])
    expect(wrapper.find('[data-testid="announcement-text"]').text()).toBe(
      'Второе объявление',
    )

    await wrapper.find('[data-testid="announcement-dismiss"]').trigger('click')
    expect(dismissedIds()).toEqual([1, 2])
    expect(wrapper.find('[data-testid="announcement-banner"]').exists()).toBe(
      false,
    )
  })

  it('skips announcements dismissed earlier in the session', async () => {
    sessionStorageMock.setItem(DISMISSED_KEY, JSON.stringify([2]))
    vi.mocked(fetchActiveAnnouncements).mockResolvedValue([
      announcement(1, 'Первое объявление'),
      announcement(2, 'Скрытое объявление'),
    ])
    const wrapper = await mountBanner()

    expect(wrapper.text()).toContain('Первое объявление')
    expect(wrapper.text()).not.toContain('Скрытое объявление')
    expect(wrapper.findAll('[data-testid^="announcement-dot-"]')).toHaveLength(0)
  })
})

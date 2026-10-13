import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
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

vi.mock('@/composables/useGsap', () => ({
  gsap: { from: vi.fn(), to: vi.fn(), fromTo: vi.fn(), set: vi.fn() },
  ScrollTrigger: {},
  Flip: {},
  prefersReducedMotion: () => true,
  isTouchDevice: () => false,
}))
vi.mock('@/composables/usePageMorph', () => ({
  captureMorph: vi.fn(),
  playMorph: vi.fn(),
  clearMorph: vi.fn(),
}))

vi.mock('@/api/boards', () => ({
  listBoards: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/api/threads', () => ({
  getThread: vi.fn(),
  listThreads: vi.fn(),
  createThread: vi.fn(),
  listRecentThreads: vi.fn(),
}))
vi.mock('@/api/telemetry', () => ({
  getTelemetry: vi.fn(),
}))

import HomeView from '@/views/HomeView.vue'
import { listRecentThreads } from '@/api/threads'
import { getTelemetry } from '@/api/telemetry'

function thread(id: number, title: string, board: string) {
  return {
    id,
    board,
    title,
    is_pinned: false,
    is_locked: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    bumped_at: new Date().toISOString(),
    reply_count: 3,
  }
}

describe('HomeView — recent transmissions', () => {
  let wrapper: Awaited<ReturnType<typeof mountHome>>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(listRecentThreads).mockResolvedValue([
      thread(7, 'Срочно про ИУ7', 'b'),
      thread(8, 'Расписание сессии', 'study'),
    ])
  })

  afterEach(() => wrapper?.unmount())

  it('shows the hero explanation and CTA', async () => {
    wrapper = await mountHome()
    expect(wrapper.text()).toContain('Доски — узлы сети')
    expect(wrapper.find('.hero-cta').exists()).toBe(true)
  })

  it('lists recent threads with their board', async () => {
    wrapper = await mountHome()
    const rows = wrapper.findAll('[data-testid="thread-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Срочно про ИУ7')
    expect(rows[0].text()).toContain('/b/')
    expect(rows[1].text()).toContain('/study/')
  })
})

describe('HomeView — telemetry rail', () => {
  const telemetry = {
    boards: 4,
    threads: 13,
    posts: 63,
    attachments: 5,
    last_24h: { posts: 3, threads: 1 },
    busiest_board: { slug: 'b', name: 'Разное', posts: 40 },
    generated_at: '2026-10-13T12:00:00Z',
  }

  let wrapper: Awaited<ReturnType<typeof mountHome>>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(listRecentThreads).mockResolvedValue([])
    vi.mocked(getTelemetry).mockResolvedValue(telemetry)
  })

  afterEach(() => wrapper?.unmount())

  it('renders the telemetry cells from the api', async () => {
    wrapper = await mountHome()
    expect(getTelemetry).toHaveBeenCalled()
    const rail = wrapper.find('[data-testid="telemetry-rail"]')
    expect(rail.exists()).toBe(true)
    expect(rail.attributes('aria-label')).toBe('Сетевая телеметрия')

    const cell = (key: string) =>
      wrapper.find(`[data-testid="telemetry-cell-${key}"]`)
    expect(cell('boards').text()).toBe('РАЗДЕЛЫ04')
    expect(cell('threads').text()).toBe('ТРЕДЫ013')
    expect(cell('posts').text()).toBe('СООБЩЕНИЯ063')
    expect(cell('day').text()).toBe('24Ч+003')
    expect(cell('active').text()).toBe('АКТИВ/b/')

    expect(cell('boards').attributes('title')).toBe('Активные разделы: 4')
    expect(cell('active').attributes('aria-label')).toBe(
      'Самый активный раздел: /b/ — 40 сообщений',
    )
  })

  it('does not render the rail when the telemetry api fails', async () => {
    vi.mocked(getTelemetry).mockRejectedValue(new Error('network down'))
    wrapper = await mountHome()
    expect(wrapper.find('[data-testid="telemetry-rail"]').exists()).toBe(false)
    expect(wrapper.find('.hero-cta').exists()).toBe(true)
  })
})

async function mountHome() {
  const r = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  const w = mount(HomeView, {
    attachTo: document.body,
    global: { plugins: [createPinia(), r] },
  })
  await flushPromises()
  await flushPromises()
  return w
}

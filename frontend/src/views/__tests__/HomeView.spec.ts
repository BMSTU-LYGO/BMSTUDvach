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

import HomeView from '@/views/HomeView.vue'
import { listRecentThreads } from '@/api/threads'

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

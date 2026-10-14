import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

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
  getBoard: vi.fn(),
}))
vi.mock('@/api/posts', () => ({
  createPost: vi.fn(),
  createReport: vi.fn(),
}))
vi.mock('@/api/threads', () => ({
  getThread: vi.fn(),
  listThreads: vi.fn(),
  createThread: vi.fn(),
  listRecentThreads: vi.fn(),
}))

import BoardView from '@/views/BoardView.vue'
import { getBoard } from '@/api/boards'
import { listThreads } from '@/api/threads'
import { useForumStore } from '@/stores/forum'
import type { Board, Paginated, ThreadSummary } from '@/types'

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

function thread(id: number, title: string, isPinned = false): ThreadSummary {
  return {
    id,
    board: 'b',
    title,
    is_pinned: isPinned,
    is_locked: false,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    bumped_at: '2026-10-10T10:00:00Z',
    reply_count: id,
  }
}

function board(rules: string): Board {
  return {
    id: 1,
    slug: 'b',
    name: 'Разное',
    description: 'Обо всё',
    rules,
    is_active: true,
    order: 0,
    thread_count: 2,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  }
}

function paginated(results: ThreadSummary[], page: number, pages: number) {
  return Promise.resolve<Paginated<ThreadSummary>>({
    count: results.length,
    page,
    pages,
    page_size: 20,
    results,
  })
}

const PAGE_ONE = [thread(1, 'Первый сигнал'), thread(2, 'Второй сигнал')]
// pinned threads lead every page on the server — the client concatenates
// the pages exactly as they arrive
const PAGE_TWO = [thread(3, 'Третий сигнал', true), thread(4, 'Четвёртый сигнал')]
const PAGE_THREE = [thread(5, 'Последний сигнал')]

function servePages() {
  vi.mocked(listThreads).mockImplementation((_slug, _order, page = 1) => {
    if (page === 2) return paginated(PAGE_TWO, 2, 3)
    if (page === 3) return paginated(PAGE_THREE, 3, 3)
    return paginated(PAGE_ONE, 1, 3)
  })
}

async function mountBoard(slug = 'b') {
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/threads/:threadId', component: { template: '<div />' } },
    ],
  })
  const wrapper = mount(BoardView, {
    props: { boardSlug: slug },
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  await flushPromises()
  return { wrapper, pinia, store: useForumStore(pinia) }
}

function titles(wrapper: Awaited<ReturnType<typeof mountBoard>>['wrapper']) {
  return wrapper.findAll('[data-testid="thread-row"]').map((row) => row.text())
}

describe('BoardView — paginated thread feed', () => {
  beforeEach(() => {
    localStorage.clear()
    servePages()
    vi.mocked(getBoard).mockResolvedValue(board(''))
  })

  afterEach(() => {
    vi.mocked(listThreads).mockReset()
  })

  it('renders the first page of the board listing', async () => {
    const { wrapper } = await mountBoard()
    expect(titles(wrapper)).toHaveLength(2)
    expect(titles(wrapper)[0]).toContain('Первый сигнал')
    expect(titles(wrapper)[1]).toContain('Второй сигнал')
    expect(listThreads).toHaveBeenCalledWith('b', 'bump', 1)
    expect(wrapper.find('[data-testid="load-more-button"]').exists()).toBe(true)
  })

  it('appends the next page when the load-more node is clicked', async () => {
    const { wrapper, store } = await mountBoard()
    await wrapper.find('[data-testid="load-more-button"]').trigger('click')
    await flushPromises()

    expect(listThreads).toHaveBeenLastCalledWith('b', 'bump', 2)
    const rows = titles(wrapper)
    expect(rows).toHaveLength(4)
    // page two arrives in server order — pinned threads are not re-sorted
    expect(rows[2]).toContain('Третий сигнал')
    expect(rows[3]).toContain('Четвёртый сигнал')
    expect(store.threadList.page).toBe(2)
    expect(store.threadList.hasMore).toBe(true)
    expect(store.threadList.threads).toHaveLength(4)
  })

  it('walks the pager until the last page and then closes the node', async () => {
    const { wrapper } = await mountBoard()
    const button = '[data-testid="load-more-button"]'

    await wrapper.find(button).trigger('click')
    await flushPromises()
    await wrapper.find(button).trigger('click')
    await flushPromises()

    expect(titles(wrapper)).toHaveLength(5)
    expect(titles(wrapper)[4]).toContain('Последний сигнал')
    expect(listThreads).toHaveBeenLastCalledWith('b', 'bump', 3)

    // the last page replaces the button with the terminal label
    expect(wrapper.find(button).exists()).toBe(false)
    expect(wrapper.find('[data-testid="load-more-done"]').text()).toContain(
      'сигнал передан полностью',
    )
    expect(listThreads).toHaveBeenCalledTimes(3)
  })

  it('shows the honest terminal label once every page is loaded', async () => {
    vi.mocked(listThreads).mockImplementation((_slug, _order) =>
      paginated(PAGE_ONE, 1, 1),
    )
    const { wrapper } = await mountBoard()

    expect(wrapper.find('[data-testid="load-more-button"]').exists()).toBe(false)
    const done = wrapper.find('[data-testid="load-more-done"]')
    expect(done.exists()).toBe(true)
    expect(done.text()).toContain('сигнал передан полностью')
    expect(wrapper.find('[data-testid="load-more"]').attributes('aria-busy')).toBe(
      'false',
    )
  })

  it('keeps the node out of the empty state', async () => {
    vi.mocked(listThreads).mockImplementation((_slug, _order) =>
      paginated([], 1, 1),
    )
    const { wrapper } = await mountBoard()

    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="load-more"]').exists()).toBe(false)
  })

  it('ignores repeat clicks while a page is still in flight', async () => {
    const { wrapper } = await mountBoard()
    let release!: (value: Paginated<ThreadSummary>) => void
    vi.mocked(listThreads).mockImplementationOnce(
      () =>
        new Promise<Paginated<ThreadSummary>>((resolve) => {
          release = resolve
        }),
    )

    const button = wrapper.find('[data-testid="load-more-button"]')
    await button.trigger('click')
    await button.trigger('click')
    await flushPromises()

    expect(listThreads).toHaveBeenCalledTimes(2)
    expect(titles(wrapper)).toHaveLength(2)
    expect(wrapper.find('[data-testid="load-more"]').attributes('aria-busy')).toBe(
      'true',
    )

    release({
      count: PAGE_TWO.length,
      page: 2,
      pages: 3,
      page_size: 20,
      results: PAGE_TWO,
    })
    await flushPromises()
    expect(titles(wrapper)).toHaveLength(4)
  })

  it('refetches page one when the order lens changes', async () => {
    const { wrapper } = await mountBoard()
    vi.mocked(listThreads).mockImplementation((_slug, _order) =>
      paginated(PAGE_ONE, 1, 1),
    )

    await wrapper
      .find('button[data-order="replies"]')
      .trigger('click')
    await flushPromises()

    expect(listThreads).toHaveBeenLastCalledWith('b', 'replies', 1)
    expect(titles(wrapper)).toHaveLength(2)
    expect(wrapper.find('[data-testid="load-more-done"]').exists()).toBe(true)
  })

  it('keeps the loaded rows and reports the error when a page fails', async () => {
    const { wrapper } = await mountBoard()
    vi.mocked(listThreads).mockRejectedValueOnce(new Error('сеть недоступна'))

    await wrapper.find('[data-testid="load-more-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true)
  })
})

describe('BoardView — board rules', () => {
  beforeEach(() => {
    localStorage.clear()
    servePages()
    vi.mocked(getBoard).mockResolvedValue(board(''))
  })

  afterEach(() => {
    vi.mocked(listThreads).mockReset()
    vi.mocked(getBoard).mockReset()
  })

  it('renders the rules block when the board has rules', async () => {
    vi.mocked(getBoard).mockResolvedValue(board('Без спама.\nБез дублей.'))
    const { wrapper } = await mountBoard()

    const block = wrapper.find('[data-testid="board-rules"]')
    expect(block.exists()).toBe(true)
    expect(block.text()).toContain('ПРАВИЛА РАЗДЕЛА')
    expect(block.text()).toContain('Без спама.')
  })

  it('hides the rules block when the board has none', async () => {
    const { wrapper } = await mountBoard()

    expect(wrapper.find('[data-testid="board-rules"]').exists()).toBe(false)
  })

  it('collapses rules longer than three lines behind an aria-expanded toggle', async () => {
    vi.mocked(getBoard).mockResolvedValue(board('раз\nдва\nтри\nчетыре'))
    const { wrapper } = await mountBoard()

    const toggle = wrapper.find('[data-testid="board-rules-toggle"]')
    expect(toggle.exists()).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })
})

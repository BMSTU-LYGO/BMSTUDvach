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
  // Единая точка правды «можно ли двигать» (см. `useGsap`): в этой подмене
  // движение выключено — как и при `prefers-reduced-motion: reduce`.
  motionAllowed: () => false,
  useMotionPreference: () => ({ value: false }),
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
import BoardViewSource from '@/views/BoardView.vue?raw'
import ViewCommutatorSource from '@/components/thread/ViewCommutator.vue?raw'
import { ApiRequestError } from '@/api/client'
import { getBoard } from '@/api/boards'
import { listThreads, createThread } from '@/api/threads'
import { useForumStore } from '@/stores/forum'
import { onSceneEvent } from '@/three/sceneState'
import { captureMorph, playMorph } from '@/composables/usePageMorph'
import type { Board, Paginated, ThreadDetail, ThreadSummary } from '@/types'

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

async function mountBoard(slug = 'b', options: { at?: string } = {}) {
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/threads/:threadId', component: { template: '<div />' } },
      { path: '/boards/:boardSlug', component: { template: '<div />' } },
    ],
  })
  // the drafts panel hands a launch buffer over as `/boards/<slug>?launch=1`
  if (options.at) await router.push(options.at)
  const wrapper = mount(BoardView, {
    props: { boardSlug: slug },
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  await flushPromises()
  return { wrapper, pinia, router, store: useForumStore(pinia) }
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

describe('BoardView — board rules (P3-T4: the rule sheet)', () => {
  beforeEach(() => {
    localStorage.clear()
    servePages()
    vi.mocked(getBoard).mockResolvedValue(board(''))
  })

  afterEach(() => {
    vi.mocked(listThreads).mockReset()
    vi.mocked(getBoard).mockReset()
  })

  it('renders the rules as a margin note when the board has rules', async () => {
    vi.mocked(getBoard).mockResolvedValue(board('Без спама.\nБез дублей.'))
    const { wrapper } = await mountBoard()

    const note = wrapper.find('[data-testid="board-rules"]')
    expect(note.exists()).toBe(true)
    // the kicker of the note, not an accordion head
    expect(note.text()).toContain('Правила записа')
    expect(note.text()).toContain('Без спама.')
  })

  it('hides the rules note when the board has none', async () => {
    const { wrapper } = await mountBoard()

    expect(wrapper.find('[data-testid="board-rules"]').exists()).toBe(false)
  })

  it('keeps a one-line rule a still note — no marker, no gesture', async () => {
    vi.mocked(getBoard).mockResolvedValue(board('Без спама.'))
    const { wrapper } = await mountBoard()

    const note = wrapper.find('[data-testid="board-rules"]')
    expect(note.find('[data-testid="board-rules-open"]').exists()).toBe(false)
    expect(note.find('.rule-sheet__lead--still').text()).toBe('Без спама.')
  })

  it('opens a multi-line rule sheet with one gesture on the marker', async () => {
    vi.mocked(getBoard).mockResolvedValue(board('раз\nдва\nтри\nчетыре'))
    const { wrapper } = await mountBoard()

    const marker = wrapper.find('[data-testid="board-rules-open"]')
    expect(marker.exists()).toBe(true)
    expect(marker.attributes('aria-expanded')).toBe('false')
    // the rest of the note waits behind the mask, out of the a11y tree
    expect(wrapper.find('#rule-sheet-more').attributes('aria-hidden')).toBe('true')

    await marker.trigger('click')
    expect(marker.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('#rule-sheet-more').attributes('aria-hidden')).toBeUndefined()
    expect(wrapper.find('.rule-sheet--open').exists()).toBe(true)

    await marker.trigger('click')
    expect(marker.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.rule-sheet--open').exists()).toBe(false)
  })

  it('opens the same note from its first line — one gesture, two surfaces', async () => {
    vi.mocked(getBoard).mockResolvedValue(board('раз\nдва'))
    const { wrapper } = await mountBoard()

    // the lead line is a convenience pointer target, never a second tab stop
    const lead = wrapper.find('.rule-sheet__lead')
    expect(lead.attributes('tabindex')).toBe('-1')

    await lead.trigger('click')
    expect(wrapper.find('[data-testid="board-rules-open"]').attributes('aria-expanded')).toBe(
      'true',
    )
  })

  it('never spells out an accordion — no «показать/свернуть» button anywhere', () => {
    expect(BoardViewSource).not.toContain('показать')
    expect(BoardViewSource).not.toContain('свернуть')
    expect(BoardViewSource).not.toContain('board-rules-toggle')
    expect(BoardViewSource).not.toContain('view-switch')
    expect(BoardViewSource).not.toContain('-webkit-line-clamp')
  })
})

describe('BoardView — the view commutator (P3-T4)', () => {
  beforeEach(() => {
    localStorage.clear()
    servePages()
    vi.mocked(getBoard).mockResolvedValue(board(''))
  })

  afterEach(() => {
    vi.mocked(listThreads).mockReset()
  })

  it('is one node, not two pills, and it flips the board view', async () => {
    const { wrapper } = await mountBoard()

    const nodes = wrapper.findAll('button')
    const commutators = wrapper.findAll('[data-testid="view-commutator"]')
    expect(commutators).toHaveLength(1)
    // no second toggle for the same binary state — only the node speaks of the cluster
    expect(nodes.filter((n) => n.attributes('aria-label')?.toLowerCase().includes('каталог'))).toHaveLength(1)
    expect(commutators[0].attributes('aria-pressed')).toBe('false')
    expect(commutators[0].attributes('data-mode')).toBe('list')

    await commutators[0].trigger('click')
    await flushPromises()

    const after = wrapper.find('[data-testid="view-commutator"]')
    expect(after.attributes('aria-pressed')).toBe('true')
    expect(after.attributes('data-mode')).toBe('catalog')
    expect(wrapper.find('.catalog-grid').exists()).toBe(true)
    // the choice survives like it always did — same key, same storage
    expect(localStorage.getItem('board-view-mode')).toBe('catalog')

    await wrapper.find('[data-testid="view-commutator"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.threads-list').exists()).toBe(true)
    expect(localStorage.getItem('board-view-mode')).toBe('list')
  })

  it('names the view you are in and the one the click brings', async () => {
    const { wrapper } = await mountBoard()
    const node = wrapper.find('[data-testid="view-commutator"]')

    expect(node.attributes('title')).toBe('Список тредов — переключить на каталог узлов')
    expect(node.attributes('aria-label')).toBe('Список тредов — переключить на каталог узлов')

    await node.trigger('click')
    const flipped = wrapper.find('[data-testid="view-commutator"]')
    expect(flipped.attributes('title')).toBe('Каталог узлов — переключить на список тредов')
  })

  it('morphs the glyph instead of swapping two icons', () => {
    // one svg, four hairlines, a real transform morph — not two glyphs
    expect(ViewCommutatorSource.match(/<svg/g)?.length).toBe(1)
    // v-for over ROWS: one <rect> template blooms into four hairlines
    expect(ViewCommutatorSource.match(/<rect/g)?.length).toBe(1)
    expect(ViewCommutatorSource.match(/side: '(left|right)'/g)?.length).toBe(4)
    expect(ViewCommutatorSource).toContain('transform-box: fill-box')
    expect(ViewCommutatorSource).toContain('scale(0.41667, 3.33333)')
    // left rows keep their left edge, right rows keep their right one
    expect(ViewCommutatorSource).toContain('transform-origin: 0% 50%')
    expect(ViewCommutatorSource).toContain('transform-origin: 100% 50%')
    // reduced motion: the morph is instant
    const reduced = ViewCommutatorSource.slice(
      ViewCommutatorSource.indexOf('@media (prefers-reduced-motion: reduce)'),
    )
    expect(reduced).toContain('transition: none')
  })
})

describe('BoardView — thread creation (transmit engine)', () => {
  const created: ThreadDetail = {
    ...thread(9, 'ИУ7 снова сломало'),
    posts: [],
  }

  beforeEach(() => {
    localStorage.clear()
    servePages()
    vi.mocked(getBoard).mockResolvedValue(board(''))
    vi.mocked(createThread).mockReset()
  })

  afterEach(() => {
    vi.mocked(listThreads).mockReset()
    vi.mocked(createThread).mockReset()
  })

  async function openBay() {
    const { wrapper } = await mountBoard()
    await wrapper.find('.launch-trigger').trigger('click')
    await wrapper.find('[data-testid="launch-title"]').setValue('ИУ7 снова сломало')
    await wrapper.find('[data-testid="signal-input"]').setValue('После обновления')
    return wrapper
  }

  /** The bay hands the stage back 620 ms after a parent-confirmed success. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 700))

  it('launches the thread, refetches the board and closes the bay', async () => {
    vi.mocked(createThread).mockResolvedValue(created)
    const wrapper = await openBay()
    const calls = vi.mocked(listThreads).mock.calls.length

    await wrapper.find('.transmit').trigger('click')
    await flushPromises()

    expect(createThread).toHaveBeenCalledWith('b', {
      title: 'ИУ7 снова сломало',
      body: 'После обновления',
      attachments: [],
    })
    // success re-reads the board the thread was launched into
    expect(vi.mocked(listThreads).mock.calls.length).toBe(calls + 1)
    expect(wrapper.find('[data-testid="launch-error"]').exists()).toBe(false)

    await settle()
    expect(wrapper.find('[data-testid="launch-bay"]').exists()).toBe(false)
  })

  it('keeps the bay open and renders a classified throttle refusal', async () => {
    vi.mocked(createThread).mockRejectedValue(
      new ApiRequestError(429, 'Request was throttled. Expected available in 3 seconds.'),
    )
    const wrapper = await openBay()

    await wrapper.find('.transmit').trigger('click')
    await flushPromises()

    // the structured refusal lands in the notice, not in an invented string
    const notice = wrapper.find('[data-testid="launch-error"]')
    expect(notice.text()).toContain('Слишком много сигналов. Повтор через 3 с.')
    expect(wrapper.find('[data-testid="transmit-notice-countdown"]').text()).toBe(
      'повтор через 3с',
    )
    // the refusal keeps the form intact — no launch, no draft wipe
    expect(
      (wrapper.find('[data-testid="launch-title"]').element as HTMLInputElement).value,
    ).toBe('ИУ7 снова сломало')
    expect(wrapper.find('[data-testid="launch-bay"]').exists()).toBe(true)
  })

  it('repeats the very same attempt when the notice asks for a retry', async () => {
    vi.mocked(createThread).mockRejectedValueOnce(
      new ApiRequestError(500, 'Server error'),
    )
    vi.mocked(createThread).mockResolvedValueOnce(created)
    const wrapper = await openBay()

    await wrapper.find('.transmit').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="transmit-notice-retry"]').exists()).toBe(true)

    await wrapper.find('[data-testid="transmit-notice-retry"]').trigger('click')
    await flushPromises()

    expect(createThread).toHaveBeenCalledTimes(2)
    expect(createThread).toHaveBeenLastCalledWith('b', {
      title: 'ИУ7 снова сломало',
      body: 'После обновления',
      attachments: [],
    })
    expect(wrapper.find('[data-testid="launch-error"]').exists()).toBe(false)
  })

  it('paints the title surface red when the API names the title field', async () => {
    vi.mocked(createThread).mockRejectedValue(
      new ApiRequestError(400, 'Validation error', {
        title: ['Такой тред уже есть.'],
      }),
    )
    const wrapper = await openBay()

    await wrapper.find('.transmit').trigger('click')
    await flushPromises()

    expect(wrapper.find('.title-surface').classes()).toContain('title-surface--invalid')
    expect(wrapper.find('[data-testid="launch-title"]').attributes('aria-invalid')).toBe(
      'true',
    )
    expect(wrapper.find('[data-testid="signal-input"]').attributes('aria-invalid')).toBeUndefined()
  })
})

describe('BoardView — the launch stage (P3-T2)', () => {
  /** Pull one CSS rule out of the SFC source (jsdom never applies scoped CSS). */
  function ruleBlock(selector: string): string {
    const start = BoardViewSource.indexOf(`${selector} {`)
    return start === -1 ? '' : BoardViewSource.slice(start, BoardViewSource.indexOf('}', start))
  }

  beforeEach(() => {
    localStorage.clear()
    servePages()
    vi.mocked(getBoard).mockResolvedValue(board(''))
    vi.mocked(createThread).mockReset()
    vi.mocked(captureMorph).mockClear()
    vi.mocked(playMorph).mockClear()
  })

  afterEach(() => {
    vi.mocked(listThreads).mockReset()
    vi.mocked(createThread).mockReset()
  })

  it('recedes the board feed while the bay holds the stage', async () => {
    const { wrapper } = await mountBoard()
    const feed = wrapper.find('.threads-list')
    expect(feed.classes()).not.toContain('board-feed--receded')
    // the old dim-flag is gone: this is a class now, not a data attribute
    expect(feed.attributes('data-staged')).toBeUndefined()

    await wrapper.find('.launch-trigger').trigger('click')
    await flushPromises()
    expect(wrapper.find('.threads-list').classes()).toContain('board-feed--receded')

    // closing hands the stage back to the list
    await wrapper.find('.launch-bay__close').trigger('click')
    await flushPromises()
    expect(wrapper.find('.threads-list').classes()).not.toContain('board-feed--receded')
  })

  it('recedes the cluster grid too — the recede lives on the feed wrapper', async () => {
    const { wrapper } = await mountBoard()
    await wrapper.find('[data-testid="view-commutator"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.catalog-grid').exists()).toBe(true)
    expect(wrapper.find('.catalog-grid').classes()).not.toContain('board-feed--receded')

    await wrapper.find('.launch-trigger').trigger('click')
    await flushPromises()
    expect(wrapper.find('.catalog-grid').classes()).toContain('board-feed--receded')
  })

  it('recedes with opacity + pull-back on the reveal tempo — no blur on a long list', () => {
    const receded = ruleBlock('.board-feed--receded')
    expect(receded).toContain('opacity: 0.25')
    expect(receded).toContain('transform: scale(0.985)')
    expect(receded).toContain('pointer-events: none')
    expect(receded).not.toContain('blur')
    // the recede shares the tempo of the bay that takes the stage and leaves
    // with the curve of an exit — the duration comes from the role, not from
    // a number written by hand
    expect(BoardViewSource).toContain('opacity var(--motion-reveal-duration) var(--ease-exit)')
    expect(BoardViewSource).toContain('transform var(--motion-reveal-duration) var(--ease-exit)')
    expect(BoardViewSource).not.toMatch(/transition:\s*(opacity|transform)\s+\d/)
    // reduced motion: the board recedes, it just does not drift
    const reduced = BoardViewSource.slice(
      BoardViewSource.indexOf('@media (prefers-reduced-motion: reduce)'),
    )
    expect(reduced).toContain('transition: none')
  })

  it('steps the trigger aside for the shared-element flight', async () => {
    const { wrapper } = await mountBoard()
    const trigger = wrapper.find('.launch-trigger')
    expect(trigger.classes()).not.toContain('launch-trigger--staged')

    await trigger.trigger('click')
    await flushPromises()

    // the sheet leaves the button's place — the button itself is gone
    const staged = wrapper.find('.launch-trigger')
    expect(staged.classes()).toContain('launch-trigger--staged')
    expect(staged.attributes('aria-hidden')).toBe('true')
    expect(staged.attributes('tabindex')).toBe('-1')
    expect(ruleBlock('.launch-trigger--staged')).toContain('opacity: 0')
    expect(ruleBlock('.launch-trigger--staged')).toContain('pointer-events: none')

    await wrapper.find('.launch-bay__close').trigger('click')
    await flushPromises()

    const back = wrapper.find('.launch-trigger')
    expect(back.classes()).not.toContain('launch-trigger--staged')
    expect(back.attributes('aria-hidden')).toBeUndefined()
    expect(back.attributes('tabindex')).toBe('0')
  })

  it('morphs the bay scene title out of the trigger geometry (0.45s)', async () => {
    const { wrapper } = await mountBoard()
    await wrapper.find('.launch-trigger').trigger('click')
    await flushPromises()

    // the trigger is the shared element the flight starts from
    const [source, sourceId] = vi.mocked(captureMorph).mock.calls[0]
    expect(source).toBe(wrapper.find('.launch-trigger').element)
    expect(sourceId).toBe('launch-bay')

    // the scene title (kicker + /slug/) is what lands on the sheet; the
    // board title also morphs on mount, so pick the bay call out of them
    const bayCall = vi.mocked(playMorph).mock.calls.find((call) => call[1] === 'launch-bay')
    expect(bayCall).toBeTruthy()
    expect(bayCall![0]).toBe(wrapper.find('[data-testid="launch-scene-title"]').element)
    expect(bayCall![0]).not.toBe(wrapper.find('[data-testid="launch-bay"]').element)
    expect(bayCall![2]).toEqual({ duration: 0.45 })
  })

  it('does not let the morph steal the title focus', async () => {
    const { wrapper } = await mountBoard()
    await wrapper.find('.launch-trigger').trigger('click')
    expect(document.activeElement).toBe(wrapper.find('[data-testid="launch-title"]').element)
  })

  it('opens at once, focused, when the morph cannot run', async () => {
    // reduced motion (or no GSAP) makes playMorph a no-op — the stage must
    // not depend on it: the sheet is there, titled and focused
    const media = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ matches: query.includes('reduce'), media: query }) as MediaQueryList,
    )
    const { wrapper } = await mountBoard()
    await wrapper.find('.launch-trigger').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="launch-bay"]').exists()).toBe(true)
    expect(document.activeElement).toBe(wrapper.find('[data-testid="launch-title"]').element)
    expect(wrapper.find('.threads-list').classes()).toContain('board-feed--receded')
    media.mockRestore()
  })

  it('tells the scene a composer surface took the stage, and released it', async () => {
    vi.mocked(createThread).mockResolvedValue({ ...thread(9, 'ИУ7 снова сломало'), posts: [] })
    const { wrapper } = await mountBoard()
    const seen: string[] = []
    const off = onSceneEvent((ev) => seen.push(ev.type))

    await wrapper.find('.launch-trigger').trigger('click')
    await wrapper.find('[data-testid="launch-title"]').setValue('ИУ7 снова сломало')
    await wrapper.find('[data-testid="signal-input"]').setValue('После обновления')
    await wrapper.find('.transmit').trigger('click')
    await flushPromises()

    // the existing composer-focus gesture on open; the success signal is
    // untouched — thread-launch, no invented bay-open
    expect(seen).toEqual(['composer-focus', 'thread-launch'])
    off()
  })

  it('releases the scene signal when the bay is simply closed', async () => {
    const { wrapper } = await mountBoard()
    const seen: string[] = []
    const off = onSceneEvent((ev) => seen.push(ev.type))

    await wrapper.find('.launch-trigger').trigger('click')
    await flushPromises()
    await wrapper.find('.launch-bay__close').trigger('click')
    await flushPromises()

    expect(seen).toEqual(['composer-focus', 'composer-blur'])
    off()
  })
})

describe('BoardView — the launch query (P2-T3)', () => {
  beforeEach(() => {
    localStorage.clear()
    servePages()
    vi.mocked(getBoard).mockResolvedValue(board(''))
    vi.mocked(createThread).mockReset()
    vi.mocked(captureMorph).mockClear()
    vi.mocked(playMorph).mockClear()
  })

  afterEach(() => {
    vi.mocked(listThreads).mockReset()
    vi.mocked(createThread).mockReset()
  })

  it('opens the bay on a board mounted with ?launch=1 and drops the flag', async () => {
    const { wrapper, router } = await mountBoard('b', { at: '/boards/b?launch=1' })

    // the bay holds the stage, the board recedes behind it
    expect(wrapper.find('[data-testid="launch-bay"]').exists()).toBe(true)
    expect(wrapper.find('.threads-list').classes()).toContain('board-feed--receded')

    // the flag was consumed — a history replace, so a reload or a shared
    // URL does not reopen the bay by itself
    expect(router.currentRoute.value.query.launch).toBeUndefined()
    expect(router.currentRoute.value.fullPath).toBe('/boards/b')
  })

  it('restores the launch draft the home panel linked to', async () => {
    localStorageMock.setItem(
      'draft:launch-b',
      JSON.stringify({
        title: 'ИУ7 снова сломало',
        body: 'После обновления',
        files: [],
        timestamp: Date.now(),
      }),
    )

    const { wrapper } = await mountBoard('b', { at: '/boards/b?launch=1' })

    expect(
      (wrapper.find('[data-testid="launch-title"]').element as HTMLInputElement).value,
    ).toBe('ИУ7 снова сломало')
    expect(
      (wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value,
    ).toBe('После обновления')
  })

  it('opens the bay only once the board itself has had its morph frame', async () => {
    await mountBoard('b', { at: '/boards/b?launch=1' })

    const calls = vi.mocked(playMorph).mock.calls.map((call) => call[1])
    // the board title morphs first, the bay scene title follows it
    expect(calls).toEqual(['board:b', 'launch-bay'])
  })

  it('leaves the URL alone when there is no launch flag', async () => {
    const { wrapper, router } = await mountBoard('b', { at: '/boards/b' })

    expect(wrapper.find('[data-testid="launch-bay"]').exists()).toBe(false)
    expect(wrapper.find('.threads-list').classes()).not.toContain('board-feed--receded')
    expect(router.currentRoute.value.fullPath).toBe('/boards/b')
  })

  it('closes the bay without putting the flag back into the URL', async () => {
    const { wrapper, router } = await mountBoard('b', { at: '/boards/b?launch=1' })

    await wrapper.find('.launch-bay__close').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="launch-bay"]').exists()).toBe(false)
    // the flag was a request, not a state — closing hands the stage back
    // to the list without reviving it
    expect(router.currentRoute.value.query.launch).toBeUndefined()
    expect(router.currentRoute.value.fullPath).toBe('/boards/b')
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type DOMWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/client', () => ({ request: vi.fn() }))
vi.mock('@/api/boards', () => ({ listBoards: vi.fn() }))
vi.mock('@/api/search', async (importOriginal) => {
  // only the network call is stubbed — highlightRanges is pure and real
  const actual = await importOriginal<typeof import('@/api/search')>()
  return { ...actual, searchNetwork: vi.fn() }
})

import ScanLens from '../ScanLens.vue'
import { listBoards } from '@/api/boards'
import { searchNetwork, highlightRanges } from '@/api/search'
import { request } from '@/api/client'
import type { SearchResults } from '@/api/search'
import type { Board } from '@/types'

function mountLens(open = true) {
  return mount(ScanLens, {
    props: { open },
    attachTo: document.body,
    // keep teleported content inside the wrapper tree for assertions
    global: { stubs: { teleport: true } },
  })
}

const data: SearchResults = {
  query: 'сесси',
  threads: [
    {
      id: 4,
      board: 'study',
      title: 'Советы по сдаче сессии',
      is_pinned: true,
      is_locked: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      bumped_at: new Date().toISOString(),
      reply_count: 7,
    },
  ],
  posts: [
    {
      id: 28,
      thread: 10,
      thread_title: 'Оффтоп',
      is_op: false,
      snippet: '…сплетнями про сессию…',
    },
  ],
}

const boards: Board[] = [
  {
    id: 1,
    slug: 'study',
    name: 'Учёба',
    description: 'сессии и зачёты',
    is_active: true,
    order: 1,
    thread_count: 12,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    slug: 'b',
    name: 'Разное',
    description: 'всё остальное',
    is_active: true,
    order: 2,
    thread_count: 3,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

describe('ScanLens', () => {
  beforeEach(() => {
    vi.mocked(listBoards).mockReset()
    vi.mocked(listBoards).mockResolvedValue(boards)
    vi.mocked(searchNetwork).mockReset()
    vi.mocked(searchNetwork).mockResolvedValue(data)
  })

  function chip(
    wrapper: ReturnType<typeof mountLens>,
    board: string,
  ): DOMWrapper<HTMLElement> {
    return wrapper.find<HTMLElement>(
      `[data-testid="scan-board-chip"][data-board="${board}"]`,
    )
  }

  async function search(wrapper: ReturnType<typeof mountLens>) {
    await wrapper.find('[data-testid="scan-input"]').setValue('сесси')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()
  }

  it('renders closed when open=false', () => {
    const wrapper = mountLens(false)
    expect(wrapper.find('[data-testid="scan-lens"]').exists()).toBe(false)
  })

  it('searches on input and groups threads and posts', async () => {
    const wrapper = mountLens()
    const input = wrapper.find('[data-testid="scan-input"]')
    await input.setValue('сесси')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="scan-row"]')
    expect(rows).toHaveLength(2)
    expect(wrapper.text()).toContain('ТРЕДЫ')
    expect(wrapper.text()).toContain('ПОСТЫ')
    expect(rows[0].text()).toContain('Советы по сдаче сессии')
    expect(rows[1].text()).toContain('сплетнями про сессию')
  })

  it('shows the empty state when nothing matches', async () => {
    vi.mocked(searchNetwork).mockResolvedValue({ query: 'zzz', threads: [], posts: [] })
    const wrapper = mountLens()
    await wrapper.find('[data-testid="scan-input"]').setValue('zzz')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()
    expect(wrapper.text()).toContain('сеть молчит')
  })

  it('closes on Escape and navigates on Enter', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/threads/:id', name: 't', component: { template: '<div/>' } }],
    })
    void router
    const wrapper = mount(ScanLens, {
      props: { open: true },
      global: { plugins: [router], stubs: { teleport: true } },
      attachTo: document.body,
    })
    const input = wrapper.find('[data-testid="scan-input"]')
    await input.setValue('сесси')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()

    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.emitted('update:open')).toBeTruthy()
    expect(wrapper.emitted('update:open')![0]).toEqual([false])
    expect(router.currentRoute.value.fullPath).toBe('/threads/4')

    await wrapper.setProps({ open: true })
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update:open')!.at(-1)).toEqual([false])
  })

  it('renders a chip per board after the boards load', async () => {
    const wrapper = mountLens()
    await flushPromises()

    const chips = wrapper.findAll('[data-testid="scan-board-chip"]')
    expect(chips).toHaveLength(3)
    expect(chips.map((c) => c.attributes('data-board'))).toEqual(['', 'study', 'b'])
    expect(chip(wrapper, '').text()).toBe('ВСЕ')
    expect(chip(wrapper, 'study').text()).toBe('study')
    expect(chip(wrapper, '').attributes('aria-pressed')).toBe('true')
  })

  it('keeps only the ALL chip when the board list fails', async () => {
    vi.mocked(listBoards).mockRejectedValue(new Error('boom'))
    const wrapper = mountLens()
    await flushPromises()

    const chips = wrapper.findAll('[data-testid="scan-board-chip"]')
    expect(chips).toHaveLength(1)
    expect(chips[0].text()).toBe('ВСЕ')
    expect(chips[0].attributes('aria-pressed')).toBe('true')
  })

  it('re-runs the scan for the picked board', async () => {
    const wrapper = mountLens()
    await flushPromises()
    await search(wrapper)
    vi.mocked(searchNetwork).mockClear()

    await chip(wrapper, 'study').trigger('click')
    await flushPromises()

    expect(searchNetwork).toHaveBeenCalledWith('сесси', { board: 'study' })
    expect(chip(wrapper, 'study').attributes('aria-pressed')).toBe('true')
    expect(chip(wrapper, '').attributes('aria-pressed')).toBe('false')
  })

  it('drops the board scope when the ALL chip is picked', async () => {
    const wrapper = mountLens()
    await flushPromises()
    await search(wrapper)
    await chip(wrapper, 'study').trigger('click')
    await flushPromises()
    vi.mocked(searchNetwork).mockClear()

    await chip(wrapper, '').trigger('click')
    await flushPromises()

    const call = vi.mocked(searchNetwork).mock.calls.at(-1)
    expect(call?.[0]).toBe('сесси')
    expect(call?.[1]?.board).toBeFalsy()
    expect(chip(wrapper, '').attributes('aria-pressed')).toBe('true')
  })

  it('moves focus between chips with the arrow keys', async () => {
    const wrapper = mountLens()
    await flushPromises()
    chip(wrapper, '').element.focus()

    await wrapper.find('.scan__chips').trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(chip(wrapper, 'study').element)

    await wrapper.find('.scan__chips').trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(chip(wrapper, '').element)
  })

  it('forgets the picked board when the lens reopens', async () => {
    const wrapper = mountLens()
    await flushPromises()
    await chip(wrapper, 'study').trigger('click')
    await flushPromises()
    expect(chip(wrapper, 'study').attributes('aria-pressed')).toBe('true')

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await flushPromises()
    expect(chip(wrapper, '').attributes('aria-pressed')).toBe('true')
    expect(chip(wrapper, 'study').attributes('aria-pressed')).toBe('false')
  })
})

describe('search highlighting', () => {
  function marks(node: DOMWrapper<Element>) {
    return node.findAll('mark').map((m) => m.text())
  }

  async function type(
    wrapper: ReturnType<typeof mountLens>,
    value: string,
    hits: SearchResults = data,
  ) {
    vi.mocked(searchNetwork).mockResolvedValue(hits)
    await wrapper.find('[data-testid="scan-input"]').setValue(value)
    await flushPromises()
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()
    return wrapper.findAll('[data-testid="scan-row"]')
  }

  it('wraps the matching part of a title and a snippet in <mark>', async () => {
    const wrapper = mountLens()
    const rows = await type(wrapper, 'сесси', data)

    expect(rows).toHaveLength(2)
    expect(marks(rows[0])).toEqual(['сесси'])
    expect(rows[0].text()).toContain('Советы по сдаче сессии')
    expect(marks(rows[1])).toEqual(['сесси'])
    expect(rows[1].text()).toContain('сплетнями про сессию')
    expect(rows[0].find('mark').classes()).toContain('scan__mark')

    wrapper.unmount()
  })

  it('highlights every occurrence of a term, case-insensitively', async () => {
    const hits: SearchResults = {
      query: 'сессия',
      threads: [],
      posts: [
        {
          id: 28,
          thread: 10,
          thread_title: 'Сессия и сессия',
          is_op: false,
          snippet: 'СЕССИЯ близко, сессия уже сдана',
        },
      ],
    }
    const wrapper = mountLens()
    const rows = await type(wrapper, 'сессия', hits)

    expect(rows).toHaveLength(1)
    expect(marks(rows[0])).toEqual(['Сессия', 'сессия', 'СЕССИЯ', 'сессия'])

    wrapper.unmount()
  })

  it('never highlights the title:/board: operators themselves', async () => {
    const query = 'title:диффуры board:study'
    const hits: SearchResults = {
      query,
      threads: [
        {
          id: 9,
          board: 'study',
          title: 'Диффуры и зачёты',
          is_pinned: false,
          is_locked: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          bumped_at: new Date().toISOString(),
          reply_count: 2,
          op_snippet: 'решаем диффуры в study-канале',
        },
      ],
      posts: [
        {
          id: 30,
          thread: 9,
          thread_title: 'Диффуры и зачёты',
          is_op: false,
          snippet: 'сдали study',
        },
      ],
    }
    const wrapper = mountLens()
    const rows = await type(wrapper, query, hits)

    expect(searchNetwork).toHaveBeenLastCalledWith(query, { board: null })
    expect(rows).toHaveLength(2)

    const highlighted = rows.flatMap((row) => marks(row))
    expect(highlighted).toEqual(['Диффуры', 'диффуры', 'Диффуры'])
    expect(highlighted.join(' ')).not.toMatch(/title|board|study/i)
    expect(rows[0].text()).toContain('Диффуры и зачёты')
    expect(rows[0].text()).toContain('решаем диффуры в study-канале')

    wrapper.unmount()
  })

  it('keeps rows unmarked when the query carries no usable term', async () => {
    const wrapper = mountLens()
    const rows = await type(wrapper, 'я', data)

    expect(rows).toHaveLength(2)
    expect(rows[0].findAll('mark')).toHaveLength(0)
    expect(rows[0].text()).toContain('Советы по сдаче сессии')

    wrapper.unmount()
  })
})

describe('highlightRanges', () => {
  function slices(text: string, ranges: Array<[number, number]>) {
    return ranges.map(([start, end]) => text.slice(start, end))
  }

  it('matches terms case-insensitively', () => {
    const text = 'Советы по сдаче сессии'
    expect(slices(text, highlightRanges(text, 'СЕССИ'))).toEqual(['сесси'])
    expect(slices(text, highlightRanges(text, 'сесси'))).toEqual(['сесси'])
  })

  it('finds every occurrence of every term', () => {
    const text = 'сессия и зачёт'
    expect(slices(text, highlightRanges(text, 'сессия'))).toEqual(['сессия'])
    expect(slices(text, highlightRanges(text, 'зачёт сессия'))).toEqual([
      'сессия',
      'зачёт',
    ])
  })

  it('treats title: values as terms but drops board: scopes', () => {
    const text = 'Учёба и диффуры'
    expect(slices(text, highlightRanges(text, 'title:диффуры board:study'))).toEqual([
      'диффуры',
    ])
    expect(highlightRanges('study hard', 'board:study')).toEqual([])
    expect(highlightRanges('title:', 'title:')).toEqual([])
  })

  it('merges overlapping ranges into one', () => {
    expect(highlightRanges('сессия', 'сесси сессия')).toEqual([[0, 6]])
    expect(highlightRanges('абаба', 'аба')).toEqual([[0, 5]])
  })

  it('ignores operators, short terms and empty queries', () => {
    expect(
      highlightRanges('title:диффуры board:study', 'title:диффуры board:study'),
    ).toEqual([[6, 13]])
    expect(highlightRanges('я тут и там', 'я и')).toEqual([])
    expect(highlightRanges('ab cd', 'a b')).toEqual([])
    expect(highlightRanges('Советы по сдаче сессии', '')).toEqual([])
    expect(highlightRanges('Советы по сдаче сессии', '   ')).toEqual([])
    expect(highlightRanges('', 'сесси')).toEqual([])
    expect(highlightRanges('Советы по сдаче сессии', 'board:study')).toEqual([])
  })
  it('trims punctuation hugging a term', () => {
    const text = 'сесси, сдана'
    expect(slices(text, highlightRanges(text, 'сесси,'))).toEqual(['сесси'])
    expect(slices(text, highlightRanges(text, '(сесси)'))).toEqual(['сесси'])
  })
})

describe('searchNetwork query params', () => {
  it('appends the board slug and keeps the query encoded', async () => {
    const real = await vi.importActual<typeof import('@/api/search')>('@/api/search')

    await real.searchNetwork('сесси', { board: 'study' })
    expect(request).toHaveBeenLastCalledWith(
      '/search/?q=%D1%81%D0%B5%D1%81%D1%81%D0%B8&board=study',
    )
  })

  it('omits an empty or missing board scope', async () => {
    const real = await vi.importActual<typeof import('@/api/search')>('@/api/search')

    await real.searchNetwork('сесси')
    expect(request).toHaveBeenLastCalledWith(
      '/search/?q=%D1%81%D0%B5%D1%81%D1%81%D0%B8',
    )

    await real.searchNetwork('сесси', { board: '   ' })
    expect(request).toHaveBeenLastCalledWith(
      '/search/?q=%D1%81%D0%B5%D1%81%D1%81%D0%B8',
    )

    await real.searchNetwork('сесси', { board: null })
    expect(request).toHaveBeenLastCalledWith(
      '/search/?q=%D1%81%D0%B5%D1%81%D1%81%D0%B8',
    )
  })
})

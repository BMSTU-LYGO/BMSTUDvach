import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
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
vi.mock('@/api/mentions', () => ({
  getMentions: vi.fn(),
}))

import HomeView from '@/views/HomeView.vue'
import { listRecentThreads } from '@/api/threads'
import { getTelemetry } from '@/api/telemetry'
import { getMentions } from '@/api/mentions'

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
    expect(wrapper.text()).toContain('BMSTUD Network')
    expect(wrapper.find('.overlay-cta').exists()).toBe(true)
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

    const cell = (key: string) => wrapper.find(`[data-testid="telemetry-cell-${key}"]`)
    expect(cell('boards').text()).toBe('Разделы04')
    expect(cell('threads').text()).toBe('Треды013')
    expect(cell('posts').text()).toBe('Сообщения063')
    expect(cell('day').text()).toBe('24 часа+003')
    expect(cell('active').text()).toBe('Актив/b/')

    expect(cell('boards').attributes('title')).toBe('Активные разделы: 4')
    expect(cell('active').attributes('aria-label')).toBe(
      'Самый активный раздел: /b/ — 40 сообщений',
    )
  })

  it('does not render the rail when the telemetry api fails', async () => {
    vi.mocked(getTelemetry).mockRejectedValue(new Error('network down'))
    wrapper = await mountHome()
    expect(wrapper.find('[data-testid="telemetry-rail"]').exists()).toBe(false)
    expect(wrapper.find('.overlay-cta').exists()).toBe(true)
  })
})

describe('HomeView — mentions beacon', () => {
  const mention = (post: number, thread: number, title: string, hour: number) => ({
    post,
    thread,
    thread_title: title,
    body: ' Ответ ',
    created_at: `2026-10-13T${String(hour).padStart(2, '0')}:00:00Z`,
    snippet: ' Ответ ',
  })

  let wrapper: Awaited<ReturnType<typeof mountHome>>

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    vi.mocked(listRecentThreads).mockResolvedValue([])
    vi.mocked(getMentions).mockResolvedValue({
      tripcode: '!u3V2icOT',
      count: 2,
      mentions: [
        mention(31, 7, 'Срочно про ИУ7', 12),
        mention(32, 8, 'Расписание сессии', 13),
      ],
    })
    localStorageMock.setItem('bmstud-identities', JSON.stringify(['!u3V2icOT']))
  })

  afterEach(() => wrapper?.unmount())

  it('renders the unread count from the mentions api', async () => {
    wrapper = await mountHome()
    expect(getMentions).toHaveBeenCalledWith('!u3V2icOT')
    const beacon = wrapper.find('[data-testid="mentions-beacon"]')
    expect(beacon.exists()).toBe(true)
    expect(wrapper.find('[data-testid="mentions-count"]').text()).toBe('+02')
  })

  it('expands the mention list on click', async () => {
    wrapper = await mountHome()
    const toggle = wrapper.find('[data-testid="mentions-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')

    const items = wrapper.findAll('[data-testid^="mention-item-"]')
    expect(items).toHaveLength(2)
    // свежие ответы сверху
    expect(items[0].text()).toContain('Расписание сессии')
    expect(items[0].attributes('href')).toBe('/threads/8#post-32')
    expect(items[1].text()).toContain('Срочно про ИУ7')
    expect(items[1].attributes('href')).toBe('/threads/7#post-31')
  })

  it('keeps the beacon alive when the mentions api fails', async () => {
    vi.mocked(getMentions).mockRejectedValue(new Error('network down'))
    wrapper = await mountHome()
    expect(wrapper.find('[data-testid="mentions-beacon"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mentions-count"]').text()).toBe('—')
    expect(wrapper.find('[data-testid="mentions-list"]').exists()).toBe(false)
    expect(wrapper.find('.overlay-cta').exists()).toBe(true)
  })
})

describe('HomeView — page structure', () => {
  let wrapper: Awaited<ReturnType<typeof mountHome>>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(listRecentThreads).mockResolvedValue([])
  })

  afterEach(() => wrapper?.unmount())

  it('keeps the overlay hierarchy: kicker, meta, CTA', async () => {
    wrapper = await mountHome()
    expect(wrapper.find('.overlay-kicker').text()).toContain('BMSTUD Network')
    expect(wrapper.find('.overlay-kicker').text()).toContain('МГТУ им. Н. Э. Баумана')
    expect(wrapper.find('.meta-value').exists()).toBe(true)
    expect(wrapper.find('.overlay-cta').exists()).toBe(true)
    expect(wrapper.find('.cta-text').text()).toContain('Войти в сеть')
  })

  it('names every content block with a labelled section heading', async () => {
    wrapper = await mountHome()
    const sections = wrapper.findAll('section[aria-labelledby]')
    expect(sections).toHaveLength(2)

    const boards = wrapper.find('#section-boards-title')
    expect(boards.exists()).toBe(true)
    expect(boards.text()).toBe('Разделы')
    expect(boards.element.tagName).toBe('H2')

    const recent = wrapper.find('#section-recent-title')
    expect(recent.text()).toBe('Последние передачи')

    // decorative rules stay out of the a11y tree
    for (const rule of wrapper.findAll('.section-rule')) {
      expect(rule.attributes('aria-hidden')).toBe('true')
    }
  })

  it('keeps the decorative overlay layers out of the a11y tree', async () => {
    wrapper = await mountHome()
    for (const selector of [
      '.meta-divider',
      '.cta-arrow',
    ]) {
      const el = wrapper.find(selector)
      expect(el.exists()).toBe(true)
      expect(el.attributes('aria-hidden')).toBe('true')
    }
  })

  it('points every section name at the heading that carries it', async () => {
    wrapper = await mountHome()
    for (const id of ['section-boards-title', 'section-recent-title']) {
      const section = wrapper.find(`section[aria-labelledby="${id}"]`)
      expect(section.exists()).toBe(true)

      const heading = section.find('h2')
      expect(heading.attributes('id')).toBe(id)
      expect(heading.text().length).toBeGreaterThan(0)
    }
  })

  it('reads out the node and signal counts as zero-padded mono captions', async () => {
    wrapper = await mountHome()
    const readouts = wrapper.findAll('.label-meta')
    expect(readouts).toHaveLength(2)
    expect(readouts[0].text()).toBe('00 узлов')
    expect(readouts[1].text()).toBe('00 сигналов')
  })
})

describe('HomeView — drafts panel', () => {
  let wrapper: Awaited<ReturnType<typeof mountHome>>

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    vi.mocked(listRecentThreads).mockResolvedValue([])
    localStorageMock.setItem(
      'draft:signal-7',
      JSON.stringify({ body: 'недописанный сигнал', files: [], timestamp: Date.now() }),
    )
  })

  afterEach(() => {
    wrapper?.unmount()
    localStorageMock.clear()
  })

  it('renders the drafts panel from stored buffers', async () => {
    wrapper = await mountHome()
    const panel = wrapper.find('[data-testid="drafts-panel"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('ЧЕРНОВИКИ')
    expect(wrapper.find('[data-testid="draft-row-7"]').text()).toContain('ответ в треде #7')
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

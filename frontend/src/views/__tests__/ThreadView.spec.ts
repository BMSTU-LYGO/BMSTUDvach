import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

// GSAP plugin registration and Flip morphs are environment-dependent —
// the reader logic under test does not touch them.
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

vi.mock('@/api/threads', () => ({
  getThread: vi.fn(),
  listThreads: vi.fn(),
  createThread: vi.fn(),
}))
vi.mock('@/api/posts', () => ({
  createPost: vi.fn(),
  createReport: vi.fn(),
}))

import { createPost } from '@/api/posts'
import { ApiRequestError } from '@/api/client'

import ThreadView from '@/views/ThreadView.vue'
import { getThread } from '@/api/threads'
import type { ThreadDetail } from '@/types'

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

const thread: ThreadDetail = {
  id: 1,
  board: 'b',
  title: 'Тестовый тред',
  is_pinned: false,
  is_locked: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  bumped_at: new Date().toISOString(),
  reply_count: 2,
  posts: [
    {
      id: 1,
      thread: 1,
      body: 'открываю тред',
      is_op: true,
      sage: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author: 'Аноним',
      tripcode: '',
      attachments: [],
    },
    {
      id: 2,
      thread: 1,
      body: '>>1 плюсую, но >>3 уже нет',
      is_op: false,
      sage: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author: 'Аноним',
      tripcode: '',
      attachments: [],
    },
  ],
}

async function mountThread(hash = '') {
  const r = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/threads/:threadId', component: { template: '<div />' } },
    ],
  })
  if (hash) await r.push(`/threads/1${hash}`)
  const wrapper = mount(ThreadView, {
    props: { threadId: 1 },
    attachTo: document.body,
    global: { plugins: [createPinia(), r] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('ThreadView — thread reader', () => {
  let wrapper: Awaited<ReturnType<typeof mountThread>>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getThread).mockResolvedValue(thread)
    // jsdom has no scrollIntoView — stub it on the prototype
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    // views are attached to body: remove leftovers so getElementById
    // always resolves inside the current wrapper
    wrapper?.unmount()
  })

  it('renders posts with anchor ids', async () => {
    wrapper = await mountThread()
    const posts = wrapper.findAll('[data-testid="post"]')
    expect(posts).toHaveLength(2)
    expect(posts[0].attributes('id')).toBe('post-1')
    expect(posts[1].attributes('id')).toBe('post-2')
  })

  it('renders post links and backlinks', async () => {
    wrapper = await mountThread()
    // post 2 links to 1 (live) and 3 (dead)
    const links = wrapper.findAll('.post-link')
    expect(links.some((l) => l.attributes('href') === '#post-1')).toBe(true)
    expect(links.some((l) => l.classes().includes('post-link--dead'))).toBe(true)

    // post 1 has one backlink: #2
    const backlinks = wrapper.findAll('[data-testid="post-backlinks"]')
    expect(backlinks).toHaveLength(1)
    expect(backlinks[0].text()).toContain('>>2')
  })

  it('navigates to a post and flashes the target on click', async () => {
    wrapper = await mountThread()
    const link = wrapper.findAll('a[href="#post-1"]')[0]
    await link.trigger('click')

    const target = wrapper.findAll('[data-testid="post"]')[0]
    expect(target.classes()).toContain('post-item--linked')
  })

  it('exposes reading progress', async () => {
    wrapper = await mountThread()
    const bar = wrapper.find('[data-testid="thread-progress"]')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('role')).toBe('progressbar')
  })

  it('surfaces real field errors from the API envelope in the dock', async () => {
    wrapper = await mountThread()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('ответ')

    // API rejects with the {detail, errors} envelope — the generic
    // 'Validation error' must not be what the user reads
    vi.mocked(createPost).mockRejectedValueOnce(
      new ApiRequestError(400, 'Validation error', {
        body: ['Post body must not exceed 20000 characters.'],
      }),
    )
    await wrapper.find('.transmit').trigger('click')
    await flushPromises()

    const error = wrapper.find('[data-testid="dock-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('must not exceed 20000')
    // failure keeps the typed body
    expect(
      (wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement)
        .value,
    ).toBe('ответ')
  })

  it('tracks the node on demand and persists it', async () => {
    wrapper = await mountThread()
    const toggle = wrapper.find('[data-testid="watch-toggle"]')
    expect(toggle.attributes('aria-pressed')).toBe('false')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(localStorage.getItem('bmstudvach-watchlist')).toContain('"threadId":1')

    // reading the thread snapshots the reply count
    await wrapper.setProps({ threadId: 1 })
    await flushPromises()
    const stored = JSON.parse(localStorage.getItem('bmstudvach-watchlist')!)
    expect(stored[0].seenReplies).toBe(2)
  })

  it('keeps the Signal Dock writable below the posts', async () => {
    wrapper = await mountThread()
    expect(wrapper.find('[data-testid="signal-dock"]').exists()).toBe(true)
  })
})

const SEEN_KEY = 'bmstud-thread-seen'

function post(id: number): ThreadDetail['posts'][number] {
  return {
    id,
    thread: 1,
    body: `пост ${id}`,
    is_op: id === 1,
    sage: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    author: 'Аноним',
    tripcode: '',
    attachments: [],
  }
}

const fourPostThread: ThreadDetail = {
  ...thread,
  posts: [post(1), post(2), post(3), post(4)],
}

describe('ThreadView — маркер новых сообщений', () => {
  let wrapper: Awaited<ReturnType<typeof mountThread>> | undefined

  beforeEach(() => {
    localStorageMock.clear()
    vi.mocked(getThread).mockResolvedValue(fourPostThread)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('ставит разделитель перед первым новым постом', async () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ '1': 2 }))
    wrapper = await mountThread()

    const divider = wrapper.find('[data-testid="new-posts-divider"]')
    expect(divider.exists()).toBe(true)
    expect(divider.attributes('role')).toBe('separator')
    expect(divider.attributes('aria-label')).toBe('2 новых сообщений')
    expect(divider.text()).toContain('новые сообщения · 02')

    // разделитель — прямой ребёнок списка постов, ровно перед постом #3
    const children = Array.from(wrapper.find('.posts').element.children)
    expect(children).toHaveLength(5)
    expect(children[2].getAttribute('data-testid')).toBe('new-posts-divider')
    expect(children[3].id).toBe('post-3')
  })

  it('не показывает разделитель при первом посещении треда', async () => {
    wrapper = await mountThread()
    expect(wrapper.find('[data-testid="new-posts-divider"]').exists()).toBe(false)
    expect(localStorage.getItem(SEEN_KEY)).toBeNull()
  })

  it('не показывает разделитель, когда новых постов нет', async () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ '1': 4 }))
    wrapper = await mountThread()
    expect(wrapper.find('[data-testid="new-posts-divider"]').exists()).toBe(false)
  })

  it('запоминает максимальный post-id при уходе со страницы', async () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ '1': 1 }))
    wrapper = await mountThread()
    expect(JSON.parse(localStorage.getItem(SEEN_KEY)!)).toEqual({ '1': 1 })

    wrapper.unmount()
    expect(JSON.parse(localStorage.getItem(SEEN_KEY)!)).toEqual({ '1': 4 })
  })

  it('считает свой ответ прочитанным после ответа в тред', async () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ '1': 2 }))
    let current = fourPostThread
    vi.mocked(getThread).mockImplementation(() => Promise.resolve(current))
    wrapper = await mountThread()
    expect(wrapper.find('[data-testid="new-posts-divider"]').exists()).toBe(true)

    await wrapper.find('[data-testid="signal-input"]').setValue('ответ')
    current = { ...fourPostThread, posts: [...fourPostThread.posts, post(5), post(6)] }
    await wrapper.find('.transmit').trigger('click')
    await flushPromises()

    // граница дошла до последнего поста — разделитель ушёл
    expect(wrapper.find('[data-testid="new-posts-divider"]').exists()).toBe(false)
    expect(JSON.parse(localStorage.getItem(SEEN_KEY)!)).toEqual({ '1': 6 })
  })
})

const POSITION_KEY = 'bmstud-thread-position'

function storedPositions(): Record<string, number> {
  const raw = localStorage.getItem(POSITION_KEY)
  return raw ? JSON.parse(raw) : {}
}

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
}

describe('ThreadView — восстановление позиции чтения', () => {
  let wrapper: Awaited<ReturnType<typeof mountThread>> | undefined
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorageMock.clear()
    vi.mocked(getThread).mockResolvedValue(thread)
    Element.prototype.scrollIntoView = vi.fn()
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    wrapper?.unmount()
    wrapper = undefined
  })

  it('восстанавливает сохранённую позицию после рендера постов', async () => {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ '1': 640 }))
    wrapper = await mountThread()

    expect(scrollTo).toHaveBeenCalledWith(0, 640)
    expect(storedPositions()).toEqual({ '1': 640 })
  })

  it('не трогает скролл при первом посещении треда', async () => {
    wrapper = await mountThread()

    expect(scrollTo).not.toHaveBeenCalled()
    expect(localStorage.getItem(POSITION_KEY)).toBeNull()
  })

  it('не восстанавливает позицию для другого треда', async () => {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ '42': 640 }))
    wrapper = await mountThread()

    expect(scrollTo).not.toHaveBeenCalled()
    expect(storedPositions()).toEqual({ '42': 640 })
  })

  it('отдаёт приоритет якорю #post-N — restore пропущен', async () => {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ '1': 640 }))
    wrapper = await mountThread('#post-2')

    expect(wrapper.find('#post-2').exists()).toBe(true)
    expect(scrollTo).not.toHaveBeenCalledWith(0, 640)
  })

  it('запоминает позицию при уходе со страницы', async () => {
    wrapper = await mountThread()
    expect(localStorage.getItem(POSITION_KEY)).toBeNull()

    setScrollY(300)
    wrapper.unmount()

    expect(storedPositions()).toEqual({ '1': 300 })
    wrapper = undefined
  })

  it('пишет позицию на скролле', async () => {
    wrapper = await mountThread()

    setScrollY(480)
    window.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))

    expect(storedPositions()).toEqual({ '1': 480 })

    // второй скролл в пределах троттлинга (~200 мс) не перезаписывает позицию
    setScrollY(120)
    window.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))

    expect(storedPositions()).toEqual({ '1': 480 })
  })

  it('переживает обновление треда — позиция не прыгает назад', async () => {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ '1': 640 }))
    wrapper = await mountThread()
    expect(scrollTo).toHaveBeenCalledWith(0, 640)

    scrollTo.mockClear()
    // свой ответ перечитывает тред: watcher срабатывает повторно
    await wrapper.find('[data-testid="signal-input"]').setValue('ещё пост')
    await wrapper.find('.transmit').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="post"]')).toHaveLength(2)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})

describe('ThreadView — поиск в треде и cursor j/k (FINDPOST-01)', () => {
  let wrapper: Awaited<ReturnType<typeof mountThread>> | undefined

  beforeEach(() => {
    localStorageMock.clear()
    vi.mocked(getThread).mockResolvedValue(fourPostThread)
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  function pressKey(key: string, target: EventTarget = window) {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  }

  it('кнопка открывает строку поиска', async () => {
    wrapper = await mountThread()
    expect(wrapper.find('[data-testid="thread-search"]').exists()).toBe(false)

    await wrapper.find('[data-testid="thread-search-toggle"]').trigger('click')

    const search = wrapper.find('[data-testid="thread-search"]')
    expect(search.exists()).toBe(true)
    expect(search.attributes('role')).toBe('search')
    expect(
      wrapper.find('[data-testid="thread-search-toggle"]').attributes('aria-label'),
    ).toBe('Найти в треде')
  })

  it('клавиша f открывает поиск и фокусирует поле', async () => {
    wrapper = await mountThread()
    pressKey('f')
    await nextTick()

    const input = wrapper.find('[data-testid="thread-search-input"]').element
    expect(wrapper.find('[data-testid="thread-search"]').exists()).toBe(true)
    expect(document.activeElement).toBe(input)
  })

  it('ввод запроса показывает счётчик и mark в тексте', async () => {
    wrapper = await mountThread()
    await wrapper.find('[data-testid="thread-search-toggle"]').trigger('click')
    await wrapper.find('[data-testid="thread-search-input"]').setValue('пост')
    await flushPromises()

    expect(wrapper.find('[data-testid="thread-search-count"]').text()).toBe('1 / 4')
    expect(wrapper.findAll('mark.post-highlight').length).toBeGreaterThan(0)
    expect(wrapper.findAll('[data-testid="post"]')[0].classes()).toContain(
      'post-item--search-active',
    )
  })

  it('Esc закрывает поиск и снимает подсветку', async () => {
    wrapper = await mountThread()
    await wrapper.find('[data-testid="thread-search-toggle"]').trigger('click')
    await wrapper.find('[data-testid="thread-search-input"]').setValue('пост')
    await flushPromises()
    expect(wrapper.findAll('mark.post-highlight').length).toBeGreaterThan(0)

    pressKey('Escape')
    await nextTick()

    expect(wrapper.find('[data-testid="thread-search"]').exists()).toBe(false)
    expect(wrapper.findAll('mark.post-highlight')).toHaveLength(0)
  })

  it('j фокусирует следующий пост и уводит фокус дальше', async () => {
    wrapper = await mountThread()
    pressKey('j')
    await nextTick()

    expect(wrapper.findAll('[data-testid="post"]')[0].classes()).toContain(
      'post-item--focused',
    )

    pressKey('j')
    await nextTick()

    expect(wrapper.findAll('[data-testid="post"]')[0].classes()).not.toContain(
      'post-item--focused',
    )
    expect(wrapper.findAll('[data-testid="post"]')[1].classes()).toContain(
      'post-item--focused',
    )
  })

  it('k ведёт к предыдущему посту, начиная с последнего', async () => {
    wrapper = await mountThread()
    pressKey('k')
    await nextTick()

    expect(wrapper.findAll('[data-testid="post"]')[3].classes()).toContain(
      'post-item--focused',
    )
  })

  it('j в поле ввода игнорируется', async () => {
    wrapper = await mountThread()
    await wrapper.find('[data-testid="thread-search-toggle"]').trigger('click')
    await nextTick()

    const input = wrapper.find('[data-testid="thread-search-input"]').element
    pressKey('j', input)
    await nextTick()

    expect(wrapper.findAll('.post-item--focused')).toHaveLength(0)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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
      attachments: [],
    },
  ],
}

async function mountThread() {
  const r = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/threads/:threadId', component: { template: '<div />' } },
    ],
  })
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
    expect((wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value).toBe(
      'ответ',
    )
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

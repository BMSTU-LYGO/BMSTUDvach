import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/moderation', () => ({
  staffMe: vi.fn().mockResolvedValue({ is_staff: false }),
}))
vi.mock('@/api/boards', () => ({
  listBoards: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/three/transitionDirector', () => ({
  initTransitionDirector: vi.fn(),
  playTransition: vi.fn(),
  playStoryTransition: vi.fn(),
}))

import DefaultLayout from '@/layouts/DefaultLayout.vue'
import { playStoryTransition, playTransition } from '@/three/transitionDirector'

async function mountLayout(path = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>page</div>' } },
      {
        path: '/threads/:threadId(\\d+)',
        name: 'thread',
        component: { template: '<div>thread</div>' },
      },
    ],
  })
  router.push(path)
  await router.isReady()

  const wrapper = mount(DefaultLayout, {
    global: {
      plugins: [createPinia(), router],
      stubs: {
        AppHeader: true,
        AppFooter: true,
        AmbientField: true,
        WarpCanvas: true,
        ScanLens: true,
        AnnouncementBanner: true,
        OfflineBadge: true,
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('DefaultLayout — a11y landmarks', () => {
  it('renders the skip link pointing at the main landmark', async () => {
    const wrapper = await mountLayout()

    const link = wrapper.find('[data-testid="skip-link"]')
    expect(link.exists()).toBe(true)
    expect(link.element.tagName).toBe('A')
    expect(link.attributes('href')).toBe('#main-content')
    expect(link.text()).toContain('Перейти к содержимому')
  })

  it('places the skip link before the header in the DOM', async () => {
    const wrapper = await mountLayout()

    const layout = wrapper.find('.layout')
    const first = layout.element.firstElementChild
    expect(first?.getAttribute('data-testid')).toBe('skip-link')
  })

  it('exposes a single main landmark with id="main-content"', async () => {
    const wrapper = await mountLayout()

    const mains = wrapper.findAll('main')
    expect(mains).toHaveLength(1)

    const main = wrapper.find('#main-content')
    expect(main.exists()).toBe(true)
    expect(main.element.tagName).toBe('MAIN')
    expect(main.attributes('aria-label')).toBe('Основное содержимое')
  })

  it('makes the main landmark programmatically focusable for the skip link', async () => {
    const wrapper = await mountLayout()

    const main = wrapper.find('#main-content')
    expect(main.attributes('tabindex')).toBe('-1')
  })

  it('widens the reader shell only on the thread route (P3-T5 gutter)', async () => {
    const home = await mountLayout()
    expect(home.find('#main-content').classes()).not.toContain('content--reader')

    const thread = await mountLayout('/threads/7')
    expect(thread.find('#main-content').classes()).toContain('content--reader')
  })
})

describe('DefaultLayout — the story trip inside the archive space', () => {
  beforeEach(() => {
    vi.mocked(playStoryTransition).mockClear()
    vi.mocked(playTransition).mockClear()
  })

  async function mountArchive(path = '/platinum') {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          name: 'home',
          component: { template: '<div>page</div>' },
          meta: { scene: 'home' },
        },
        {
          path: '/platinum',
          name: 'platinum',
          component: { template: '<div>archive</div>' },
          meta: { scene: 'platinum' },
        },
        {
          path: '/platinum/:storyId(\\d+)',
          name: 'platinum-story',
          component: { template: '<div>story</div>' },
          meta: { scene: 'platinum' },
        },
      ],
    })
    router.push(path)
    await router.isReady()

    const wrapper = mount(DefaultLayout, {
      global: {
        plugins: [createPinia(), router],
        stubs: {
          AppHeader: true,
          AppFooter: true,
          AmbientField: true,
          WarpCanvas: true,
          ScanLens: true,
          AnnouncementBanner: true,
          OfflineBadge: true,
        },
      },
    })
    await flushPromises()
    return { wrapper, router }
  }

  it('opening a story plays the story transition, not the generic one', async () => {
    const { router } = await mountArchive('/platinum')

    await router.push('/platinum/7')
    await flushPromises()

    expect(playStoryTransition).toHaveBeenCalledWith('reveal', 7)
    expect(playTransition).not.toHaveBeenCalled()
  })

  it('leaving a story plays the story transition back', async () => {
    const { router } = await mountArchive('/platinum/7')

    await router.push('/platinum')
    await flushPromises()

    expect(playStoryTransition).toHaveBeenCalledWith('return', 7)
    expect(playTransition).not.toHaveBeenCalled()
  })

  it('a plain archive route change plays no story transition', async () => {
    const { router } = await mountArchive('/platinum')

    await router.push('/platinum')
    await flushPromises()

    expect(playStoryTransition).not.toHaveBeenCalled()
  })
})

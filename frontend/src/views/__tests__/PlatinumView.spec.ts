import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/composables/useGsap', () => ({
  gsap: { from: vi.fn(), to: vi.fn(), fromTo: vi.fn(), set: vi.fn() },
  ScrollTrigger: {},
  Flip: {},
  prefersReducedMotion: () => false,
  isTouchDevice: () => false,
}))

vi.mock('@/api/platinum', () => ({
  getPlatinumStory: vi.fn(),
  listPlatinumStories: vi.fn(),
}))

import PlatinumView from '@/views/PlatinumView.vue'
import { listPlatinumStories, type PlatinumStory } from '@/api/platinum'
import {
  emitSceneEvent,
  onSceneEvent,
  sceneState,
  type SceneEvent,
} from '@/three/sceneState'
import type { Paginated } from '@/types'

function story(id: number, title: string, body: string): PlatinumStory {
  return {
    id,
    title,
    body,
    source_type: 'generated',
    status: 'published',
    generation_metadata: {},
    created_at: '2026-05-01T10:00:00Z',
    published_at: '2026-05-01T10:00:00Z',
  }
}

const PAGE_ONE: PlatinumStory[] = [
  story(1, 'Ночь перед экзаменом', 'История про библиотеку МГТУ.\n\nВторой абзац.'),
  story(2, 'Смена на проходной', 'Дежурный по корпусу наблюдает, как гаснет свет.'),
]

/** Three epochs: undated, 2025 and 2026 — three rings of the archive. */
const MIXED: PlatinumStory[] = [
  { ...story(1, 'Ещё не опубликовано', 'Без даты.'), published_at: null },
  {
    ...story(2, 'Старый корпус', 'Пять двадцать пятый.'),
    published_at: '2025-03-04T10:00:00Z',
  },
  {
    ...story(3, 'Новый корпус', 'Двадцать шестой.'),
    published_at: '2026-03-04T10:00:00Z',
    source_type: 'dvach',
  },
]

function page(results: PlatinumStory[], count: number) {
  return Promise.resolve<Paginated<PlatinumStory>>({
    count,
    page: 1,
    pages: 2,
    page_size: 20,
    // A copy: the view appends to the array it was given.
    results: [...results],
  })
}

async function mountArchive() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/platinum', component: PlatinumView },
      { path: '/platinum/:storyId(\\d+)', component: { template: '<div />' } },
    ],
  })
  await router.push('/platinum')
  await router.isReady()
  const wrapper = mount(PlatinumView, { global: { plugins: [router] } })
  await flushPromises()
  await flushPromises()
  return { wrapper, router }
}

/** The scene state is a singleton — every test starts from a clean space. */
function resetScene() {
  sceneState.storyCount = 0
  sceneState.archiveStories = []
  sceneState.focusedStory = null
  sceneState.selectedStory = null
}

beforeEach(() => {
  resetScene()
})

describe('PlatinumView — archive listing', () => {
  beforeEach(() => {
    vi.mocked(listPlatinumStories).mockReset()
  })

  it('renders the archive fragments as rows with id, teaser and date', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 6))
    const { wrapper } = await mountArchive()

    const rows = wrapper.findAll('[data-testid="fragment-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].attributes('href')).toBe('/platinum/1')
    expect(rows[0].text()).toContain('#1')
    expect(rows[0].text()).toContain('Ночь перед экзаменом')
    expect(rows[0].text()).toContain('История про библиотеку МГТУ.')
    expect(rows[0].find('time').attributes('datetime')).toBe('2026-05-01T10:00:00Z')
  })

  it('pulls the next page into the rings from the load-more node', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 6))
    const { wrapper } = await mountArchive()

    const more = wrapper.find('button.archive-more')
    expect(more.exists()).toBe(true)
    expect(more.text()).toContain('4')

    vi.mocked(listPlatinumStories).mockImplementationOnce(() =>
      page([story(3, 'Последний фрагмент', 'Третья история архива.')], 3),
    )
    await more.trigger('click')
    await flushPromises()

    expect(listPlatinumStories).toHaveBeenLastCalledWith({ page: 2, search: '' })
    expect(wrapper.findAll('[data-testid="fragment-row"]')).toHaveLength(3)
  })

  it('keeps the search input named by its label and scoped to the query', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchive()

    const input = wrapper.find('#archive-search')
    expect(input.exists()).toBe(true)
    const label = wrapper.find('label[for="archive-search"]')
    expect(label.text()).toBe('ПОИСК ПО АРХИВУ')

    await wrapper.find('input#archive-search').setValue('проходная')
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    await flushPromises()

    expect(listPlatinumStories).toHaveBeenLastCalledWith({ search: 'проходная' })
  })

  it('answers an empty archive with the shared empty state', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page([], 0))
    const { wrapper } = await mountArchive()

    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Пустой архив')
    expect(wrapper.findAll('[data-testid="fragment-row"]')).toHaveLength(0)
  })

  it('reports a failed archive request through the error state', async () => {
    vi.mocked(listPlatinumStories).mockRejectedValue(new Error('сеть недоступна'))
    const { wrapper } = await mountArchive()

    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('сеть недоступна')
  })
})

describe('PlatinumView — the archive and the 3D space (P3-T1)', () => {
  beforeEach(() => {
    vi.mocked(listPlatinumStories).mockReset()
  })

  it('feeds the space with every loaded story — year, ring and origin', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(MIXED, 3))
    await mountArchive()

    expect(sceneState.archiveStories).toHaveLength(3)
    expect(sceneState.archiveStories[0]).toEqual({
      id: 1,
      title: 'Ещё не опубликовано',
      year: null,
      ringIndex: 0,
      sourceType: 'generated',
    })
    expect(sceneState.archiveStories[1]).toEqual({
      id: 2,
      title: 'Старый корпус',
      year: 2025,
      ringIndex: 1,
      sourceType: 'generated',
    })
    expect(sceneState.archiveStories[2]).toEqual({
      id: 3,
      title: 'Новый корпус',
      year: 2026,
      ringIndex: 2,
      sourceType: 'dvach',
    })
  })

  it('keeps telling the scene how many stories the archive holds', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 6))
    await mountArchive()

    expect(sceneState.storyCount).toBe(6)
  })

  it('grows the space with every loaded page', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 6))
    const { wrapper } = await mountArchive()

    vi.mocked(listPlatinumStories).mockImplementationOnce(() =>
      page([story(3, 'Последний фрагмент', 'Третья история архива.')], 3),
    )
    await wrapper.find('button.archive-more').trigger('click')
    await flushPromises()

    expect(sceneState.archiveStories.map((s) => s.id)).toEqual([1, 2, 3])
  })

  it('focuses the fragment in the space when the row is hovered', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchive()

    const seen: SceneEvent[] = []
    const off = onSceneEvent((ev) => seen.push(ev))

    await wrapper.findAll('[data-testid="fragment-row"]')[0].trigger('mouseenter')

    expect(sceneState.focusedStory).toBe(1)
    expect(seen).toEqual([{ type: 'archive-focus', target: 1 }])
    off()
  })

  it('releases the focus when the row is left', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchive()

    const row = wrapper.findAll('[data-testid="fragment-row"]')[0]
    await row.trigger('mouseenter')
    expect(sceneState.focusedStory).toBe(1)

    await row.trigger('mouseleave')
    expect(sceneState.focusedStory).toBe(null)
  })

  it('keeps a newer focus when an older row is left', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchive()

    const rows = wrapper.findAll('[data-testid="fragment-row"]')
    await rows[0].trigger('mouseenter')
    await rows[1].trigger('mouseenter')
    await rows[0].trigger('mouseleave')

    expect(sceneState.focusedStory).toBe(2)
  })

  it('marks the focused row and lets the space read it back', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchive()

    sceneState.focusedStory = 2
    await nextTick()

    const rows = wrapper.findAll('[data-testid="fragment-row"]')
    expect(rows[1].attributes('data-focused')).toBe('true')
    expect(rows[1].classes()).toContain('fragment-link--focused')
    expect(rows[0].attributes('data-focused')).toBeUndefined()
    expect(rows[0].classes()).not.toContain('fragment-link--focused')
  })

  it('brings the focused row into view — gently, and only when it is out of sight', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchive()

    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const list = wrapper.find('ol.fragments').element
    list.getBoundingClientRect = () => ({ top: 0, bottom: 600 }) as DOMRect
    const row = wrapper.findAll('[data-testid="fragment-row"]')[1].element
    row.getBoundingClientRect = () => ({ top: 900, bottom: 960 }) as DOMRect

    sceneState.focusedStory = 2
    await nextTick()
    await nextTick()

    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' })
    scroll.mockRestore()
  })

  it('tells the space which fragment the reader opened', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchive()

    await wrapper.findAll('[data-testid="fragment-row"]')[1].trigger('click')
    await flushPromises()

    expect(sceneState.selectedStory).toBe(2)
  })

  it('opens the story the space asked for', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { router } = await mountArchive()
    const push = vi.spyOn(router, 'push')

    emitSceneEvent({ type: 'archive-open', target: 5 })
    await flushPromises()

    expect(push).toHaveBeenCalledWith('/platinum/5')
    expect(sceneState.selectedStory).toBe(5)
    push.mockRestore()
  })

  it('leaves the space empty when the archive fails', async () => {
    vi.mocked(listPlatinumStories).mockRejectedValue(new Error('сеть недоступна'))
    await mountArchive()

    expect(sceneState.archiveStories).toEqual([])
  })
})

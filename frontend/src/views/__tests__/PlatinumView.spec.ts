import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type DOMWrapper } from '@vue/test-utils'
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

/**
 * A row of the list as the element it is: the keyboard walks the rows of
 * the archive, and jsdom only focuses the elements that are in the document.
 */
function rowElement(rows: DOMWrapper<Element>[], index: number): HTMLElement {
  return rows[index].element as HTMLElement
}

/**
 * The archive mounted in the document: the keyboard moves the real focus,
 * and jsdom only focuses the elements that are in the document.
 */
async function mountArchiveInDocument() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/platinum', component: PlatinumView },
      { path: '/platinum/:storyId(\\d+)', component: { template: '<div />' } },
    ],
  })
  await router.push('/platinum')
  await router.isReady()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const wrapper = mount(PlatinumView, {
    global: { plugins: [router] },
    attachTo: host,
  })
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

  it('answers an empty archive with the archive panel', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page([], 0))
    const { wrapper } = await mountArchive()

    const panel = wrapper.find('[data-testid="archive-empty"]')
    expect(panel.exists()).toBe(true)
    expect(panel.classes()).toContain('archive-empty--empty')
    expect(wrapper.find('[data-testid="archive-empty-title"]').text()).toBe(
      'Кольца вращаются вхолостую',
    )
    expect(wrapper.find('[data-testid="platinum-empty"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="fragment-row"]')).toHaveLength(0)
  })

  it('reports a failed archive request through the archive panel', async () => {
    vi.mocked(listPlatinumStories).mockRejectedValue(new Error('сеть недоступна'))
    const { wrapper } = await mountArchive()

    const panel = wrapper.find('[data-testid="archive-empty"]')
    expect(panel.exists()).toBe(true)
    expect(panel.classes()).toContain('archive-empty--error')
    expect(panel.attributes('role')).toBe('alert')
    expect(wrapper.text()).toContain('сеть недоступна')
  })
})

describe('PlatinumView — the quiet states of the archive (P3-T2b)', () => {
  beforeEach(() => {
    vi.mocked(listPlatinumStories).mockReset()
  })

  it('speaks in the loading register while the vault answers', async () => {
    // The vault never answers: the archive stays in its syncing register.
    vi.mocked(listPlatinumStories).mockImplementation(
      () => new Promise<Paginated<PlatinumStory>>(() => {}),
    )
    const { wrapper } = await mountArchive()

    const panel = wrapper.find('[data-testid="archive-empty"]')
    expect(panel.exists()).toBe(true)
    expect(panel.classes()).toContain('archive-empty--loading')
    expect(panel.attributes('aria-busy')).toBe('true')
    expect(wrapper.find('[data-testid="platinum-empty"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="fragment-row"]')).toHaveLength(0)
  })

  it('answers a silent search in the search register', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page([], 0))
    const { wrapper } = await mountArchive()

    await wrapper.find('input#archive-search').setValue('осциллограф')
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    await flushPromises()

    const panel = wrapper.find('[data-testid="archive-empty"]')
    expect(panel.classes()).toContain('archive-empty--search')
    expect(panel.text()).toContain('осциллограф')
    expect(wrapper.find('[data-testid="archive-empty-reset"]').exists()).toBe(true)
  })

  it('forgets the query and asks the archive again from the first page', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 6))
    const { wrapper } = await mountArchive()

    // The reader pulled the second page in.
    vi.mocked(listPlatinumStories).mockImplementationOnce(() =>
      page([story(3, 'Последний фрагмент', 'Третья история архива.')], 3),
    )
    await wrapper.find('button.archive-more').trigger('click')
    await flushPromises()
    expect(listPlatinumStories).toHaveBeenLastCalledWith({ page: 2, search: '' })

    // The archive is asked in vain.
    vi.mocked(listPlatinumStories).mockImplementation(() => page([], 0))
    await wrapper.find('input#archive-search').setValue('осциллограф')
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    await flushPromises()
    expect(wrapper.find('[data-testid="archive-empty"]').classes()).toContain(
      'archive-empty--search',
    )

    // The reset forgets the query and starts the list over.
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 6))
    await wrapper.find('[data-testid="archive-empty-reset"]').trigger('click')
    await flushPromises()

    expect(
      (wrapper.find('input#archive-search').element as HTMLInputElement).value,
    ).toBe('')
    expect(listPlatinumStories).toHaveBeenLastCalledWith({ search: '' })
    expect(wrapper.findAll('[data-testid="fragment-row"]')).toHaveLength(2)

    // The page counter started over: the next page is the second one.
    await wrapper.find('button.archive-more').trigger('click')
    await flushPromises()
    expect(listPlatinumStories).toHaveBeenLastCalledWith({ page: 2, search: '' })
  })

  it('asks the archive again when the reader retries', async () => {
    vi.mocked(listPlatinumStories).mockRejectedValueOnce(new Error('сеть недоступна'))
    const { wrapper } = await mountArchive()

    expect(wrapper.find('[data-testid="archive-empty-retry"]').exists()).toBe(true)

    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    await wrapper.find('[data-testid="archive-empty-retry"]').trigger('click')
    await flushPromises()

    expect(listPlatinumStories).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('[data-testid="fragment-row"]')).toHaveLength(2)
  })

  it('tells the space to forget the archive when the line breaks', async () => {
    vi.mocked(listPlatinumStories).mockRejectedValue(new Error('сеть недоступна'))

    const seen: SceneEvent[] = []
    const off = onSceneEvent((ev) => seen.push(ev))
    await mountArchive()
    off()

    expect(seen).toContainEqual({ type: 'archive-clear' })
    expect(sceneState.archiveStories).toEqual([])
  })

  it('never loses the archive panel wrapper', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page([], 0))
    const { wrapper } = await mountArchive()

    const shell = wrapper.find('[data-testid="platinum-empty"]')
    expect(shell.exists()).toBe(true)
    expect(shell.classes()).toContain('archive-empty')
    expect(shell.find('[data-testid="archive-empty"]').exists()).toBe(true)
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

describe('PlatinumView — the archive on the keyboard (P4-T1)', () => {
  /** The archive of the test, mounted in the document. */
  let mounted: { unmount: () => void } | null = null

  beforeEach(() => {
    vi.mocked(listPlatinumStories).mockReset()
    localStorage.clear()
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
    document.body.innerHTML = ''
  })

  it('walks the rows with the arrows and the space follows', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchiveInDocument()
    mounted = wrapper

    const seen: SceneEvent[] = []
    const off = onSceneEvent((ev) => seen.push(ev))

    const rows = wrapper.findAll('[data-testid="fragment-row"]')
    rowElement(rows, 0).focus()
    await rows[0].trigger('keydown', { key: 'ArrowDown' })

    expect(document.activeElement).toBe(rows[1].element)
    expect(sceneState.focusedStory).toBe(2)
    expect(rows[1].attributes('data-focused')).toBe('true')
    expect(rows[0].attributes('data-focused')).toBeUndefined()
    expect(seen).toContainEqual({ type: 'archive-focus', target: 2 })
    off()
  })

  it('walks back with the arrow up', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchiveInDocument()
    mounted = wrapper

    const rows = wrapper.findAll('[data-testid="fragment-row"]')
    rowElement(rows, 1).focus()
    await rows[1].trigger('keydown', { key: 'ArrowUp' })

    expect(document.activeElement).toBe(rows[0].element)
    expect(sceneState.focusedStory).toBe(1)
  })

  it('jumps to the edges of the archive with Home and End', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchiveInDocument()
    mounted = wrapper

    const rows = wrapper.findAll('[data-testid="fragment-row"]')
    rowElement(rows, 0).focus()

    await rows[0].trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(rows[1].element)

    await rows[1].trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(rows[0].element)
  })

  it('opens the story under the focus with Enter', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper, router } = await mountArchiveInDocument()
    mounted = wrapper
    const push = vi.spyOn(router, 'push')

    const rows = wrapper.findAll('[data-testid="fragment-row"]')
    rowElement(rows, 0).focus()
    await rows[0].trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(sceneState.selectedStory).toBe(1)
    expect(push).toHaveBeenCalledWith('/platinum/1')
    push.mockRestore()
  })

  it('says in the live region which fragment the reader is on', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchiveInDocument()
    mounted = wrapper

    const live = wrapper.find('[data-testid="archive-live"]')
    expect(live.attributes('aria-live')).toBe('polite')
    expect(live.text()).toBe('')

    const rows = wrapper.findAll('[data-testid="fragment-row"]')
    rowElement(rows, 0).focus()
    await nextTick()

    expect(live.text()).toContain('Фрагмент 1 из 2')
    expect(live.text()).toContain('Ночь перед экзаменом')

    await rows[0].trigger('keydown', { key: 'ArrowDown' })

    expect(live.text()).toContain('Фрагмент 2 из 2')
    expect(live.text()).toContain('Смена на проходной')
  })

  it('stays quiet while the pointer runs over the list', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchiveInDocument()
    mounted = wrapper

    const rows = wrapper.findAll('[data-testid="fragment-row"]')
    await rows[0].trigger('mouseenter')
    await rows[1].trigger('mouseenter')

    expect(sceneState.focusedStory).toBe(2)
    expect(wrapper.find('[data-testid="archive-live"]').text()).toBe('')
  })

  it('never traps the focus — the reader can leave the archive', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchiveInDocument()
    mounted = wrapper

    const rows = wrapper.findAll('[data-testid="fragment-row"]')
    rowElement(rows, 0).focus()
    expect(document.activeElement).toBe(rows[0].element)
    expect(sceneState.focusedStory).toBe(1)

    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    rows[0].element.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)

    // The focus left the archive: the space lets the fragment go.
    rowElement(rows, 0).blur()
    expect(sceneState.focusedStory).toBe(null)
  })
})

describe('PlatinumView — the register of the archive: 3D or text alone (P4-T1)', () => {
  beforeEach(() => {
    vi.mocked(listPlatinumStories).mockReset()
    localStorage.clear()
  })

  it('shows the space by default and switches it off and on', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchive()

    const toggle = wrapper.find('[data-testid="archive-mode-toggle"]')
    expect(toggle.exists()).toBe(true)
    expect(toggle.attributes('aria-pressed')).toBe('true')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    expect(localStorage.getItem('bmstudvach-archive-3d')).toBe('off')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(localStorage.getItem('bmstudvach-archive-3d')).toBe('on')
  })

  it('remembers the register of the archive on this device', async () => {
    localStorage.setItem('bmstudvach-archive-3d', 'off')
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))

    const { wrapper } = await mountArchive()

    expect(wrapper.find('[data-testid="archive-mode-toggle"]').attributes('aria-pressed')).toBe(
      'false',
    )
  })

  it('tells the space about the register of the archive', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchive()

    const seen: unknown[] = []
    const listener = (event: Event) => seen.push((event as CustomEvent).detail)
    window.addEventListener('bmstudvach:archive-3d', listener)

    await wrapper.find('[data-testid="archive-mode-toggle"]').trigger('click')

    window.removeEventListener('bmstudvach:archive-3d', listener)
    expect(seen).toEqual([{ enabled: false }])
  })

  it('keeps the rows and the empty state of the archive', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page(PAGE_ONE, 2))
    const { wrapper } = await mountArchive()

    expect(wrapper.findAll('[data-testid="fragment-row"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="archive-mode-toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="platinum-empty"]').exists()).toBe(false)
  })

  it('keeps the switch of the register even when the archive is silent', async () => {
    vi.mocked(listPlatinumStories).mockImplementation(() => page([], 0))
    const { wrapper } = await mountArchive()

    expect(wrapper.find('[data-testid="platinum-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="archive-mode-toggle"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="fragment-row"]')).toHaveLength(0)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/platinum', () => ({
  getPlatinumStory: vi.fn(),
  listPlatinumStories: vi.fn(),
}))

import PlatinumView from '@/views/PlatinumView.vue'
import { listPlatinumStories, type PlatinumStory } from '@/api/platinum'
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

function page(results: PlatinumStory[], count: number) {
  return Promise.resolve<Paginated<PlatinumStory>>({
    count,
    page: 1,
    pages: 2,
    page_size: 20,
    results,
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

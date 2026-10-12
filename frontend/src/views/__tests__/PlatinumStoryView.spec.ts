import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/platinum', () => ({
  getPlatinumStory: vi.fn(),
  listPlatinumStories: vi.fn(),
}))

import PlatinumStoryView from '@/views/PlatinumStoryView.vue'
import { getPlatinumStory } from '@/api/platinum'
import { ApiRequestError } from '@/api/client'

async function mountStory(storyId = 5) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/platinum', component: { template: '<div />' } },
      { path: '/platinum/:storyId(\\d+)', component: PlatinumStoryView, props: true },
    ],
  })
  await router.push(`/platinum/${storyId}`)
  await router.isReady()
  const wrapper = mount(PlatinumStoryView, {
    props: { storyId },
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

describe('PlatinumStoryView', () => {
  beforeEach(() => {
    vi.mocked(getPlatinumStory).mockReset()
  })

  it('renders the full story on a calm reading surface', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({
      id: 5,
      title: 'Ночь перед экзаменом',
      body: 'Длинный текст истории,\nкоторый целиком здесь.',
      source_type: 'generated',
      status: 'published',
      generation_metadata: {},
      created_at: new Date().toISOString(),
      published_at: '2026-05-01T10:00:00Z',
    })
    const wrapper = await mountStory()

    expect(wrapper.get('.story-title').text()).toBe('Ночь перед экзаменом')
    expect(wrapper.get('.story-body').text()).toContain('Длинный текст истории')
    expect(wrapper.text()).toContain('node #5')
    expect(wrapper.text()).toContain('generated')
  })

  it('explains a missing fragment honestly', async () => {
    vi.mocked(getPlatinumStory).mockRejectedValue(new ApiRequestError(404, 'Not found'))
    const wrapper = await mountStory(999)
    expect(wrapper.text()).toContain('Фрагмент не найден в архиве.')
  })

  it('offers a way back to the archive', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({
      id: 1,
      title: 'T',
      body: 'B',
      source_type: '',
      status: 'published',
      generation_metadata: {},
      created_at: new Date().toISOString(),
      published_at: null,
    })
    const wrapper = await mountStory(1)
    expect(wrapper.find('.story-back').attributes('href')).toBe('/platinum')
  })
})

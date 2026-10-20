import { describe, expect, it, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/three/sceneState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/three/sceneState')>()
  return { ...actual, emitSceneEvent: vi.fn() }
})

import NotFoundView from '@/views/NotFoundView.vue'
import { emitSceneEvent } from '@/three/sceneState'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/stats', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()

  const wrapper = mount(NotFoundView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('NotFoundView', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('говорит языком прибора, а не серым текстом', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="not-found-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="not-found"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="state-not-found"]').exists()).toBe(true)
    expect(wrapper.find('.state__label').text()).toContain('FRAGMENT LOST')
    expect(wrapper.find('.state__message').text().length).toBeGreaterThan(10)
    expect(wrapper.find('h1').text()).toContain('СИГНАЛ ПОТЕРЯН')
  })

  it('рисует след вырезанного фрагмента, а не пустую рамку', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="not-found-cut"]').exists()).toBe(true)
    expect(wrapper.find('.state__cut-hole').exists()).toBe(true)
    expect(wrapper.find('.state__cut-tear').exists()).toBe(true)
  })

  it('зовёт rescue-пинг и возвращает в сеть', async () => {
    vi.useFakeTimers()
    const { wrapper, router } = await mountView()

    const button = wrapper.find('.state__button')
    expect(button.text()).toContain('вернуться в сеть')

    await button.trigger('click')

    expect(emitSceneEvent).toHaveBeenCalledWith({ type: 'rescue' })
    // Пока идёт поиск маршрута, действие закрыто — и текст это говорит.
    expect(wrapper.find('.state__button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.state__button').text()).toContain('поиск маршрута')

    vi.advanceTimersByTime(320)
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
  })

  it('оставляет запасной выход в статистику', async () => {
    const { wrapper } = await mountView()

    const link = wrapper.find('a.lost-node__link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/stats')
  })
})

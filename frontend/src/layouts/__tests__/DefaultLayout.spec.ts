import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/moderation', () => ({
  staffMe: vi.fn().mockResolvedValue({ is_staff: false }),
}))
vi.mock('@/api/boards', () => ({
  listBoards: vi.fn().mockResolvedValue([]),
}))

import DefaultLayout from '@/layouts/DefaultLayout.vue'

async function mountLayout() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div>page</div>' } }],
  })
  router.push('/')
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
})

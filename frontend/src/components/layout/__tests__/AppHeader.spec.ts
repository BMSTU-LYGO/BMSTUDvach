import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

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

vi.mock('@/api/boards', () => ({
  listBoards: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/api/moderation', () => ({
  staffMe: vi.fn().mockResolvedValue({ is_staff: false }),
}))

import AppHeader from '@/components/layout/AppHeader.vue'
import { useSound } from '@/composables/useSound'

async function mountHeader() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(AppHeader, {
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  return wrapper
}

describe('AppHeader sound toggle', () => {
  let wrapper: Awaited<ReturnType<typeof mountHeader>>
  const soundButton = () => wrapper.find('.fx-toggle--sound')

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    useSound().setEnabled(false)
  })

  afterEach(() => wrapper?.unmount())

  it('renders the sound toggle off by default', async () => {
    wrapper = await mountHeader()
    const btn = soundButton()
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('aria-pressed')).toBe('false')
    expect(btn.attributes('aria-label')).toBe('Включить звук')
    expect(btn.attributes('title')).toBe('Звук выключен')
  })

  it('flips aria-pressed, labels and localStorage on click', async () => {
    wrapper = await mountHeader()
    const btn = soundButton()

    await btn.trigger('click')

    expect(btn.attributes('aria-pressed')).toBe('true')
    expect(btn.attributes('aria-label')).toBe('Выключить звук')
    expect(btn.attributes('title')).toBe('Звук включён')
    await nextTick()
    expect(localStorageMock.getItem('bmstudvach-sound')).toBe('true')
  })

  it('returns to the off state on the second click', async () => {
    wrapper = await mountHeader()
    const btn = soundButton()

    await btn.trigger('click')
    await btn.trigger('click')

    expect(btn.attributes('aria-pressed')).toBe('false')
    expect(btn.attributes('aria-label')).toBe('Включить звук')
    await nextTick()
    expect(localStorageMock.getItem('bmstudvach-sound')).toBe('false')
  })
})

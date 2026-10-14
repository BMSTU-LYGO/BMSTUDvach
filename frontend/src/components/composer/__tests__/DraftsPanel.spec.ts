import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

import DraftsPanel from '@/components/composer/DraftsPanel.vue'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
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

function seed(key: string, value: unknown) {
  localStorageMock.setItem(key, JSON.stringify(value))
}

async function mountPanel() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/threads/:id', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  return mount(DraftsPanel, { global: { plugins: [router] } })
}

describe('DraftsPanel', () => {
  beforeEach(() => localStorageMock.clear())

  it('renders nothing when there are no drafts', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="drafts-panel"]').exists()).toBe(false)
    expect(wrapper.find('ul').exists()).toBe(false)
  })

  it('lists a draft with its preview, thread id and resume link', async () => {
    const longBody = 'а'.repeat(120)
    localStorageMock.setItem(
      'draft:signal-7',
      JSON.stringify({ body: longBody, files: [], timestamp: Date.now() - 12 * 60 * 1000 }),
    )

    const wrapper = await mountPanel()
    const panel = wrapper.find('[data-testid="drafts-panel"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('НЕЗАКОНЧЕННЫЕ СИГНАЛЫ')

    const row = wrapper.find('[data-testid="draft-row-7"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('#7')
    expect(row.text()).toContain('12 мин назад')

    const preview = row.find('.drafts__preview')
    expect(preview.text()).toHaveLength(81)
    expect(preview.text().endsWith('…')).toBe(true)

    const link = row.find('a.drafts__resume')
    expect(link.text()).toContain('продолжить')
    expect(link.attributes('href')).toBe('/threads/7')
  })

  it('shows a file count label when the draft carries attachments', async () => {
    seed('draft:signal-8', { body: 'с файлами', files: [{}, {}], timestamp: Date.now() })

    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="draft-row-8"]').text()).toContain('2 файла')
  })

  it('removes a draft from the list and from localStorage on delete', async () => {
    seed('draft:signal-7', { body: 'удалить меня', files: [], timestamp: Date.now() })
    seed('draft:signal-8', { body: 'оставить', files: [], timestamp: Date.now() + 1 })

    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="draft-row-7"]').exists()).toBe(true)

    await wrapper
      .find('[data-testid="draft-row-7"] [aria-label="Удалить черновик"]')
      .trigger('click')

    expect(wrapper.find('[data-testid="draft-row-7"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="draft-row-8"]').exists()).toBe(true)
    expect(localStorageMock.getItem('draft:signal-7')).toBe(null)
    expect(localStorageMock.getItem('draft:signal-8')).not.toBe(null)
  })
})

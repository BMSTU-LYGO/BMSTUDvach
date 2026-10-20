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
      { path: '/boards/:boardSlug', component: { template: '<div />' } },
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
      JSON.stringify({
        body: longBody,
        files: [],
        timestamp: Date.now() - 12 * 60 * 1000,
      }),
    )

    const wrapper = await mountPanel()
    const panel = wrapper.find('[data-testid="drafts-panel"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('ЧЕРНОВИКИ')

    const row = wrapper.find('[data-testid="draft-row-7"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('ответ в треде #7')
    expect(row.text()).toContain('12 мин назад')

    const preview = row.find('.drafts__preview')
    expect(preview.text()).toHaveLength(81)
    expect(preview.text().endsWith('…')).toBe(true)

    const link = row.find('a.drafts__resume')
    expect(link.text()).toContain('продолжить')
    expect(link.attributes('href')).toBe('/threads/7')
  })

  it('shows a file count label when the draft carries attachments', async () => {
    seed('draft:signal-8', {
      body: 'с файлами',
      files: [{}, {}],
      timestamp: Date.now(),
    })

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

  describe('every composer’s draft kind (P2-T3)', () => {
    it('lists a launch draft under its board and links to ?launch=1', async () => {
      seed('draft:launch-bauman', {
        title: 'ИУ7 снова сломало',
        body: 'После обновления',
        files: [],
        timestamp: Date.now(),
      })
      seed('draft:signal-7', {
        body: 'незаконченный ответ',
        files: [],
        timestamp: Date.now(),
      })

      const wrapper = await mountPanel()

      const row = wrapper.find('[data-testid="draft-row-launch-bauman"]')
      expect(row.exists()).toBe(true)
      expect(row.text()).toContain('новый тред /bauman/')
      // the title is what a thread is announced by
      expect(row.find('.drafts__preview').text()).toBe('ИУ7 снова сломало')

      const link = row.find('a.drafts__resume')
      expect(link.attributes('href')).toBe('/boards/bauman?launch=1')

      // signal rows are unchanged by the new kinds
      expect(wrapper.find('[data-testid="draft-row-7"]').text()).toContain(
        'ответ в треде #7',
      )
    })

    it('lists a report draft by post, with no resume link to invent', async () => {
      seed('draft:report-42', {
        title: 'spam',
        body: 'флуд ссылками в каждом треде',
        files: [],
        timestamp: Date.now(),
      })

      const wrapper = await mountPanel()

      const row = wrapper.find('[data-testid="draft-row-report-42"]')
      expect(row.exists()).toBe(true)
      expect(row.text()).toContain('жалоба на пост #42')
      expect(row.find('.drafts__preview').text()).toBe('флуд ссылками в каждом треде')
      // the key knows the post but not its thread — no phantom navigation
      expect(row.find('a.drafts__resume').exists()).toBe(false)
      // the buffer itself can still be dropped
      expect(row.find('[aria-label="Удалить черновик"]').exists()).toBe(true)
    })

    it('lists all three kinds at once, newest first', async () => {
      seed('draft:signal-7', { body: 'ответ', files: [], timestamp: 1000 })
      seed('draft:launch-b', { title: 'тред', body: '', files: [], timestamp: 3000 })
      seed('draft:report-9', { body: 'жалоба', files: [], timestamp: 2000 })

      const wrapper = await mountPanel()
      const rows = wrapper.findAll('.drafts__row')

      expect(rows.map((row) => row.attributes('data-testid'))).toEqual([
        'draft-row-launch-b',
        'draft-row-report-9',
        'draft-row-7',
      ])
    })

    it('drops any of the three kinds by its own key', async () => {
      seed('draft:signal-7', { body: 'ответ', files: [], timestamp: 1000 })
      seed('draft:launch-b', { title: 'тред', body: '', files: [], timestamp: 2000 })
      seed('draft:report-9', { body: 'жалоба', files: [], timestamp: 3000 })

      const wrapper = await mountPanel()
      await wrapper
        .find('[data-testid="draft-row-report-9"] [aria-label="Удалить черновик"]')
        .trigger('click')

      expect(wrapper.find('[data-testid="draft-row-report-9"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="draft-row-launch-b"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="draft-row-7"]').exists()).toBe(true)
      expect(localStorageMock.getItem('draft:report-9')).toBe(null)
    })

    it('ignores husk keys that are not real drafts', async () => {
      seed('draft:launch-', {
        title: 'нет раздела',
        body: '',
        files: [],
        timestamp: 1000,
      })
      seed('draft:report-x', { body: 'не пост', files: [], timestamp: 2000 })
      seed('draft:signal-x', { body: 'не тред', files: [], timestamp: 3000 })
      seed('draft:launch-b', { title: '', body: '', files: [], timestamp: 4000 })

      const wrapper = await mountPanel()
      expect(wrapper.find('[data-testid="drafts-panel"]').exists()).toBe(false)
    })
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

import AboutView from '@/views/AboutView.vue'
import { collectLocalDataKeys } from '@/composables/useLocalData'

vi.mock('@/composables/useLocalData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useLocalData')>()
  return { ...actual, resetLocalData: vi.fn(() => 3) }
})

import { resetLocalData } from '@/composables/useLocalData'

const store = new Map<string, string>()

const localStorageMock = {
  get length() {
    return store.size
  },
  key: (index: number) => [...store.keys()][index] ?? null,
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => {
    store.set(key, String(value))
  },
  removeItem: (key: string) => {
    store.delete(key)
  },
  clear: () => {
    store.clear()
  },
}

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  return mount(AboutView, { global: { plugins: [router] } })
}

function setLocalData() {
  localStorage.setItem('bmstud-identity', JSON.stringify({ name: 'Пустота' }))
  localStorage.setItem('bmstudvach-watchlist', JSON.stringify([{ threadId: 7 }]))
  localStorage.setItem('board-view-mode', 'grid')
  localStorage.setItem('draft:new-thread', JSON.stringify({ body: 'текст', timestamp: 1 }))
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

function buttons(wrapper: ReturnType<typeof mountPage>) {
  return wrapper.findAll('button.privacy-button')
}

describe('AboutView', () => {
  beforeEach(() => {
    store.clear()
    vi.mocked(resetLocalData).mockClear()
    vi.mocked(resetLocalData).mockImplementation(() => 3)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('describes the shipped product honestly', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    const wrapper = mount(AboutView, { global: { plugins: [router] } })
    const text = wrapper.text()

    // the archive exists — it must not be promised as future
    expect(text).toContain('Платины')
    expect(text).not.toContain('В будущем появится')
    expect(wrapper.find('a[href="/platinum"]').exists()).toBe(true)

    // the anonymity model is explained, not implied
    expect(text).toContain('Аноним')
    expect(text).toContain('троттлинг')
  })

  it('renders the privacy section with both actions', () => {
    setLocalData()
    const wrapper = mountPage()
    const text = wrapper.text()
    const [download, reset] = buttons(wrapper)

    expect(text).toContain('Приватность и данные')
    expect(text).toContain('bmstud-identity')
    expect(text).toContain('bmstudvach-watchlist')
    expect(text).toContain('board-view-mode')
    expect(text).toContain('draft:*')

    // the listed keys are the ones actually present
    expect(text).toContain(collectLocalDataKeys().join(', '))

    expect(download.text()).toBe('Скачать мои данные')
    expect(download.attributes('aria-label')).toContain('JSON')
    expect(reset.text()).toBe('Стереть локальные данные')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('downloads the local data as a JSON blob', async () => {
    const foreign = 'analytics-id'
    setLocalData()
    localStorage.setItem(foreign, 'чужая-сессия')

    const createObjectURL = vi.fn((_blob: Blob) => 'blob:bmstud')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const wrapper = mountPage()
    await buttons(wrapper)[0].trigger('click')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:bmstud')
    expect(clickSpy).toHaveBeenCalledTimes(1)

    const blob = createObjectURL.mock.calls[0][0]
    expect(blob.type).toBe('application/json')

    const dumped = JSON.parse(await readBlobText(blob))
    expect(Object.keys(dumped.keys)).toEqual([
      'bmstud-identity',
      'bmstudvach-watchlist',
      'board-view-mode',
      'draft:new-thread',
    ])
    // nothing that does not belong to the app
    expect(Object.keys(dumped.keys)).not.toContain(foreign)
    expect(Object.keys(dumped.keys).every((k) => /^(bmstud|board-|draft:)/.test(k))).toBe(true)
    expect(dumped.exported_at).toBeTruthy()
  })

  it('wipes on the second click after an in-UI confirmation', async () => {
    setLocalData()
    vi.mocked(resetLocalData).mockImplementation(() => 4)

    const wrapper = mountPage()
    const reset = buttons(wrapper)[1]

    await reset.trigger('click')
    expect(reset.text()).toBe('Точно стереть?')
    expect(vi.mocked(resetLocalData)).not.toHaveBeenCalled()

    await reset.trigger('click')
    expect(vi.mocked(resetLocalData)).toHaveBeenCalledTimes(1)
    expect(reset.text()).toBe('Стереть локальные данные')

    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.attributes('aria-live')).toBe('polite')
    expect(status.text()).toContain('Удалено ключей: 4')
  })

  it('drops the confirmation after the timeout', async () => {
    vi.useFakeTimers()
    setLocalData()

    const wrapper = mountPage()
    const reset = buttons(wrapper)[1]

    await reset.trigger('click')
    expect(reset.text()).toBe('Точно стереть?')

    vi.advanceTimersByTime(4000)
    await wrapper.vm.$nextTick()
    expect(reset.text()).toBe('Стереть локальные данные')

    await reset.trigger('click')
    expect(reset.text()).toBe('Точно стереть?')
    expect(vi.mocked(resetLocalData)).not.toHaveBeenCalled()
  })

  it('cancels the confirmation on Escape', async () => {
    setLocalData()
    const wrapper = mountPage()
    const reset = buttons(wrapper)[1]

    await reset.trigger('click')
    expect(reset.text()).toBe('Точно стереть?')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(reset.text()).toBe('Стереть локальные данные')

    await reset.trigger('click')
    expect(vi.mocked(resetLocalData)).not.toHaveBeenCalled()
  })
})

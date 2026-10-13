import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/search', () => ({
  searchNetwork: vi.fn(),
}))

import ScanLens from '../ScanLens.vue'
import { searchNetwork } from '@/api/search'
import type { SearchResults } from '@/api/search'

function mountLens(open = true) {
  return mount(ScanLens, {
    props: { open },
    attachTo: document.body,
    // keep teleported content inside the wrapper tree for assertions
    global: { stubs: { teleport: true } },
  })
}

const data: SearchResults = {
  query: 'сесси',
  threads: [
    {
      id: 4,
      board: 'study',
      title: 'Советы по сдаче сессии',
      is_pinned: true,
      is_locked: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      bumped_at: new Date().toISOString(),
      reply_count: 7,
    },
  ],
  posts: [
    {
      id: 28,
      thread: 10,
      thread_title: 'Оффтоп',
      is_op: false,
      snippet: '…сплетнями про сессию…',
    },
  ],
}

describe('ScanLens', () => {
  beforeEach(() => {
    vi.mocked(searchNetwork).mockReset()
    vi.mocked(searchNetwork).mockResolvedValue(data)
  })

  it('renders closed when open=false', () => {
    const wrapper = mountLens(false)
    expect(wrapper.find('[data-testid="scan-lens"]').exists()).toBe(false)
  })

  it('searches on input and groups threads and posts', async () => {
    const wrapper = mountLens()
    const input = wrapper.find('[data-testid="scan-input"]')
    await input.setValue('сесси')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="scan-row"]')
    expect(rows).toHaveLength(2)
    expect(wrapper.text()).toContain('ТРЕДЫ')
    expect(wrapper.text()).toContain('ПОСТЫ')
    expect(rows[0].text()).toContain('Советы по сдаче сессии')
    expect(rows[1].text()).toContain('сплетнями про сессию')
  })

  it('shows the empty state when nothing matches', async () => {
    vi.mocked(searchNetwork).mockResolvedValue({ query: 'zzz', threads: [], posts: [] })
    const wrapper = mountLens()
    await wrapper.find('[data-testid="scan-input"]').setValue('zzz')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()
    expect(wrapper.text()).toContain('сеть молчит')
  })

  it('closes on Escape and navigates on Enter', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/threads/:id', name: 't', component: { template: '<div/>' } }],
    })
    void router
    const wrapper = mount(ScanLens, {
      props: { open: true },
      global: { plugins: [router], stubs: { teleport: true } },
      attachTo: document.body,
    })
    const input = wrapper.find('[data-testid="scan-input"]')
    await input.setValue('сесси')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()

    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.emitted('update:open')).toBeTruthy()
    expect(wrapper.emitted('update:open')![0]).toEqual([false])
    expect(router.currentRoute.value.fullPath).toBe('/threads/4')

    await wrapper.setProps({ open: true })
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update:open')!.at(-1)).toEqual([false])
  })
})

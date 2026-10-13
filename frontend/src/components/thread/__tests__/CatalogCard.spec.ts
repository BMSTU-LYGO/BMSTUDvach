import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

import CatalogCard from '../CatalogCard.vue'
import type { ThreadSummary } from '@/types'

const thread: ThreadSummary = {
  id: 42,
  board: 'study',
  title: 'Как выжить на пятой паре',
  is_pinned: false,
  is_locked: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  bumped_at: new Date().toISOString(),
  reply_count: 7,
  op_snippet: 'Пятая пара — это испытание на прочность…',
}

function mountCard(t = thread) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  return mount(CatalogCard, {
    props: { thread: t },
    global: { plugins: [router] },
  })
}

describe('CatalogCard', () => {
  it('shows node id, title, teaser and reply count', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('#42')
    expect(wrapper.text()).toContain('Как выжить на пятой паре')
    expect(wrapper.text()).toContain('Пятая пара')
    expect(wrapper.text()).toContain('7')
    expect(wrapper.text()).toContain('/study/')
  })

  it('emits open with the event and thread id', async () => {
    const wrapper = mountCard()
    await wrapper.find('a').trigger('click')
    expect(wrapper.emitted('open')).toBeTruthy()
    expect(wrapper.emitted('open')![0][1]).toBe(42)
  })

  it('marks pinned and locked nodes', () => {
    const wrapper = mountCard({ ...thread, is_pinned: true, is_locked: true })
    expect(wrapper.find('.catalog-card--pinned').exists()).toBe(true)
    expect(wrapper.find('.catalog-card__pin').attributes('title')).toBe('Закреплён')
    expect(wrapper.find('.catalog-card__lock').attributes('title')).toBe('Закрыт')
  })

  it('shows the PIN badge text on a pinned node', () => {
    const wrapper = mountCard({ ...thread, is_pinned: true })
    const badge = wrapper.find('[data-testid="pin-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text().toLowerCase()).toContain('pin')
  })

  it('hides the PIN badge when the node is not pinned', () => {
    const wrapper = mountCard()
    expect(wrapper.find('[data-testid="pin-badge"]').exists()).toBe(false)
  })

  it('works without a teaser', () => {
    const wrapper = mountCard({ ...thread, op_snippet: undefined })
    expect(wrapper.find('.catalog-card__snippet').exists()).toBe(false)
    expect(wrapper.text()).toContain('Как выжить на пятой паре')
  })
})

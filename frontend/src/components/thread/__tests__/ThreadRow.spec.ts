import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

import ThreadRow from '../ThreadRow.vue'
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
}

function mountRow(t = thread, showBoard = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  return mount(ThreadRow, {
    props: { thread: t, showBoard },
    global: { plugins: [router] },
  })
}

describe('ThreadRow', () => {
  it('renders the title, reply count and board slug', () => {
    const wrapper = mountRow(thread, true)
    expect(wrapper.find('[data-testid="thread-row"]').text()).toContain(
      'Как выжить на пятой паре',
    )
    expect(wrapper.text()).toContain('/study/')
    expect(wrapper.text()).toContain('7')
  })

  it('hides the pin badge for a plain thread', () => {
    const wrapper = mountRow()
    expect(wrapper.find('[data-testid="pin-badge"]').exists()).toBe(false)
  })

  it('shows the PIN badge for a pinned thread', () => {
    const wrapper = mountRow({ ...thread, is_pinned: true })
    const badge = wrapper.find('[data-testid="pin-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.attributes('title')).toBe('Закреплён')
    expect(badge.text().toLowerCase()).toContain('pin')
  })
})

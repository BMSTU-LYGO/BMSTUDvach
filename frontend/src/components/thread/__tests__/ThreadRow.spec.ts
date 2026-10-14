import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

import ThreadRow from '../ThreadRow.vue'
import { __reloadHiddenThreads } from '@/composables/useHiddenThreads'
import type { ThreadSummary } from '@/types'

const STORAGE_KEY = 'bmstud-hidden-threads'

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

function hiddenStored(): number[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : []
}

function enableReveal() {
  localStorage.setItem('bmstud-hidden-reveal', '1')
  window.dispatchEvent(new StorageEvent('storage', { key: 'bmstud-hidden-reveal' }))
}

describe('ThreadRow', () => {
  beforeEach(() => {
    localStorage.clear()
    __reloadHiddenThreads()
  })

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

  it('hides the thread on the hide button click without opening it', async () => {
    const wrapper = mountRow()
    await wrapper.find('[data-testid="thread-hide"]').trigger('click')

    expect(hiddenStored()).toEqual([42])
    expect(wrapper.emitted('open')).toBeFalsy()
  })

  it('labels the hide button and flips it to a return button when hidden', async () => {
    const wrapper = mountRow()
    const hide = wrapper.find('[data-testid="thread-hide"]')

    expect(hide.attributes('aria-label')).toBe('Скрыть тред')
    expect(hide.attributes('title')).toBe('Скрыть тред')
    expect(hide.attributes('aria-pressed')).toBe('false')

    await hide.trigger('click')
    enableReveal()
    await wrapper.vm.$nextTick()

    const restore = wrapper.find('[data-testid="thread-hide"]')
    expect(restore.attributes('aria-label')).toBe('Показать тред')
    expect(restore.attributes('aria-pressed')).toBe('true')
  })

  it('does not render itself while hidden and reveal is off', async () => {
    const wrapper = mountRow()
    await wrapper.find('[data-testid="thread-hide"]').trigger('click')
    expect(wrapper.find('[data-testid="thread-row"]').exists()).toBe(false)
  })

  it('renders hidden rows muted once reveal is on', async () => {
    const wrapper = mountRow()
    await wrapper.find('[data-testid="thread-hide"]').trigger('click')

    enableReveal()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="thread-row"]').exists()).toBe(true)
    expect(wrapper.find('.thread-item--hidden').exists()).toBe(true)
  })
})

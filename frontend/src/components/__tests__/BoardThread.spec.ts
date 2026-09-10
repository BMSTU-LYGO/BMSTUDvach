import { describe, expect, it } from 'vitest'

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import BoardList from '@/components/BoardList.vue'
import ThreadCard from '@/components/ThreadCard.vue'
import ThreadList from '@/components/ThreadList.vue'
import type { Board, ThreadSummary } from '@/types'

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/boards/:boardSlug', component: { template: '<div />' } },
      { path: '/threads/:threadId', component: { template: '<div />' } },
    ],
  })
}

const stubBoard: Board = {
  id: 1,
  slug: 'b',
  name: 'Разное',
  description: '',
  is_active: true,
  order: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const stubThread: ThreadSummary = {
  id: 1,
  board: 'b',
  title: 'Тестовый тред',
  is_pinned: false,
  is_locked: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  bumped_at: new Date().toISOString(),
  reply_count: 5,
}

describe('BoardList', () => {
  it('renders board links', () => {
    setActivePinia(createPinia())
    const router = createTestRouter()
    const wrapper = mount(BoardList, {
      props: { boards: [stubBoard] },
      global: { plugins: [router] },
    })
    expect(wrapper.find('[data-testid="board-list"]').exists()).toBe(true)
    const link = wrapper.find('.board-link')
    expect(link.text()).toContain('/b/')
    expect(link.text()).toContain('Разное')
  })
})

describe('ThreadCard', () => {
  it('renders thread title and reply count', () => {
    setActivePinia(createPinia())
    const router = createTestRouter()
    const wrapper = mount(ThreadCard, {
      props: { thread: stubThread },
      global: { plugins: [router] },
    })
    expect(wrapper.find('[data-testid="thread-card"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Тестовый тред')
    expect(wrapper.text()).toContain('5')
  })

  it('shows pin icon for pinned threads', () => {
    setActivePinia(createPinia())
    const router = createTestRouter()
    const wrapper = mount(ThreadCard, {
      props: { thread: { ...stubThread, is_pinned: true } },
      global: { plugins: [router] },
    })
    expect(wrapper.text()).toContain('📌')
  })
})

describe('ThreadList', () => {
  it('renders empty state when no threads', () => {
    setActivePinia(createPinia())
    const router = createTestRouter()
    const wrapper = mount(ThreadList, {
      props: { threads: [] },
      global: { plugins: [router] },
    })
    expect(wrapper.text()).toContain('пока нет тредов')
  })

  it('renders thread cards', () => {
    setActivePinia(createPinia())
    const router = createTestRouter()
    const wrapper = mount(ThreadList, {
      props: { threads: [stubThread] },
      global: { plugins: [router] },
    })
    expect(wrapper.findAll('[data-testid="thread-card"]')).toHaveLength(1)
  })
})
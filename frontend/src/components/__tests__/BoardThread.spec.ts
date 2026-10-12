import { describe, expect, it } from 'vitest'

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import BoardList from '@/components/BoardList.vue'
import type { Board } from '@/types'

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
  thread_count: 3,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
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

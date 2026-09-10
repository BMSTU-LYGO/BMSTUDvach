import { describe, expect, it } from 'vitest'

import { mount } from '@vue/test-utils'

import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import LoadingState from '@/components/LoadingState.vue'

describe('LoadingState', () => {
  it('renders default label', () => {
    const wrapper = mount(LoadingState)
    expect(wrapper.text()).toContain('Загрузка')
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true)
  })

  it('renders custom label', () => {
    const wrapper = mount(LoadingState, { props: { label: 'Подождите' } })
    expect(wrapper.text()).toContain('Подождите')
  })
})

describe('ErrorState', () => {
  it('renders default message', () => {
    const wrapper = mount(ErrorState)
    expect(wrapper.text()).toContain('Ошибка')
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true)
  })

  it('renders custom message', () => {
    const wrapper = mount(ErrorState, { props: { message: 'Сеть недоступна' } })
    expect(wrapper.text()).toContain('Сеть недоступна')
  })

  it('shows retry button when onRetry provided', () => {
    const wrapper = mount(ErrorState, { props: { onRetry: () => {} } })
    expect(wrapper.find('button').exists()).toBe(true)
  })
})

describe('EmptyState', () => {
  it('renders default message', () => {
    const wrapper = mount(EmptyState)
    expect(wrapper.text()).toContain('пусто')
    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true)
  })
})
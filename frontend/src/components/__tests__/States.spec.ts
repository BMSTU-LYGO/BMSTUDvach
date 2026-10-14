import { describe, expect, it, vi } from 'vitest'

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

  it('exposes the signal-scan frame and a live status region', () => {
    const wrapper = mount(LoadingState)

    const root = wrapper.find('[data-testid="loading"]')
    const frame = wrapper.find('[data-testid="state-loading"]')

    expect(frame.exists()).toBe(true)
    expect(root.attributes('role')).toBe('status')
    expect(root.attributes('aria-live')).toBe('polite')
    expect(root.text()).toContain('SCANNING')
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

  it('is an alert region with the lost-node frame', () => {
    const wrapper = mount(ErrorState)

    const root = wrapper.find('[data-testid="error"]')
    const frame = wrapper.find('[data-testid="state-error"]')

    expect(frame.exists()).toBe(true)
    expect(root.attributes('role')).toBe('alert')
    expect(root.text()).toContain('ERROR')
  })

  it('calls onRetry when the retry button is pressed', async () => {
    const onRetry = vi.fn()
    const wrapper = mount(ErrorState, { props: { onRetry } })

    const button = wrapper.find('button')
    expect(button.attributes('type')).toBe('button')

    await button.trigger('click')

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('keeps no retry control when onRetry is absent', () => {
    const wrapper = mount(ErrorState)
    expect(wrapper.find('button').exists()).toBe(false)
  })
})

describe('EmptyState', () => {
  it('renders default message', () => {
    const wrapper = mount(EmptyState)
    expect(wrapper.text()).toContain('пусто')
    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true)
  })

  it('renders custom message', () => {
    const wrapper = mount(EmptyState, { props: { message: 'В сети пока тихо.' } })
    expect(wrapper.text()).toContain('В сети пока тихо.')
  })

  it('exposes the empty-node frame as a live status region', () => {
    const wrapper = mount(EmptyState)

    const root = wrapper.find('[data-testid="empty"]')
    const frame = wrapper.find('[data-testid="state-empty"]')

    expect(frame.exists()).toBe(true)
    expect(root.attributes('role')).toBe('status')
    expect(root.attributes('aria-live')).toBe('polite')
    expect(root.text()).toContain('EMPTY NODE')
  })
})

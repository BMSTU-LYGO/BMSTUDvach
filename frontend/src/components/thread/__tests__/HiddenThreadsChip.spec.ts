import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

import HiddenThreadsChip from '../HiddenThreadsChip.vue'
import { useHiddenThreads, __reloadHiddenThreads } from '@/composables/useHiddenThreads'

function mountChip() {
  return mount(HiddenThreadsChip)
}

describe('HiddenThreadsChip', () => {
  beforeEach(() => {
    localStorage.clear()
    __reloadHiddenThreads()
  })

  it('stays out of the way when nothing is hidden', () => {
    const wrapper = mountChip()
    expect(wrapper.find('[data-testid="hidden-chip"]').exists()).toBe(false)
  })

  it('shows the hidden count', () => {
    useHiddenThreads().hide(7)
    useHiddenThreads().hide(9)

    const wrapper = mountChip()
    expect(wrapper.find('[data-testid="hidden-chip"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('скрыто: 2')
  })

  it('toggles the reveal flag with aria-pressed', async () => {
    useHiddenThreads().hide(7)
    const wrapper = mountChip()
    const toggle = wrapper.find('[data-testid="hidden-chip-toggle"]')

    expect(toggle.attributes('aria-pressed')).toBe('false')
    expect(toggle.attributes('aria-label')).toBe('Показать скрытые')
    expect(toggle.text()).toContain('Показать скрытые')

    await toggle.trigger('click')

    const active = wrapper.find('[data-testid="hidden-chip-toggle"]')
    expect(active.attributes('aria-pressed')).toBe('true')
    expect(localStorage.getItem('bmstud-hidden-reveal')).toBe('1')
  })

  it('refreshes the counter when another tab hides a thread', async () => {
    useHiddenThreads().hide(7)
    const wrapper = mountChip()
    expect(wrapper.text()).toContain('скрыто: 1')

    localStorage.setItem('bmstud-hidden-threads', JSON.stringify([7, 9]))
    window.dispatchEvent(new StorageEvent('storage', { key: 'bmstud-hidden-threads' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('скрыто: 2')
  })
})

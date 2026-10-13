import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import SortLens from '../SortLens.vue'
import type { ThreadOrder } from '@/api/threads'

function mountLens(modelValue: ThreadOrder = 'bump') {
  return mount(SortLens, { props: { modelValue } })
}

describe('SortLens', () => {
  it('renders the three order options', () => {
    const wrapper = mountLens()
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(3)
    expect(wrapper.text()).toContain('ап')
    expect(wrapper.text()).toContain('ответы')
    expect(wrapper.text()).toContain('новые')
    expect(wrapper.attributes('aria-label')).toBe('Сортировка тредов')
    expect(wrapper.find('[role="group"]').exists()).toBe(true)
  })

  it('emits change with the picked order', async () => {
    const wrapper = mountLens('bump')
    await wrapper.find('button[data-order="replies"]').trigger('click')

    expect(wrapper.emitted('change')).toBeTruthy()
    expect(wrapper.emitted('change')![0][0]).toBe('replies')
  })

  it('does not emit when the active order is clicked again', async () => {
    const wrapper = mountLens('bump')
    await wrapper.find('button[data-order="bump"]').trigger('click')

    expect(wrapper.emitted('change')).toBeFalsy()
  })

  it('marks the active option with aria-pressed and the active class', () => {
    const wrapper = mountLens('newest')
    const active = wrapper.find('button[data-order="newest"]')
    const others = wrapper
      .findAll('button')
      .filter((btn) => btn.attributes('data-order') !== 'newest')

    expect(active.attributes('aria-pressed')).toBe('true')
    expect(active.classes()).toContain('sort-lens__btn--active')
    expect(others.every((btn) => btn.attributes('aria-pressed') === 'false')).toBe(true)
    expect(
      others.every((btn) => !btn.classes().includes('sort-lens__btn--active')),
    ).toBe(true)
  })
})

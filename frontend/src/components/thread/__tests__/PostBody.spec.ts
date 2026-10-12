import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import PostBody from '../PostBody.vue'

const known = new Set([1, 42])

function mountBody(body: string) {
  return mount(PostBody, { props: { body, knownIds: known } })
}

describe('PostBody', () => {
  it('renders plain text untouched', () => {
    const wrapper = mountBody('просто текст\nс новой строки')
    expect(wrapper.text()).toBe('просто текст\nс новой строки')
    expect(wrapper.findAll('.post-link')).toHaveLength(0)
  })

  it('renders >>id as a real anchor to the post', () => {
    const wrapper = mountBody('смотри >>42 вот')
    const link = wrapper.find('.post-link')
    expect(link.attributes('href')).toBe('#post-42')
    expect(link.text()).toBe('>>42')
    expect(link.classes()).not.toContain('post-link--dead')
  })

  it('marks links to unknown posts as dead and inert', () => {
    const wrapper = mountBody('>>404 нет такого')
    const link = wrapper.find('.post-link')
    expect(link.classes()).toContain('post-link--dead')
    expect(link.attributes('aria-disabled')).toBe('true')
    link.trigger('click')
    expect(wrapper.emitted('navigate')).toBeFalsy()
  })

  it('emits navigate on click of a live link', async () => {
    const wrapper = mountBody('>>42')
    await wrapper.find('.post-link').trigger('click')
    expect(wrapper.emitted('navigate')).toEqual([[42]])
  })

  it('emits preview on hover and preview-leave on exit', async () => {
    const wrapper = mountBody('>>42')
    await wrapper.find('.post-link').trigger('mouseenter', { clientX: 10, clientY: 20 })
    expect(wrapper.emitted('preview')).toHaveLength(1)
    expect(wrapper.emitted('preview')![0][0]).toBe(42)

    await wrapper.find('.post-link').trigger('mouseleave')
    expect(wrapper.emitted('preview-leave')).toHaveLength(1)
  })
})

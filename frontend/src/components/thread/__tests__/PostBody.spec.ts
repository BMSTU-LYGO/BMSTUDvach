import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import PostBody from '../PostBody.vue'
import type { Attachment } from '@/types'

const known = new Set([1, 42])

const attachments: Attachment[] = [
  {
    id: 11,
    url: '/media/first.png',
    mime_type: 'image/png',
    size: 2048,
    width: 1200,
    height: 800,
    original_name: 'first.png',
    created_at: '2026-02-01T10:00:00Z',
  },
  {
    id: 12,
    url: '/media/second.png',
    mime_type: 'image/png',
    size: 4096,
    width: 800,
    height: 600,
    original_name: 'second.png',
    created_at: '2026-02-01T10:01:00Z',
  },
]

function mountBody(body: string, extra: Record<string, unknown> = {}) {
  return mount(PostBody, { props: { body, knownIds: known, ...extra } })
}

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }))
}

describe('PostBody', () => {
  it('renders plain text untouched', () => {
    const wrapper = mountBody('просто текст\nс новой строки')
    expect(wrapper.text()).toBe('просто текст\nс новой строки')
    expect(wrapper.findAll('.post-link')).toHaveLength(0)
  })

  it('shows no author signature when the post carries none', () => {
    const wrapper = mountBody('без подписи')
    expect(wrapper.find('[data-testid="post-signature"]').exists()).toBe(false)
  })

  it('renders the author name alone when there is no tripcode', () => {
    const wrapper = mount(PostBody, {
      props: { body: 'текст', knownIds: known, author: 'Пустота' },
    })
    const signature = wrapper.find('[data-testid="post-signature"]')
    expect(signature.text()).toBe('Пустота')
    expect(signature.attributes('aria-label')).toBe('Автор: Пустота')
    expect(wrapper.find('[data-testid="post-tripcode"]').exists()).toBe(false)
  })

  it('renders the tripcode next to the author name', () => {
    const wrapper = mount(PostBody, {
      props: { body: 'текст', knownIds: known, author: 'Пустота', tripcode: '!u3V2icOT' },
    })
    const signature = wrapper.find('[data-testid="post-signature"]')
    expect(signature.text()).toBe('Пустота!u3V2icOT')
    expect(signature.text()).toContain('!u3V2icOT')
    expect(signature.attributes('aria-label')).toBe('Автор: Пустота !u3V2icOT')
    expect(wrapper.find('[data-testid="post-tripcode"]').classes()).toContain(
      'post-signature__tripcode',
    )
  })

  it('falls back to Аноним for a tripcode without a display name', () => {
    const wrapper = mount(PostBody, {
      props: { body: 'текст', knownIds: known, author: '', tripcode: '!u3V2icOT' },
    })
    expect(wrapper.find('[data-testid="post-signature"]').text()).toBe('Аноним!u3V2icOT')
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

  it('renders no attachment tiles and no lightbox without attachments', () => {
    const wrapper = mountBody('просто текст')
    expect(wrapper.find('[data-testid="post-attachments"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="attachment-lightbox"]').exists()).toBe(false)
  })

  it('opens the lightbox on the tile that was clicked', async () => {
    const wrapper = mountBody('смотри вложение', { attachments })
    const tiles = wrapper.findAll('[data-testid^="post-attachment-"]')
    expect(tiles).toHaveLength(2)
    expect(tiles[0].attributes('aria-label')).toBe('Открыть вложение first.png')

    await tiles[1].trigger('click')

    const lightbox = wrapper.find('[data-testid="attachment-lightbox"]')
    const dialog = wrapper.find('[role="dialog"]')
    expect(lightbox.exists()).toBe(true)
    expect(dialog.attributes('aria-label')).toBe('Вложение 2 из 2')
    expect(lightbox.find('[data-testid="lightbox-counter"]').text()).toBe('02 / 02')
    expect(lightbox.find('[data-testid="lightbox-image"]').attributes('src')).toBe(
      '/media/second.png',
    )
    expect(lightbox.find('[data-testid="lightbox-next"]').attributes('disabled')).toBeDefined()
  })

  it('closes the lightbox on Escape', async () => {
    const wrapper = mountBody('текст', { attachments })
    await wrapper.find('[data-testid="post-attachment-0"]').trigger('click')
    expect(wrapper.find('[data-testid="attachment-lightbox"]').exists()).toBe(true)

    press('Escape')
    await nextTick()
    expect(wrapper.find('[data-testid="attachment-lightbox"]').exists()).toBe(false)
  })

  it('walks the attachments with the arrow keys inside the lightbox', async () => {
    const wrapper = mountBody('текст', { attachments })
    await wrapper.find('[data-testid="post-attachment-0"]').trigger('click')

    press('ArrowRight')
    await nextTick()
    expect(wrapper.find('[data-testid="lightbox-counter"]').text()).toBe('02 / 02')
    expect(wrapper.find('[data-testid="lightbox-image"]').attributes('src')).toBe(
      '/media/second.png',
    )

    press('ArrowLeft')
    await nextTick()
    expect(wrapper.find('[data-testid="lightbox-counter"]').text()).toBe('01 / 02')
    expect(wrapper.find('[data-testid="lightbox-image"]').attributes('src')).toBe(
      '/media/first.png',
    )
  })
})

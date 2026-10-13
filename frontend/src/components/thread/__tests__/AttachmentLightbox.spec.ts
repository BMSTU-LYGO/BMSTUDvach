import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

import AttachmentLightbox from '../AttachmentLightbox.vue'
import type { Attachment } from '@/types'

const attachments: Attachment[] = [
  {
    id: 11,
    url: '/media/launch-cover.png',
    mime_type: 'image/png',
    size: 204_800,
    width: 1600,
    height: 900,
    original_name: 'launch-cover.png',
    created_at: '2026-02-01T10:00:00Z',
  },
  {
    id: 12,
    url: '/media/board-plan.png',
    mime_type: 'image/png',
    size: 5120,
    width: 800,
    height: 600,
    original_name: 'board-plan.png',
    created_at: '2026-02-01T10:01:00Z',
  },
  {
    id: 13,
    url: '/media/lecture.pdf',
    mime_type: 'application/pdf',
    size: 1_677_721,
    width: null,
    height: null,
    original_name: 'lecture.pdf',
    created_at: '2026-02-01T10:02:00Z',
  },
]

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const mounted: VueWrapper[] = []

function mountLightbox(props: Record<string, unknown> = {}, attach = false) {
  const wrapper = mount(AttachmentLightbox, {
    props: { attachments, modelValue: true, ...props },
    attachTo: attach ? document.body : undefined,
  })
  mounted.push(wrapper)
  return wrapper
}

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...init }))
}

describe('AttachmentLightbox', () => {
  afterEach(() => {
    // every viewer keeps a window keydown listener while open — leftovers from
    // an earlier test would steal focus and keys
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.style.overflow = ''
  })

  it('renders nothing while modelValue is false', async () => {
    const wrapper = mountLightbox({ modelValue: false })
    await nextTick()
    expect(wrapper.find('[data-testid="attachment-lightbox"]').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('renders nothing when the post has no attachments at all', async () => {
    const wrapper = mountLightbox({ attachments: [], modelValue: true })
    await nextTick()
    await settle()
    expect(wrapper.find('[data-testid="attachment-lightbox"]').exists()).toBe(false)
  })

  it('opens on the requested index and shows the current attachment', async () => {
    const wrapper = mountLightbox({ startIndex: 1 })
    await settle()

    const image = wrapper.find('[data-testid="lightbox-image"]')
    expect(image.exists()).toBe(true)
    expect(image.attributes('src')).toBe('/media/board-plan.png')
    expect(image.attributes('alt')).toBe('board-plan.png')
    expect(image.attributes('loading')).toBe('eager')
    expect(image.attributes('width')).toBe('800')
    expect(image.attributes('height')).toBe('600')

    expect(wrapper.find('[data-testid="lightbox-counter"]').text()).toBe('02 / 03')
    expect(wrapper.find('[role="dialog"]').attributes('aria-modal')).toBe('true')
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('Вложение 2 из 3')
    expect(wrapper.text()).toContain('image/png')
  })

  it('names the source post in the dialog label when postId is given', async () => {
    const wrapper = mountLightbox({ startIndex: 2, postId: 42 })
    await settle()
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe(
      'Вложение 3 из 3 — пост #42',
    )
  })

  it('walks the attachments with the nav buttons', async () => {
    const wrapper = mountLightbox({ startIndex: 0 })
    await settle()

    expect(wrapper.find('[data-testid="lightbox-prev"]').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="lightbox-next"]').trigger('click')
    expect(wrapper.find('[data-testid="lightbox-image"]').attributes('src')).toBe(
      '/media/board-plan.png',
    )
    expect(wrapper.find('[data-testid="lightbox-counter"]').text()).toBe('02 / 03')

    await wrapper.find('[data-testid="lightbox-next"]').trigger('click')
    expect(wrapper.find('[data-testid="lightbox-next"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="lightbox-file"]').exists()).toBe(true)

    await wrapper.find('[data-testid="lightbox-prev"]').trigger('click')
    expect(wrapper.find('[data-testid="lightbox-counter"]').text()).toBe('02 / 03')
  })

  it('walks the attachments with the arrow keys', async () => {
    const wrapper = mountLightbox({ startIndex: 0 })
    await settle()

    press('ArrowRight')
    await nextTick()
    expect(wrapper.find('[data-testid="lightbox-image"]').attributes('src')).toBe(
      '/media/board-plan.png',
    )

    press('ArrowLeft')
    await nextTick()
    expect(wrapper.find('[data-testid="lightbox-image"]').attributes('src')).toBe(
      '/media/launch-cover.png',
    )
  })

  it('ignores keys while closed', async () => {
    const wrapper = mountLightbox({ modelValue: false })
    await nextTick()
    press('ArrowRight')
    press('Escape')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })

  it('emits close on Escape and on the close button', async () => {
    const wrapper = mountLightbox()
    await settle()

    press('Escape')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])

    await wrapper.find('[data-testid="lightbox-close"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false], [false]])
  })

  it('emits close on a click on the backdrop, not on the panel', async () => {
    const wrapper = mountLightbox({}, true)
    await settle()

    await wrapper.find('[data-testid="lightbox-panel"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()

    await wrapper.find('[data-testid="attachment-lightbox"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('locks the body scroll while open and releases it on close', async () => {
    const wrapper = mountLightbox({}, true)
    await settle()
    expect(document.body.style.overflow).toBe('hidden')

    await wrapper.setProps({ modelValue: false })
    await settle()
    expect(document.body.style.overflow).toBe('')
  })

  it('moves focus into the dialog and returns it to the opener', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const wrapper = mountLightbox({}, true)
    await wrapper.setProps({ modelValue: true })
    await settle()

    const closeButton = wrapper.find('[data-testid="lightbox-close"]').element as HTMLElement
    expect(document.activeElement).toBe(closeButton)

    await wrapper.setProps({ modelValue: false })
    await settle()
    expect(document.activeElement).toBe(opener)

    opener.remove()
  })

  it('keeps Tab inside the dialog', async () => {
    const wrapper = mountLightbox({ startIndex: 1 }, true)
    await settle()

    const enabled = wrapper.findAll('button[aria-label]:not([disabled])')
    expect(enabled.map((node) => node.attributes('aria-label')).sort()).toEqual([
      'Закрыть просмотр',
      'Предыдущее вложение',
      'Следующее вложение',
    ])

    // jsdom does not walk the Tab order itself, so assert the wrap points:
    // Tab on the last focusable cycles to the first one, Shift+Tab the other way.
    const closeButton = wrapper.find('[data-testid="lightbox-close"]').element as HTMLElement
    const prevButton = wrapper.find('[data-testid="lightbox-prev"]').element as HTMLElement
    const nextButton = wrapper.find('[data-testid="lightbox-next"]').element as HTMLElement

    nextButton.focus()
    press('Tab')
    await nextTick()
    expect(document.activeElement).toBe(closeButton)

    closeButton.focus()
    press('Tab', { shiftKey: true })
    await nextTick()
    expect(document.activeElement).toBe(nextButton)

    // Tab between two dialog controls is left to the browser
    prevButton.focus()
    press('Tab')
    await nextTick()
    expect(document.activeElement).toBe(prevButton)
  })

  it('clamps the start index into the available range', async () => {
    const wrapper = mountLightbox({ startIndex: 99 })
    await settle()
    expect(wrapper.find('[data-testid="lightbox-counter"]').text()).toBe('03 / 03')

    await wrapper.setProps({ startIndex: -5 })
    await nextTick()
    expect(wrapper.find('[data-testid="lightbox-counter"]').text()).toBe('01 / 03')
  })

  it('opens with the entered class so the fade transition can run', async () => {
    const wrapper = mountLightbox({}, true)
    await settle()
    expect(wrapper.find('[data-testid="attachment-lightbox"]').classes()).toContain(
      'lightbox--entered',
    )
  })
})

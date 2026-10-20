import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia } from 'pinia'

import PostBody from '../PostBody.vue'
import { useDraftQuoteStore } from '@/stores/draftQuote'
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
  return mount(PostBody, {
    props: { body, knownIds: known, ...extra },
    global: { plugins: [createPinia()] },
  })
}

function mountQuoted(body: string, extra: Record<string, unknown> = {}) {
  const pinia = createPinia()
  const wrapper = mount(PostBody, {
    props: { body, knownIds: known, threadId: 7, ...extra },
    global: { plugins: [pinia] },
  })
  return { wrapper, quotes: useDraftQuoteStore(pinia) }
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

  it('renders no signature — the author lives in the post header now', () => {
    const wrapper = mountBody('текст', { author: 'Пустота', tripcode: '!u3V2icOT' })
    expect(wrapper.find('[data-testid="post-signature"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="post-tripcode"]').exists()).toBe(false)
    expect(wrapper.find('.post-signature').exists()).toBe(false)
    expect(wrapper.text()).toBe('текст')
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
    expect(
      lightbox.find('[data-testid="lightbox-next"]').attributes('disabled'),
    ).toBeDefined()
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

describe('PostBody — quote into the draft (QUOTE-01)', () => {
  it('requests a quote on a plain click of a live link', async () => {
    const { wrapper, quotes } = mountQuoted('смотри >>42')
    await wrapper.find('.post-link').trigger('click')

    expect(quotes.pendingQuote).toEqual({ threadId: 7, postId: 42, token: 1 })
    // navigation still happens on the very same click
    expect(wrapper.emitted('navigate')).toEqual([[42]])
    wrapper.unmount()
  })

  it('flashes the link that was just quoted', async () => {
    const { wrapper } = mountQuoted('>>42')
    expect(wrapper.find('.post-link').classes()).not.toContain('post-link--quoted')

    await wrapper.find('.post-link').trigger('click')
    expect(wrapper.find('.post-link').classes()).toContain('post-link--quoted')
    wrapper.unmount()
  })

  it('keeps the browser behaviour for Ctrl/Cmd/Shift/alt clicks', async () => {
    for (const modifiers of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
    ]) {
      const { wrapper, quotes } = mountQuoted('>>42')
      await wrapper.find('.post-link').trigger('click', modifiers)
      expect(quotes.pendingQuote).toBe(null)
      wrapper.unmount()
    }
  })

  it('leaves middle clicks (button 1) to the browser', async () => {
    const { wrapper, quotes } = mountQuoted('>>42')
    await wrapper.find('.post-link').trigger('mousedown', { button: 1 })
    await wrapper.find('.post-link').trigger('click', { button: 1 })
    expect(quotes.pendingQuote).toBe(null)
    wrapper.unmount()
  })

  it('quotes by the keyboard too — Enter on the focused link', async () => {
    const { wrapper, quotes } = mountQuoted('>>42')
    await wrapper.find('.post-link').trigger('keydown.enter')

    expect(quotes.pendingQuote).toEqual({ threadId: 7, postId: 42, token: 1 })
    expect(wrapper.emitted('navigate')).toEqual([[42]])
    wrapper.unmount()
  })

  it('keeps Ctrl+Enter for the browser', async () => {
    const { wrapper, quotes } = mountQuoted('>>42')
    await wrapper.find('.post-link').trigger('keydown.enter', { ctrlKey: true })
    expect(quotes.pendingQuote).toBe(null)
    wrapper.unmount()
  })

  it('does not quote a dead link', async () => {
    const { wrapper, quotes } = mountQuoted('>>404')
    await wrapper.find('.post-link').trigger('click')
    expect(quotes.pendingQuote).toBe(null)
    wrapper.unmount()
  })

  it('does not quote when the thread is unknown', async () => {
    const pinia = createPinia()
    const wrapper = mount(PostBody, {
      props: { body: '>>42', knownIds: known },
      global: { plugins: [pinia] },
    })
    await wrapper.find('.post-link').trigger('click')

    expect(useDraftQuoteStore(pinia).pendingQuote).toBe(null)
    expect(wrapper.emitted('navigate')).toEqual([[42]])
    wrapper.unmount()
  })

  it('prefers the threadId prop over the route', async () => {
    const { wrapper, quotes } = mountQuoted('>>42', { threadId: 99 })
    await wrapper.find('.post-link').trigger('click')
    expect(quotes.pendingQuote?.threadId).toBe(99)
    wrapper.unmount()
  })
})

describe('PostBody — greentext', () => {
  it('renders a line starting with > as a greentext quote', () => {
    const wrapper = mountBody('> цитата')
    const quote = wrapper.find('[data-testid="greentext"]')
    expect(quote.exists()).toBe(true)
    expect(quote.classes()).toContain('post-quote')
    expect(quote.text()).toBe('> цитата')
  })

  it('greentexts a > buried in leading whitespace', () => {
    const wrapper = mountBody('   > цитата с отступом')
    expect(wrapper.find('[data-testid="greentext"]').exists()).toBe(true)
  })

  it('greentexts a lone >>42 reply line and keeps the link alive', () => {
    const wrapper = mountBody('>>42')
    const quote = wrapper.find('[data-testid="greentext"]')
    expect(quote.exists()).toBe(true)
    const link = quote.find('.post-link')
    expect(link.attributes('href')).toBe('#post-42')
    expect(link.text()).toBe('>>42')
  })

  it('groups consecutive greentext lines into one quote block', () => {
    const wrapper = mountBody('> первая\n> вторая\n>>42 и\n> последняя')
    const quotes = wrapper.findAll('[data-testid="greentext"]')
    expect(quotes).toHaveLength(1)
    expect(quotes[0].text()).toBe('> первая\n> вторая\n>>42 и\n> последняя')
  })

  it('separates greentext runs by a blank line', () => {
    const wrapper = mountBody('> первая\n\n> вторая')
    expect(wrapper.findAll('[data-testid="greentext"]')).toHaveLength(2)
  })

  it('leaves a >>id link clickable inside a greentext line', async () => {
    const { wrapper, quotes } = mountQuoted('> цитата >>42 дальше')
    const quote = wrapper.find('[data-testid="greentext"]')
    const link = quote.find('.post-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('aria-disabled')).toBeUndefined()
    expect(link.attributes('title')).toBe(
      'Пост #42: клик вставит цитату >>42 в черновик, Ctrl/Cmd+клик — новая вкладка',
    )

    await link.trigger('click')
    expect(quotes.pendingQuote).toEqual({ threadId: 7, postId: 42, token: 1 })
    expect(wrapper.emitted('navigate')).toEqual([[42]])
    wrapper.unmount()
  })

  it('does not treat >> in the middle of a line as greentext', () => {
    const wrapper = mountBody('смотри >>42 это не цитата')
    expect(wrapper.find('[data-testid="greentext"]').exists()).toBe(false)
    expect(wrapper.findAll('.post-paragraph')).toHaveLength(1)
    expect(wrapper.find('.post-link').text()).toBe('>>42')
  })

  it('does not treat a line that merely contains > as greentext', () => {
    const wrapper = mountBody('не цитата > вот так')
    expect(wrapper.find('[data-testid="greentext"]').exists()).toBe(false)
  })

  it('mixes greentext and plain lines in one post', () => {
    const wrapper = mountBody('вступление\n> цитата\nзаключение')
    expect(wrapper.findAll('[data-testid="greentext"]')).toHaveLength(1)
    expect(wrapper.findAll('.post-paragraph')).toHaveLength(2)
  })
})

describe('PostBody — reading typography', () => {
  it('keeps paragraphs as separate blocks', () => {
    const wrapper = mountBody('первый абзац\n\nвторой абзац')
    expect(wrapper.findAll('.post-paragraph')).toHaveLength(2)
    expect(wrapper.text()).toBe('первый абзац\n\nвторой абзац')
  })

  it('renders every body line as its own line block', () => {
    const wrapper = mountBody('раз\nдва\nтри')
    expect(wrapper.findAll('.post-line')).toHaveLength(3)
  })

  it('keeps the body text verbatim in the DOM', () => {
    const body = '  отступ\n> цитата\n\nконец'
    const wrapper = mountBody(body)
    expect(wrapper.find('.post-body').element.textContent).toBe(body)
  })

  it('keeps inner indentation and padding of a line', () => {
    const wrapper = mountBody('    код    тут')
    const line = wrapper.find('.post-line')
    expect(line.element.textContent).toBe('    код    тут')
  })

  it('keeps a long word inside a single line block', () => {
    const long = 'а'.repeat(300)
    const wrapper = mountBody(`${long} >>42`)
    expect(wrapper.findAll('.post-line')).toHaveLength(1)
    expect(wrapper.find('.post-body').element.textContent).toBe(`${long} >>42`)
  })
})

describe('PostBody — подсветка поиска (FINDPOST-01)', () => {
  it('оборачивает совпадения в mark, сохраняя текст дословно', () => {
    const wrapper = mountBody('это тред про треды', { highlight: 'тред' })
    const marks = wrapper.findAll('mark.post-highlight')
    expect(marks).toHaveLength(2)
    expect(marks.map((m) => m.text())).toEqual(['тред', 'тред'])
    expect(wrapper.find('.post-body').element.textContent).toBe('это тред про треды')
  })

  it('подсвечивает регистронезависимо', () => {
    const wrapper = mountBody('ТРЕД', { highlight: 'тред' })
    expect(wrapper.findAll('mark.post-highlight')).toHaveLength(1)
    expect(wrapper.find('mark.post-highlight').text()).toBe('ТРЕД')
  })

  it('без запроса или без совпадений mark не появляется', () => {
    expect(mountBody('просто текст').findAll('mark.post-highlight')).toHaveLength(0)
    expect(
      mountBody('просто текст', { highlight: 'zzz' }).findAll('mark.post-highlight'),
    ).toHaveLength(0)
  })

  it('не подсвечивает внутри ссылок >>id', () => {
    const wrapper = mountBody('>>42', { highlight: '42' })
    expect(wrapper.findAll('mark.post-highlight')).toHaveLength(0)
    expect(wrapper.find('.post-link').text()).toBe('>>42')
  })
})

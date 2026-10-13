import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'

import SignalDock from '../SignalDock.vue'
import { useDraftQuoteStore } from '@/stores/draftQuote'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

function mountDock(props: Record<string, unknown> = {}) {
  return mount(SignalDock, {
    props: { threadId: 7, ...props },
    global: { plugins: [createPinia()] },
  })
}

describe('SignalDock', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('is writable immediately — no expand click required', () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toContain('передать')
  })

  it('expands the working surface on focus', async () => {
    const wrapper = mountDock()
    expect(wrapper.classes()).not.toContain('signal-dock--active')

    await wrapper.find('[data-testid="signal-input"]').trigger('focus')
    expect(wrapper.classes()).toContain('signal-dock--active')
    expect(wrapper.emitted('focus')).toHaveLength(1)
    // attach action only appears in the active console
    expect(wrapper.find('button[aria-label="Прикрепить файлы"]').exists()).toBe(true)
  })

  it('emits submit without clearing itself — parent owns the API', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('тестовый сигнал')

    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')![0][0]).toMatchObject({ body: 'тестовый сигнал' })

    // no success yet → body must survive
    expect((wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value).toBe(
      'тестовый сигнал',
    )
  })

  it('resets only after parent-confirmed success', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('сигнал')

    await wrapper.setProps({ successToken: 1 })
    await nextTick()

    expect((wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.classes()).not.toContain('signal-dock--active')
  })

  it('keeps input and shows error on parent API failure', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('важный текст')

    await wrapper.setProps({ submitError: 'Сеть недоступна' })
    await nextTick()

    expect(wrapper.find('[data-testid="dock-error"]').text()).toContain('Сеть недоступна')
    expect((wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value).toBe(
      'важный текст',
    )
  })

  it('submits on Cmd/Ctrl+Enter', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('быстрый ответ')

    await input.trigger('keydown', { key: 'Enter', metaKey: true })
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('opens the Command Lens with "/" and closes with Escape', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')

    await input.trigger('keydown', { key: '/' })
    expect(wrapper.find('[data-testid="command-lens"]').exists()).toBe(true)

    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="command-lens"]').exists()).toBe(false)
  })

  it('runs /clear from the Command Lens', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('мусор')

    await input.trigger('keydown', { key: 'k', metaKey: true })
    const clearCmd = wrapper
      .findAll('[data-testid="command-lens"] button')
      .find((b) => b.text().includes('Очистить'))
    await clearCmd!.trigger('click')

    expect((wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value).toBe('')
  })

  it('restores a buffered draft silently on mount', async () => {
    localStorageMock.setItem(
      'draft:signal-7',
      JSON.stringify({ body: 'незаконченный сигнал', files: [], timestamp: Date.now() }),
    )
    const wrapper = mountDock()
    await nextTick()

    expect((wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value).toBe(
      'незаконченный сигнал',
    )
    expect(wrapper.classes()).toContain('signal-dock--active')
  })

  it('prefixes >>id and shows the context node for a reply', async () => {
    const wrapper = mountDock()
    await wrapper.setProps({ replyContext: { postId: 123 } })
    await nextTick()

    expect((wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value).toBe('>>123\n')
    const node = wrapper.find('[data-testid="reply-context"]')
    expect(node.text()).toContain('#123')

    await wrapper.find('button[aria-label="Убрать контекст ответа"]').trigger('click')
    expect(wrapper.emitted('clear-context')).toHaveLength(1)
    expect((wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value).toBe('')
  })

  it('sends sage in the payload when the quiet signal is on', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('не бампите')

    const sageBtn = wrapper.find('button[aria-label*="Тихий сигнал"]')
    await sageBtn.trigger('click')
    expect(sageBtn.attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="sage-marker"]').exists()).toBe(true)

    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')![0][0]).toMatchObject({ body: 'не бампите', sage: true })
  })

  it('previews the signal with links and meta before transmit', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('согласен с >>42')

    const previewBtn = wrapper.find('button[aria-label="Предпросмотр сообщения"]')
    await previewBtn.trigger('click')

    const preview = wrapper.find('[data-testid="dock-preview"]')
    expect(preview.exists()).toBe(true)
    expect(preview.text()).toContain('согласен с')
    expect(preview.text()).toContain('>>42')
    expect(preview.text()).toContain('обычный ответ')
  })

  it('keeps the transmit node disabled while empty', () => {
    const wrapper = mountDock()
    const transmit = wrapper.find('.transmit')
    expect(transmit.attributes('aria-disabled')).toBe('true')
  })

  it('sends the stored identity name in the payload', async () => {
    localStorageMock.setItem('bmstud-identity', JSON.stringify({ name: 'Пустота#sekret' }))
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('подписанный ответ')

    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')![0][0]).toMatchObject({
      body: 'подписанный ответ',
      name: 'Пустота#sekret',
    })
  })

  it('sends no name when no identity is stored', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('анонимный ответ')

    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')![0][0]).not.toHaveProperty('name')
  })

  it('persists a name typed into the identity capsule', async () => {
    const wrapper = mountDock()
    await wrapper.find('[data-testid="identity-input"]').setValue('Пустота#sekret')

    expect(localStorageMock.getItem('bmstud-identity')).toContain('sekret')

    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('ответ')
    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')![0][0]).toMatchObject({ name: 'Пустота#sekret' })
  })
})

function makeFile(name: string, type: string) {
  return new File([new Uint8Array(2048)], name, { type })
}

describe('SignalDock paste (PASTE-01)', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  /**
   * jsdom has no ClipboardEvent, so a paste is a bubbling Event carrying a
   * mocked clipboardData. Dispatching on the textarea also proves the dock
   * container handler sees the bubbled event (text paste never swallowed).
   */
  function dispatchPaste(wrapper: VueWrapper, files: File[]) {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.assign(event, { clipboardData: { files } })
    wrapper.find('[data-testid="signal-input"]').element.dispatchEvent(event)
    return event
  }

  // Paste intake mounts the Cargo Rail on next tick; let the scheduler run
  // mount → addFiles → files update → render before asserting on the DOM.
  function settle() {
    return new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('attaches a pasted image through the same rail path as drop', async () => {
    const wrapper = mountDock()

    const event = dispatchPaste(wrapper, [makeFile('pasted.png', 'image/png')])
    await settle()

    expect(wrapper.findAll('.capsule__name').map((n) => n.text())).toEqual(['pasted.png'])
    expect(wrapper.classes()).toContain('signal-dock--active')
    expect(wrapper.find('[data-testid="dock-error"]').exists()).toBe(false)
    // binary must not leak into the textarea
    expect(event.defaultPrevented).toBe(true)

    await wrapper.find('[data-testid="signal-input"]').setValue('с файлом')
    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')![0][0]).toMatchObject({
      attachments: [expect.objectContaining({ name: 'pasted.png' })],
    })
  })

  it('rejects an unsupported pasted type and adds nothing', async () => {
    const wrapper = mountDock()

    dispatchPaste(wrapper, [makeFile('vector.svg', 'image/svg+xml')])
    await settle()

    expect(wrapper.find('[data-testid="dock-error"]').text()).toContain('неподдерживаемый формат')
    expect(wrapper.findAll('.capsule__name')).toHaveLength(0)
    expect(wrapper.find('.capsule--rejected').exists()).toBe(true)

    await wrapper.find('[data-testid="signal-input"]').setValue('текст без вложения')
    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')![0][0]).toMatchObject({ attachments: [] })
  })

  it('lets a plain text paste through untouched', async () => {
    const wrapper = mountDock()

    const event = dispatchPaste(wrapper, [])
    await settle()

    expect(event.defaultPrevented).toBe(false)
    expect(wrapper.findAll('[data-testid="attachment-capsule"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="dock-error"]').exists()).toBe(false)
  })

  it('ignores paste while the dock is submitting', async () => {
    const wrapper = mountDock({ submitting: true })

    dispatchPaste(wrapper, [makeFile('late.png', 'image/png')])
    await settle()

    expect(wrapper.findAll('[data-testid="attachment-capsule"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="dock-error"]').exists()).toBe(false)
  })

  it('holds the 4-file limit on paste', async () => {
    const wrapper = mountDock()
    const files = Array.from({ length: 5 }, (_, i) => makeFile(`file-${i}.png`, 'image/png'))

    dispatchPaste(wrapper, files)
    await settle()

    expect(wrapper.findAll('.capsule__name').map((n) => n.text())).toEqual([
      'file-0.png',
      'file-1.png',
      'file-2.png',
      'file-3.png',
    ])
    expect(wrapper.find('[data-testid="dock-error"]').text()).toContain('достигнут лимит файлов')
  })
})

describe('SignalDock quotes (QUOTE-01)', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('receives a requested quote into the draft and expands', async () => {
    const pinia = createPinia()
    const wrapper = mount(SignalDock, {
      props: { threadId: 7 },
      global: { plugins: [pinia] },
    })

    const store = useDraftQuoteStore(pinia)
    store.requestQuote(7, 55)
    await nextTick()
    await nextTick()

    expect(
      (wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value,
    ).toContain('>>55')
    expect(wrapper.classes()).toContain('signal-dock--active')
  })

  it('ignores a quote requested for another thread', async () => {
    const pinia = createPinia()
    const wrapper = mount(SignalDock, {
      props: { threadId: 7 },
      global: { plugins: [pinia] },
    })

    const store = useDraftQuoteStore(pinia)
    store.requestQuote(99, 55)
    await nextTick()
    await nextTick()

    expect(
      (wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value,
    ).toBe('')
  })
})

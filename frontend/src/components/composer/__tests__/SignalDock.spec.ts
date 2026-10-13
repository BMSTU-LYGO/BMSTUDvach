import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import SignalDock from '../SignalDock.vue'

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
  return mount(SignalDock, { props: { threadId: 7, ...props } })
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

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import SignalDock from '../SignalDock.vue'
import { classifyError, type TransmitError } from '@/api/errors'
import { ApiRequestError } from '@/api/client'
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

/** The API refusal arrives already classified — never as a raw string. */
function apiError(error: TransmitError | null) {
  return { error }
}

/** jsdom lies about `navigator.onLine`, so pin it for a duration. */
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
}

/** The notice's own retry node, re-found after every re-render. */
const retryButton = (wrapper: VueWrapper) =>
  wrapper.find('[data-testid="transmit-notice-retry"]')

// Intake mounts the Cargo Rail on a later tick; let the scheduler run
// mount → addFiles → files update → render before asserting on the DOM.
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0))
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
    // the lens node is the door to files now — no pill appears on expanding
    expect(wrapper.find('[data-testid="dock-lens"]').exists()).toBe(true)
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

  it('keeps input and shows the classified error on parent API failure', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('важный текст')

    // the same raw failure the browser throws on a dead link
    setOnline(false)
    const offline = classifyError(new TypeError('Failed to fetch'))
    setOnline(true)
    expect(offline.kind).toBe('offline')

    await wrapper.setProps(apiError(offline))
    await nextTick()

    const notice = wrapper.find('[data-testid="dock-error"]')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('Сеть недоступна')
    // the raw fetch text must never surface to the reader
    expect(notice.text()).not.toContain('Failed to fetch')
    // the alert node is the notice itself, not a bare wrapper
    expect(notice.find('[role="alert"]').exists()).toBe(true)
    const surface = wrapper.find('[data-testid="signal-input"]')
    expect((surface.element as HTMLTextAreaElement).value).toBe('важный текст')
  })

  it('counts the throttle down and keeps the Russian message', async () => {
    const wrapper = mountDock()
    await wrapper.find('[data-testid="signal-input"]').trigger('focus')

    await wrapper.setProps(
      apiError(
        classifyError(
          new ApiRequestError(
            429,
            'Request was throttled. Expected available in 42 seconds.',
          ),
        ),
      ),
    )
    await nextTick()

    const notice = wrapper.find('[data-testid="dock-error"]')
    expect(notice.text()).toContain('Слишком много сигналов')
    expect(notice.text()).toContain('Повтор через 42 с')
    // the countdown is a live node of its own, not part of the message
    const countdown = wrapper.find('[data-testid="transmit-notice-countdown"]')
    expect(countdown.text()).toBe('повтор через 42с')
    // the limit is a limit: no button until the window is over
    expect(retryButton(wrapper).exists()).toBe(false)
  })

  it('emits retry from the notice so the parent replays the same attempt', async () => {
    const wrapper = mountDock()
    await wrapper.find('[data-testid="signal-input"]').trigger('focus')

    await wrapper.setProps(
      apiError(classifyError(new ApiRequestError(500, 'Server error'))),
    )
    await nextTick()

    expect(retryButton(wrapper).exists()).toBe(true)
    await retryButton(wrapper).trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
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
    expect(wrapper.find('[data-testid="dock-restored"]').exists()).toBe(false)
  })

  it('names the lost cargo honestly when the buffer remembered files', async () => {
    localStorageMock.setItem(
      'draft:signal-7',
      JSON.stringify({
        body: 'с грузом',
        files: [
          { name: 'чертёж.pdf', size: 10 },
          { name: 'деталь.png', size: 20 },
        ],
        timestamp: Date.now(),
      }),
    )
    const wrapper = mountDock()
    await nextTick()

    const note = wrapper.find('[data-testid="dock-restored"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('2 файла')
    expect(note.attributes('role')).toBe('status')

    // once the operator starts working again, the note steps aside
    await wrapper.find('[data-testid="signal-input"]').setValue('с грузом, снова')
    await nextTick()
    expect(wrapper.find('[data-testid="dock-restored"]').exists()).toBe(false)
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

  it('sends sage in the payload when the quiet signal relay is thrown', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('не бампите')

    // SAGE is a relay on the identity string, not a pill in the rail
    const relay = wrapper.find('[role="switch"][aria-label="Тихий сигнал (SAGE)"]')
    expect(relay.exists()).toBe(true)
    await relay.trigger('click')
    expect(relay.attributes('aria-checked')).toBe('true')
    expect(wrapper.find('[data-testid="sage-marker"]').exists()).toBe(true)

    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')![0][0]).toMatchObject({ body: 'не бампите', sage: true })
  })

  it('turns the sage relay back off and drops the marker', async () => {
    const wrapper = mountDock()
    const relay = wrapper.find('[role="switch"][aria-label="Тихий сигнал (SAGE)"]')

    await relay.trigger('click')
    expect(relay.attributes('aria-checked')).toBe('true')

    await relay.trigger('click')
    expect(relay.attributes('aria-checked')).toBe('false')
    expect(wrapper.find('[data-testid="sage-marker"]').exists()).toBe(false)
  })

  it('previews the signal with links and meta before transmit', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('согласен с >>42')

    // preview is a corner node of the writing surface, not a rail pill
    const toggle = wrapper.find('[data-testid="preview-toggle"]')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-pressed')).toBe('true')

    const preview = wrapper.find('[data-testid="dock-preview"]')
    expect(preview.exists()).toBe(true)
    expect(preview.text()).toContain('согласен с')
    expect(preview.text()).toContain('>>42')
    expect(preview.text()).toContain('обычный ответ')

    // nothing left to preview → the corner node stops being pressed
    await input.setValue('')
    expect(wrapper.find('[data-testid="dock-preview"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="preview-toggle"]').attributes('aria-pressed')).toBe('false')
  })

  it('carries no identical rail pills — the rail is a node row', () => {
    const wrapper = mountDock()
    const rail = wrapper.find('.signal-dock__rail')

    // files / preview / sage / commands are no longer four identical pills
    expect(rail.findAll('.rail-action')).toHaveLength(0)
    expect(rail.findAll('button')).toHaveLength(1)
    expect(rail.text()).not.toContain('файлы')
    expect(rail.text()).not.toContain('команды')
    expect(rail.text()).not.toContain('предпросмотр')

    // left: the lens node + the beacon; right: the hint + the transmit ring
    expect(rail.find('[data-testid="dock-lens"]').exists()).toBe(true)
    expect(rail.find('[data-testid="draft-beacon"]').exists()).toBe(true)
    expect(rail.find('.signal-dock__spacer').exists()).toBe(true)
    expect(rail.find('.transmit').exists()).toBe(true)
    expect(rail.find('.dock-preview-toggle').exists()).toBe(false)
  })

  it('puts the sage relay on the identity string and preview in the surface corner', () => {
    const wrapper = mountDock()

    // the quiet signal is a switch of the dock's identity string — chrome of
    // the main row, never of the action rail
    const main = wrapper.find('.signal-dock__main')
    expect(main.find('[role="switch"]').exists()).toBe(true)
    expect(main.find('.signal-dock__identity').exists()).toBe(true)
    expect(wrapper.find('.signal-dock__rail [role="switch"]').exists()).toBe(false)

    // preview is chrome of the canvas: pinned into its corner slot
    expect(
      wrapper.find('.signal-surface__corner [data-testid="preview-toggle"]').exists(),
    ).toBe(true)
    expect(wrapper.find('.signal-dock__rail [data-testid="preview-toggle"]').exists()).toBe(
      false,
    )
  })

  it('opens the Command Lens from the lens node (⌘K / `/` still do too)', async () => {
    const wrapper = mountDock()

    // one authored node, not a pill: round, and it names its shortcut
    const node = wrapper.find('[data-testid="dock-lens"]')
    await node.trigger('click')
    expect(wrapper.find('[data-testid="command-lens"]').exists()).toBe(true)
    expect(node.attributes('aria-label')).toBe('Команды (⌘K)')

    // the lens has no input of its own, so the node hands the floor to the
    // writing surface — Escape there closes the lens
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="command-lens"]').exists()).toBe(false)

    await input.trigger('keydown', { key: 'k', metaKey: true })
    expect(wrapper.find('[data-testid="command-lens"]').exists()).toBe(true)

    // Escape on the node itself closes it as well
    await node.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="command-lens"]').exists()).toBe(false)
  })

  it('reaches the file picker through the lens on a collapsed dock', async () => {
    const wrapper = mountDock()
    expect(wrapper.find('[data-testid="cargo-rail"]').exists()).toBe(false)

    await wrapper.find('[data-testid="dock-lens"]').trigger('click')
    const attach = wrapper
      .findAll('[data-testid="command-lens"] button')
      .find((b) => b.text().includes('Прикрепить'))
    expect(attach).toBeTruthy()
    await attach!.trigger('click')

    // the picker lives on the Cargo Rail, so the dock must open first
    await nextTick()
    expect(wrapper.classes()).toContain('signal-dock--active')
    expect(wrapper.find('[data-testid="cargo-rail"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="command-lens"]').exists()).toBe(false)
  })

  it('opens the dock on a refusal so the notice can never be hidden', async () => {
    const wrapper = mountDock()
    expect(wrapper.classes()).not.toContain('signal-dock--active')

    await wrapper.setProps(apiError(classifyError(new ApiRequestError(500, 'Server error'))))
    await nextTick()

    expect(wrapper.classes()).toContain('signal-dock--active')
    expect(wrapper.find('[data-testid="dock-error"]').exists()).toBe(true)
  })

  it('collapses on Escape and emits blur', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    expect(wrapper.classes()).toContain('signal-dock--active')

    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.classes()).not.toContain('signal-dock--active')
    expect(wrapper.emitted('blur')).toHaveLength(1)
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

  it('does not fold a refusal away on blur or Escape', async () => {
    const wrapper = mountDock()
    const input = wrapper.find('[data-testid="signal-input"]')
    await input.trigger('focus')
    await input.setValue('')

    await wrapper.setProps(apiError(classifyError(new ApiRequestError(429, 'Request was throttled. Expected available in 30 seconds.'))))
    await nextTick()
    expect(wrapper.classes()).toContain('signal-dock--active')

    // neither a blur nor Escape may hide a refusal the reader has not read
    await input.trigger('blur')
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.classes()).toContain('signal-dock--active')
    expect(wrapper.find('[data-testid="dock-error"]').exists()).toBe(true)

    // a new attempt clears it — only then the dock folds again
    await wrapper.setProps(apiError(null))
    await nextTick()
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.classes()).not.toContain('signal-dock--active')
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
  // Paste intake mounts the Cargo Rail on next tick.
  function dispatchPaste(wrapper: VueWrapper, files: File[]) {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.assign(event, { clipboardData: { files } })
    wrapper.find('[data-testid="signal-input"]').element.dispatchEvent(event)
    return event
  }

  it('attaches a pasted image through the same rail path as drop', async () => {
    const wrapper = mountDock()

    const event = dispatchPaste(wrapper, [makeFile('pasted.png', 'image/png')])
    await settle()

    expect(wrapper.findAll('.capsule__name').map((n) => n.text())).toEqual(['pasted.png'])
    expect(wrapper.classes()).toContain('signal-dock--active')
    expect(wrapper.find('[data-testid="dock-rail-error"]').exists()).toBe(false)
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

    expect(wrapper.find('[data-testid="dock-rail-error"]').text()).toContain(
      'неподдерживаемый формат',
    )
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
    expect(wrapper.find('[data-testid="dock-rail-error"]').exists()).toBe(false)
  })

  it('ignores paste while the dock is submitting', async () => {
    const wrapper = mountDock({ submitting: true })

    dispatchPaste(wrapper, [makeFile('late.png', 'image/png')])
    await settle()

    expect(wrapper.findAll('[data-testid="attachment-capsule"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="dock-rail-error"]').exists()).toBe(false)
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
    expect(wrapper.find('[data-testid="dock-rail-error"]').text()).toContain(
      'достигнут лимит файлов',
    )
  })
})

describe('SignalDock drag intake (P3-T1a)', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  /**
   * jsdom has no DragEvent, so every drag is a synthetic event carrying a
   * mocked dataTransfer — enough to exercise the handlers, and it proves the
   * dock container listeners fire for the bubbled events too.
   */
  function drag(wrapper: VueWrapper, type: string, extra: Record<string, unknown> = {}) {
    return wrapper.trigger(type, {
      clientX: 40,
      clientY: 12,
      dataTransfer: { files: [], dropEffect: '' },
      ...extra,
    })
  }

  it('arms with a magnet edge line, not a dropzone veil', async () => {
    const wrapper = mountDock()

    await drag(wrapper, 'dragenter')

    expect(wrapper.classes()).toContain('signal-dock--intake')
    // the Cargo Rail is the object the payload is magnetised to — it must be
    // visible even on a collapsed dock
    expect(wrapper.find('[data-testid="cargo-rail"]').exists()).toBe(true)
    expect(wrapper.find('.signal-dock__magnet').exists()).toBe(true)
    expect(wrapper.find('.signal-dock__magnet-bead').exists()).toBe(true)
    // the standard dropzone pattern is gone: no veil, no overlay, no prompt
    expect(wrapper.find('.signal-dock__intake').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('перетащите файл')

    await drag(wrapper, 'dragleave', { relatedTarget: null })
    expect(wrapper.classes()).not.toContain('signal-dock--intake')
    expect(wrapper.find('[data-testid="cargo-rail"]').exists()).toBe(false)
  })

  it('opens one empty socket per free slot while the intake is armed', async () => {
    const wrapper = mountDock()

    await drag(wrapper, 'dragenter')

    expect(wrapper.findAll('.cargo-rail__socket')).toHaveLength(4)
    expect(wrapper.find('.cargo-rail').classes()).toContain('cargo-rail--armed')
    // shells, not capsules: no attachment is claimed yet
    expect(wrapper.findAll('[data-testid="attachment-capsule"]')).toHaveLength(0)
    expect(wrapper.find('.cargo-rail__magnet').text()).toContain('свободно 4 из 4')
  })

  it('writes the pointer into CSS custom properties at most once per frame', async () => {
    const wrapper = mountDock()

    await drag(wrapper, 'dragenter')
    await drag(wrapper, 'dragover', { clientX: 160, clientY: 24 })
    await new Promise((resolve) => setTimeout(resolve, 30))

    const style = wrapper.attributes('style') ?? ''
    expect(style).toContain('--edge-x')
    expect(style).toContain('--intake-x')
    expect(style).toContain('--intake-y')

    await drag(wrapper, 'dragleave', { relatedTarget: null })
    expect(wrapper.attributes('style') ?? '').not.toContain('--edge-x')
  })

  it('flies a dropped file into the rail and disarms after the drop', async () => {
    const wrapper = mountDock()

    await drag(wrapper, 'dragenter')
    await drag(wrapper, 'drop', {
      dataTransfer: { files: [makeFile('dropped.png', 'image/png')], dropEffect: 'copy' },
    })
    await settle()

    expect(wrapper.findAll('.capsule__name').map((n) => n.text())).toEqual(['dropped.png'])
    expect(wrapper.classes()).not.toContain('signal-dock--intake')
    // capsules stay: the rail only collapses when it is empty again
    expect(wrapper.find('[data-testid="cargo-rail"]').exists()).toBe(true)
    expect(wrapper.findAll('.cargo-rail__socket')).toHaveLength(0)
    expect(wrapper.find('[data-testid="dock-rail-error"]').exists()).toBe(false)

    await wrapper.find('[data-testid="signal-input"]').setValue('с вложением')
    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')![0][0]).toMatchObject({
      attachments: [expect.objectContaining({ name: 'dropped.png' })],
    })
  })
})

describe('SignalDock — пространственный док: лист, причаливание, связь с нитью (P3-T1c)', () => {
  /** One animation frame — the proximity/proxy writers are rAF-throttled. */
  function frame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  }

  function makeSource() {
    const el = document.createElement('article')
    el.className = 'post-item'
    document.body.appendChild(el)
    return el
  }

  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  /**
   * The sheet gesture is a surface decision, and jsdom computes no CSS from
   * scoped styles — so the one thing that IS structural is asserted on the
   * source: the dock is a paper sheet of the dock/bay/probe family (sharp
   * edges, hairline rule, no card shadow), never a rounded card.
   */
  it('is a paper sheet of the dock/bay/probe family, not a rounded card', () => {
    const wrapper = mountDock()
    // the family class every surface of the family wears
    expect(wrapper.classes()).toContain('signal-dock--sheet')

    const source = readFileSync(
      resolve(process.cwd(), 'src/components/composer/SignalDock.vue'),
      'utf8',
    )
    expect(source).not.toContain('--radius-lg')
    expect(source).not.toContain('box-shadow: var(--shadow')
    // the sheet's ground and rule are the family tokens
    expect(source).toContain('background: var(--paper-raised)')
    expect(source).toContain('border: 1px solid var(--rule)')
  })

  it('carries the reply link on its leading edge — the dock is the fiber’s other end', async () => {
    const wrapper = mountDock()
    // the leading edge exists even with nothing to answer
    expect(wrapper.find('.signal-dock__edge').exists()).toBe(true)
    expect(wrapper.attributes('data-link')).toBe('idle')
    expect(wrapper.classes()).not.toContain('signal-dock--linked')

    // live: the source is in view, the fiber lands on this edge
    await wrapper.setProps({ linkState: 'live' })
    expect(wrapper.attributes('data-link')).toBe('live')
    expect(wrapper.classes()).toContain('signal-dock--linked')
    expect(wrapper.classes()).not.toContain('signal-dock--link-edge')

    // edge: the fiber collapsed into its indicator, the sheet answers with
    // the same solid marker — one link, not two decorations
    await wrapper.setProps({ linkState: 'edge' })
    expect(wrapper.classes()).toContain('signal-dock--linked')
    expect(wrapper.classes()).toContain('signal-dock--link-edge')
  })

  it('burns the leading edge firmer the closer the reader scrolls to the source', async () => {
    const source = makeSource()
    const wrapper = mountDock({ replyContext: { postId: 42, source } })
    await nextTick()

    // jsdom reports zeroed geometry, so the source «meets» the sheet and the
    // proximity saturates — what matters is that it travels as ONE custom
    // property written once per frame, never as a transform
    await frame()
    expect(wrapper.attributes('style') ?? '').toContain('--link-strength')

    setScrollY(600)
    window.dispatchEvent(new Event('scroll'))
    await frame()
    expect(wrapper.attributes('style') ?? '').toContain('--link-strength')

    // the context is gone: the watch disarms and drops the property
    await wrapper.setProps({ replyContext: null })
    expect(wrapper.attributes('style') ?? '').not.toContain('--link-strength')
    source.remove()
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

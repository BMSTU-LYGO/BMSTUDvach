import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import type { TransmitError } from '@/api/errors'
import LaunchBay from '../LaunchBay.vue'
// jsdom never applies scoped CSS, so the paper/ink contract is read from
// the component's own source instead of a phantom computed style.
import BAY_SOURCE from '../LaunchBay.vue?raw'

/** Pull one CSS rule out of the SFC source (jsdom never applies scoped CSS). */
function ruleBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start === -1) return ''
  return source.slice(start, source.indexOf('}', start))
}

const SHEET_RULE = ruleBlock(BAY_SOURCE, '.launch-bay')
const MOBILE_RULES = BAY_SOURCE.slice(BAY_SOURCE.indexOf('@media (max-width: 860px)'))
const REDUCED_RULES = BAY_SOURCE.slice(
  BAY_SOURCE.indexOf('@media (prefers-reduced-motion: reduce)'),
)

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

function mountBay(props: Record<string, unknown> = {}) {
  return mount(LaunchBay, {
    props: { boardSlug: 'b', ...props },
    attachTo: document.body,
  })
}

describe('LaunchBay', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders an editorial title surface and telemetry', async () => {
    const wrapper = mountBay()
    await nextTick()

    const title = wrapper.find('[data-testid="launch-title"]')
    expect(title.exists()).toBe(true)
    expect(title.attributes('aria-label')).toBe('Заголовок треда')
    expect(wrapper.text()).toContain('NEW TRANSMISSION')
    expect(wrapper.text()).toContain('/b/')
    // instrumentation rail, not a form sidebar
    expect(wrapper.text()).toContain('BUFFER')
  })

  it('focuses the title on open', async () => {
    const wrapper = mountBay()
    await nextTick()
    expect(document.activeElement).toBe(wrapper.find('[data-testid="launch-title"]').element)
  })

  it('emits launch without clearing itself — parent owns the API', async () => {
    const wrapper = mountBay()
    await nextTick()

    await wrapper.find('[data-testid="launch-title"]').setValue('Срочно: ИУ7')
    const surface = wrapper.find('[data-testid="signal-input"]')
    await surface.setValue('После обновления всё сломалось')

    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')![0][0]).toMatchObject({
      title: 'Срочно: ИУ7',
      body: 'После обновления всё сломалось',
    })

    // no success yet → input must survive
    expect((wrapper.find('[data-testid="launch-title"]').element as HTMLInputElement).value).toBe(
      'Срочно: ИУ7',
    )
  })

  it('plays the launch sequence and hands the stage back after success', async () => {
    const wrapper = mountBay()
    await nextTick()

    await wrapper.setProps({ successToken: 1 })
    expect(wrapper.classes()).toContain('launch-bay--launched')

    vi.runAllTimers()
    await nextTick()
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('keeps title/body on API failure and shows the structured refusal', async () => {
    const wrapper = mountBay()
    await nextTick()
    await wrapper.find('[data-testid="launch-title"]').setValue('Тред')
    await wrapper.find('[data-testid="signal-input"]').setValue('Тело')

    await wrapper.setProps({
      error: {
        kind: 'offline',
        messageRu: 'Сеть недоступна. Черновик сохранён — попробуем, когда связь вернётся.',
      } satisfies TransmitError,
    })
    await nextTick()

    const notice = wrapper.find('[data-testid="launch-error"]')
    expect(notice.text()).toContain('Сеть недоступна')
    expect(notice.text()).toContain('связь вернётся')
    expect((wrapper.find('[data-testid="launch-title"]').element as HTMLInputElement).value).toBe('Тред')
    expect(wrapper.emitted('done')).toBeFalsy()
  })

  describe('API failure (TransmitNotice in the footer rail)', () => {
    it('counts a throttle window down before the retry appears', async () => {
      const wrapper = mountBay()
      await nextTick()
      await wrapper.setProps({
        error: {
          kind: 'throttle',
          messageRu: 'Слишком много сигналов. Повтор через 3 с.',
          retryAfterSec: 3,
        } satisfies TransmitError,
      })
      await nextTick()

      const node = wrapper.find('[data-testid="launch-error"]')
      expect(node.text()).toContain('Слишком много сигналов. Повтор через 3 с.')
      const countdown = wrapper.find('[data-testid="transmit-notice-countdown"]')
      expect(countdown.exists()).toBe(true)
      expect(countdown.text()).toBe('повтор через 3с')
      // the limit is respected, not raced: no button while counting
      expect(wrapper.find('[data-testid="transmit-notice-retry"]').exists()).toBe(false)

      await vi.advanceTimersByTimeAsync(3000)
      await nextTick()
      expect(wrapper.find('[data-testid="transmit-notice-countdown"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="transmit-notice-retry"]').exists()).toBe(true)
    })

    it('hands an offline refusal to the parent retry without a countdown', async () => {
      const wrapper = mountBay()
      await nextTick()
      await wrapper.setProps({
        error: { kind: 'offline', messageRu: 'Сеть недоступна.' } satisfies TransmitError,
      })
      await nextTick()

      expect(wrapper.find('[data-testid="transmit-notice-countdown"]').exists()).toBe(false)
      const retry = wrapper.find('[data-testid="transmit-notice-retry"]')
      expect(retry.exists()).toBe(true)

      await retry.trigger('click')
      // the bay itself knows no API — the parent's useTransmit repeats
      expect(wrapper.emitted('retry')).toHaveLength(1)
    })

    it('marks the surfaces the API named in its 400 fields', async () => {
      const wrapper = mountBay()
      await nextTick()

      await wrapper.setProps({
        error: {
          kind: 'validation',
          messageRu: 'Сигнал не прошёл проверку.',
          fields: { title: ['Такой тред уже есть.'], body: ['Слишком коротко.'] },
        } satisfies TransmitError,
      })
      await nextTick()

      const title = wrapper.find('[data-testid="launch-title"]')
      expect(wrapper.find('.title-surface').classes()).toContain('title-surface--invalid')
      expect(title.attributes('aria-invalid')).toBe('true')
      expect(wrapper.find('[data-testid="signal-input"]').attributes('aria-invalid')).toBe('true')

      // the fields are listed as «поле: сообщение», not duplicated
      const rows = wrapper.findAll('.notice__field')
      expect(rows).toHaveLength(2)
      expect(rows[0].text()).toContain('заголовок')
      expect(rows[0].text()).toContain('Такой тред уже есть.')

      await wrapper.setProps({ error: null })
      await nextTick()
      expect(wrapper.find('.title-surface').classes()).not.toContain('title-surface--invalid')
      expect(wrapper.find('[data-testid="signal-input"]').attributes('aria-invalid')).toBeUndefined()
    })

    it('breaks the transmit ring once per new refusal', async () => {
      const wrapper = mountBay()
      await nextTick()

      await wrapper.setProps({ error: { kind: 'server', messageRu: 'Сервер не отвечает.' } })
      await nextTick()
      expect(wrapper.find('.transmit').classes()).toContain('transmit--error')

      await wrapper.setProps({ error: { kind: 'offline', messageRu: 'Сеть недоступна.' } })
      await nextTick()
      expect(wrapper.find('.transmit').classes()).toContain('transmit--error')
    })
  })

  it('launches on Cmd/Ctrl+Enter and closes on Escape', async () => {
    const wrapper = mountBay()
    await nextTick()

    await wrapper.find('[data-testid="launch-title"]').setValue('Тред')
    await wrapper.find('[data-testid="signal-input"]').setValue('Тело')
    await wrapper.find('[data-testid="launch-title"]').trigger('keydown', { key: 'Enter', metaKey: true })
    expect(wrapper.emitted('submit')).toHaveLength(1)

    await wrapper.find('[data-testid="launch-title"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('restores a buffered draft silently', async () => {
    localStorageMock.setItem(
      'draft:launch-b',
      JSON.stringify({ title: 'Черновик', body: 'Недописанное', files: [], timestamp: Date.now() }),
    )
    const wrapper = mountBay()
    await nextTick()

    expect((wrapper.find('[data-testid="launch-title"]').element as HTMLInputElement).value).toBe(
      'Черновик',
    )
    expect((wrapper.find('[data-testid="signal-input"]').element as HTMLTextAreaElement).value).toBe(
      'Недописанное',
    )
    expect(wrapper.find('[data-testid="launch-restored"]').exists()).toBe(false)
  })

  it('names the lost cargo honestly when the buffer remembered files', async () => {
    localStorageMock.setItem(
      'draft:launch-b',
      JSON.stringify({
        title: 'С грузом',
        body: 'Текст',
        files: [{ name: 'чертёж.pdf', size: 10 }],
        timestamp: Date.now(),
      }),
    )
    const wrapper = mountBay()
    await nextTick()

    const note = wrapper.find('[data-testid="launch-restored"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('1 файл')

    await wrapper.find('[data-testid="signal-input"]').setValue('Текст снова')
    await nextTick()
    expect(wrapper.find('[data-testid="launch-restored"]').exists()).toBe(false)
  })

  it('keeps the transmit node disabled while empty', () => {
    const wrapper = mountBay()
    expect(wrapper.find('.transmit').attributes('aria-disabled')).toBe('true')
  })
})

describe('LaunchBay — the sheet, not a card (P3-T2)', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stands on the paper/ink language of the dock: raised paper ground, ink, one hairline rule', () => {
    expect(SHEET_RULE).not.toBe('')
    expect(SHEET_RULE).toContain('background: var(--paper-raised)')
    expect(SHEET_RULE).toContain('color: var(--ink)')
    // one thin rule, the dock's gesture — editorial, never a dialog box
    expect(SHEET_RULE).toContain('border: 1px solid var(--rule)')
    expect(ruleBlock(BAY_SOURCE, '.telemetry')).toContain('border-left: 1px solid var(--rule)')
    // the footer rail is separated by its own hairline, not by a frame
    expect(BAY_SOURCE).toContain('border-top: 1px solid var(--rule)')
  })

  it('drops the glass card: no deep ground, no backdrop-filter, no rounded frame, no shadow', () => {
    expect(SHEET_RULE).not.toContain('--bg-deep')
    expect(SHEET_RULE).not.toContain('backdrop-filter')
    expect(SHEET_RULE).toContain('border-radius: 0')
    expect(SHEET_RULE).toContain('box-shadow: none')
    // nowhere in the sheet's own styles
    expect(BAY_SOURCE).not.toContain('--bg-deep')
    expect(BAY_SOURCE).not.toContain('backdrop-filter')
    expect(BAY_SOURCE).not.toContain('oklch')
    // no card radius anywhere: only node/bead circles stay round
    expect(BAY_SOURCE).not.toMatch(/--radius-(lg|xl)/)
    expect(SHEET_RULE).not.toMatch(/border-radius:\s*var\(--radius/)
  })

  it('carries the scene title the morph flies in from the trigger', async () => {
    const wrapper = mountBay()
    await nextTick()

    const sceneTitle = wrapper.find('[data-testid="launch-scene-title"]')
    expect(sceneTitle.classes()).toContain('launch-bay__scene')
    expect(sceneTitle.text()).toContain('NEW TRANSMISSION')
    expect(sceneTitle.text()).toContain('/b/')
    // header, telemetry and footer survive the re-skin as scene furniture
    expect(wrapper.find('.launch-bay__header').exists()).toBe(true)
    expect(wrapper.find('.telemetry').exists()).toBe(true)
    expect(wrapper.find('.launch-bay__rail').exists()).toBe(true)
  })

  it('hands the scene title out as the morph target the parent plays into', () => {
    const wrapper = mountBay()
    const bay = wrapper.vm as unknown as { sceneTitleElement: () => HTMLElement | null }
    expect(bay.sceneTitleElement()).toBe(wrapper.find('[data-testid="launch-scene-title"]').element)
  })

  it('pins the header tracks and fades only the furniture, never the flying title', () => {
    expect(ruleBlock(BAY_SOURCE, '.launch-bay__header')).toContain('grid-template-columns: 1fr auto')
    expect(ruleBlock(BAY_SOURCE, '.launch-bay__scene')).toContain('grid-column: 1')
    expect(ruleBlock(BAY_SOURCE, '.launch-bay__close')).toContain('grid-column: 2')
    // the title stays crisp: only body and rail fade in behind it
    expect(BAY_SOURCE).toContain('animation: bay-fade-in 320ms')
    expect(REDUCED_RULES).toContain('animation: none')
  })

  it('stays a bottom sheet on mobile — safe area kept, no frame on top', () => {
    expect(MOBILE_RULES).toContain('env(safe-area-inset-bottom')
    expect(MOBILE_RULES).toContain('border-top: 0')
    expect(MOBILE_RULES).not.toContain('border-radius')
  })

  it('hands the stage back at once for prefers-reduced-motion', async () => {
    const media = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ matches: query.includes('reduce'), media: query }) as MediaQueryList,
    )
    const wrapper = mountBay()
    await nextTick()

    await wrapper.setProps({ successToken: 1 })
    expect(wrapper.classes()).toContain('launch-bay--launched')

    // no 620 ms hold: the launch sequence runs instantly
    vi.advanceTimersByTime(0)
    await nextTick()
    expect(wrapper.emitted('done')).toHaveLength(1)
    media.mockRestore()
  })
})

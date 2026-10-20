import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import ReportProbe from '../ReportProbe.vue'
import { classifyError, type TransmitError } from '@/api/errors'
import { ApiRequestError } from '@/api/client'
import { gsap } from '@/composables/useGsap'

// The morph is GSAP's job; the assertions are about the geometry and the
// stage classes, so the tween layer is mocked exactly like the views do.
vi.mock('@/composables/useGsap', () => ({
  gsap: { from: vi.fn(), to: vi.fn(), fromTo: vi.fn(), set: vi.fn() },
  ScrollTrigger: {},
  Flip: {},
  prefersReducedMotion: () => false,
  isTouchDevice: () => false,
}))

const DRAFT_KEY = 'draft:report-42'

function mountProbe(props: Record<string, unknown> = {}) {
  return mount(ReportProbe, {
    props: { postId: 42, ...props },
    attachTo: document.body,
  })
}

/** The API refusal arrives already classified — never as a raw string. */
function apiError(error: TransmitError) {
  return { error }
}

/** jsdom lies about `navigator.onLine`, so pin it for a duration. */
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

/** The notice's own retry node, re-found after every re-render. */
const retryButton = (wrapper: ReturnType<typeof mountProbe>) =>
  wrapper.find('[data-testid="transmit-notice-retry"]')

/** The stage machine lives on the body, not on a v-if. */
const body = (wrapper: ReturnType<typeof mountProbe>) => wrapper.find('.probe-body')
const stage2 = (wrapper: ReturnType<typeof mountProbe>) =>
  wrapper.find('[data-testid="probe-stage-2"]')
const constellation = (wrapper: ReturnType<typeof mountProbe>) =>
  wrapper.find('[data-testid="probe-scene-1"]')
/** The comment is a SignalSurface now; the textarea is inside it. */
const surface = (wrapper: ReturnType<typeof mountProbe>) =>
  wrapper.find('[data-testid="signal-input"]')
const surfaceValue = (wrapper: ReturnType<typeof mountProbe>) =>
  (surface(wrapper).element as HTMLTextAreaElement).value
const changeReason = (wrapper: ReturnType<typeof mountProbe>) =>
  wrapper.find('button[aria-label="Выбрать другую причину"]')
const pickReason = async (wrapper: ReturnType<typeof mountProbe>, id: string) => {
  await wrapper.find(`[data-testid="reason-${id}"]`).trigger('click')
  // the morph spans two flushes: the stage swap, then the flight's twin
  await nextTick()
  await nextTick()
}
/** Everything GSAP was told to animate in this tick. */
const tweenTargets = () => vi.mocked(gsap.to).mock.calls.map((call) => call[0])
const flight = (wrapper: ReturnType<typeof mountProbe>) =>
  wrapper.find('[data-testid="probe-flight"]')

/** jsdom reports every rect as empty, so matchMedia is the only lever on
 *  `prefers-reduced-motion` here — pin it, then give the window back. */
function setReducedMotion(value: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      matches: value && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
    configurable: true,
  })
}

describe('ReportProbe', () => {
  const realMatchMedia = window.matchMedia

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: realMatchMedia,
      configurable: true,
    })
    localStorage.clear()
  })

  it('offers five real reasons as a radio group — no select, no card grid', () => {
    const wrapper = mountProbe()
    const group = wrapper.find('[role="radiogroup"]')
    expect(group.exists()).toBe(true)

    const nodes = wrapper.findAll('[role="radio"]')
    expect(nodes).toHaveLength(5)
    expect(nodes.map((n) => n.attributes('data-testid'))).toEqual([
      'reason-spam',
      'reason-abuse',
      'reason-illegal',
      'reason-offtopic',
      'reason-other',
    ])
  })

  it('supports arrow-key navigation between reason nodes', async () => {
    const wrapper = mountProbe()
    const nodes = wrapper.findAll('[role="radio"]')
    ;(nodes[0].element as HTMLElement).focus()

    await nodes[0].trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(nodes[1].element)

    await nodes[0].trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(nodes[4].element)
  })

  it('moves to the comment stage after picking a reason', async () => {
    const wrapper = mountProbe()
    await pickReason(wrapper, 'abuse')

    expect(body(wrapper).classes()).toContain('is-stage-2')
    const anchor = stage2(wrapper)
    expect(anchor.exists()).toBe(true)
    expect(anchor.text()).toContain('Оскорбления')
    // the comment is the shared writing surface, not a bare textarea
    expect(surface(wrapper).exists()).toBe(true)
    expect(surface(wrapper).attributes('aria-label')).toBe('Комментарий к жалобе')
    // the tab order lands in the surface right after the morph
    expect(document.activeElement).toBe(surface(wrapper).element)
  })

  it('emits the report without closing itself — parent owns the API', async () => {
    const wrapper = mountProbe()
    await pickReason(wrapper, 'spam')
    await surface(wrapper).setValue('флуд ссылками')

    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')![0][0]).toEqual({
      reason: 'spam',
      comment: 'флуд ссылками',
    })
    // probe must survive until parent confirms success
    expect(body(wrapper).classes()).toContain('is-stage-2')
    expect(surfaceValue(wrapper)).toBe('флуд ссылками')
  })

  it('closes only after parent-confirmed success', async () => {
    const wrapper = mountProbe()
    await pickReason(wrapper, 'spam')

    await wrapper.setProps({ successToken: 1 })
    await nextTick()
    expect(wrapper.emitted('reported')).toHaveLength(1)
  })

  it('keeps reason and comment on a classified API failure', async () => {
    const wrapper = mountProbe()
    await pickReason(wrapper, 'illegal')
    await surface(wrapper).setValue('документы')

    setOnline(false)
    const offline = classifyError(new TypeError('Failed to fetch'))
    setOnline(true)

    await wrapper.setProps(apiError(offline))
    await nextTick()

    const notice = wrapper.find('[data-testid="probe-error"]')
    expect(notice.text()).toContain('Сеть недоступна')
    // the raw fetch text must never surface to the reader
    expect(notice.text()).not.toContain('Failed to fetch')
    expect(notice.find('[role="alert"]').exists()).toBe(true)
    expect(surfaceValue(wrapper)).toBe('документы')
    expect(wrapper.emitted('reported')).toBeFalsy()
  })

  it('counts the throttle down in the probe notice', async () => {
    const wrapper = mountProbe()
    await pickReason(wrapper, 'spam')

    const throttle = classifyError(
      new ApiRequestError(
        429,
        'Request was throttled. Expected available in 42 seconds.',
      ),
    )
    await wrapper.setProps(apiError(throttle))
    await nextTick()

    const notice = wrapper.find('[data-testid="probe-error"]')
    expect(notice.text()).toContain('Слишком много сигналов')
    expect(notice.text()).toContain('Повтор через 42 с')
    const countdown = wrapper.find('[data-testid="transmit-notice-countdown"]')
    expect(countdown.text()).toBe('повтор через 42с')
    // the limit is a limit: no button until the window is over
    expect(retryButton(wrapper).exists()).toBe(false)
  })

  it('emits retry so the parent replays the same report', async () => {
    const wrapper = mountProbe()
    await pickReason(wrapper, 'other')
    await surface(wrapper).setValue('мимо темы')

    await wrapper.setProps(
      apiError(classifyError(new ApiRequestError(500, 'Server error'))),
    )
    await nextTick()

    expect(retryButton(wrapper).exists()).toBe(true)
    await retryButton(wrapper).trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    // the report survives to be repeated: reason, comment, probe
    expect(surfaceValue(wrapper)).toBe('мимо темы')
    expect(body(wrapper).classes()).toContain('is-stage-2')
  })

  it('returns to the constellation on Escape in stage 1, closes from stage 2', async () => {
    const wrapper = mountProbe()

    await pickReason(wrapper, 'other')
    expect(body(wrapper).classes()).toContain('is-stage-2')

    // Escape without a comment steps back to the constellation
    await stage2(wrapper).trigger('keydown', { key: 'Escape' })
    expect(body(wrapper).classes()).not.toContain('is-stage-2')
    expect(constellation(wrapper).attributes('aria-hidden')).toBeUndefined()

    await pickReason(wrapper, 'other')
    await surface(wrapper).setValue('текст')
    await stage2(wrapper).trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  // --- report draft (P2-T2) ------------------------------------------------

  it('buffers reason + comment under draft:report-<postId>', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mountProbe()
      await pickReason(wrapper, 'spam')
      await surface(wrapper).setValue('флуд ссылками')

      // the beacon sits in the probe header, compact
      expect(wrapper.find('[data-testid="draft-beacon"]').exists()).toBe(true)

      // debounce still pending → nothing on disk yet
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()

      vi.advanceTimersByTime(500)
      await nextTick()

      const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')
      expect(stored).toMatchObject({ title: 'spam', body: 'флуд ссылками' })
      expect(wrapper.find('[data-testid="draft-beacon"]').text()).toContain('сохранено')

      // emptying the comment discards the buffer instead of leaving a husk
      await surface(wrapper).setValue('')
      await nextTick()
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('survives closing the probe — reason and comment come back in stage 2', async () => {
    vi.useFakeTimers()
    try {
      const first = mountProbe()
      await pickReason(first, 'abuse')
      await surface(first).setValue('маты в адрес препода')
      vi.advanceTimersByTime(500)
      await nextTick()

      // probe closed / thread left
      first.unmount()

      const second = mountProbe()
      await nextTick()

      // a buffered reason lands straight in stage 2, surface focused
      expect(body(second).classes()).toContain('is-stage-2')
      expect(second.find('[data-testid="probe-scene-1"]').exists()).toBe(true)
      expect(stage2(second).text()).toContain('Оскорбления')
      expect(surfaceValue(second)).toBe('маты в адрес препода')
      expect(document.activeElement).toBe(surface(second).element)
    } finally {
      vi.useRealTimers()
    }
  })

  it('restores a comment-only buffer without jumping to stage 2', async () => {
    vi.useFakeTimers()
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          title: '',
          body: 'похоже на флуд',
          files: [],
          timestamp: Date.now(),
        }),
      )

      const wrapper = mountProbe()
      await nextTick()

      // no buffered reason → the constellation stays the first step
      expect(body(wrapper).classes()).not.toContain('is-stage-2')
      expect(stage2(wrapper).attributes('aria-hidden')).toBe('true')
      expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true)

      await pickReason(wrapper, 'spam')
      expect(surfaceValue(wrapper)).toBe('похоже на флуд')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the buffer on API failure and drops it after success', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mountProbe()
      await pickReason(wrapper, 'illegal')
      await surface(wrapper).setValue('документы')
      vi.advanceTimersByTime(500)
      await nextTick()

      setOnline(false)
      const offline = classifyError(new TypeError('Failed to fetch'))
      setOnline(true)

      await wrapper.setProps(apiError(offline))
      await nextTick()
      const notice = wrapper.find('[data-testid="probe-error"]')
      expect(notice.text()).toContain('Сеть недоступна')
      expect(notice.text()).not.toContain('Failed to fetch')
      expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
      expect(surfaceValue(wrapper)).toBe('документы')

      await wrapper.setProps({ successToken: 1 })
      await nextTick()
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
      expect(wrapper.emitted('reported')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  // --- stage morph: узел → анкер (P3-T3) ----------------------------------

  it('keeps both stages in the DOM — the scene changes by class, not v-if', async () => {
    const wrapper = mountProbe()

    // stage 1: the constellation is current, the anchor scene is hidden
    expect(constellation(wrapper).exists()).toBe(true)
    expect(stage2(wrapper).exists()).toBe(true)
    expect(stage2(wrapper).attributes('aria-hidden')).toBe('true')

    await pickReason(wrapper, 'spam')

    expect(body(wrapper).classes()).toContain('is-stage-2')
    expect(constellation(wrapper).attributes('aria-hidden')).toBe('true')
    expect(stage2(wrapper).attributes('aria-hidden')).toBeUndefined()
    // both are still here — a v-if swap would have destroyed the geometry
    expect(constellation(wrapper).exists()).toBe(true)
    expect(stage2(wrapper).exists()).toBe(true)
  })

  it('flies the chosen node into the stage-2 anchor', async () => {
    const wrapper = mountProbe()
    await pickReason(wrapper, 'abuse')

    // a twin of the chosen ring is on its way to the anchor
    expect(flight(wrapper).exists()).toBe(true)
    const flyer = flight(wrapper).element
    const targets = tweenTargets()
    expect(targets).toContain(flyer)
    // the twin rides the same 420ms flight as the rest of the morph
    const vars = vi.mocked(gsap.to).mock.calls.find(([el]) => el === flyer)?.[1]
    expect(vars).toMatchObject({ duration: 0.42 })

    // every reason node dies along its own wire — the chosen one included,
    // it hands itself over to the twin
    for (const id of ['spam', 'abuse', 'illegal', 'offtopic', 'other']) {
      expect(targets).toContain(wrapper.find(`[data-testid="reason-${id}"]`).element)
    }
  })

  it('keeps the constellation geometry across the stages', async () => {
    const wrapper = mountProbe()
    const slot = wrapper.find('[data-testid="reason-spam"]').attributes('style')

    await pickReason(wrapper, 'spam')
    // the node never re-renders: it keeps the slot the flight returns to
    expect(wrapper.find('[data-testid="reason-spam"]').attributes('style')).toBe(slot)

    await changeReason(wrapper).trigger('click')
    await nextTick()
    expect(body(wrapper).classes()).not.toContain('is-stage-2')
    expect(wrapper.find('[data-testid="reason-spam"]').attributes('style')).toBe(slot)
  })

  it('flies the node back into its slot on «изменить»', async () => {
    const wrapper = mountProbe()
    await pickReason(wrapper, 'spam')
    await surface(wrapper).setValue('флуд ссылками')
    vi.mocked(gsap.to).mockClear()

    await changeReason(wrapper).trigger('click')
    await nextTick()
    await nextTick()

    // the same flight, played backwards along the same wire
    expect(body(wrapper).classes()).not.toContain('is-stage-2')
    expect(tweenTargets()).toContain(flight(wrapper).element)
    // the reason is free again — nothing is checked, the text survives
    expect(wrapper.find('[role="radio"][aria-checked="true"]').exists()).toBe(false)
    expect(surfaceValue(wrapper)).toBe('флуд ссылками')
  })

  it('respects prefers-reduced-motion: the stage fades in, nothing flies', async () => {
    setReducedMotion(true)
    try {
      const wrapper = mountProbe()
      vi.mocked(gsap.to).mockClear()

      await pickReason(wrapper, 'spam')

      expect(body(wrapper).classes()).toContain('is-stage-2')
      expect(flight(wrapper).exists()).toBe(false)
      // the stage is material at once — no anchor waiting for a flight
      expect(body(wrapper).classes()).toContain('is-quiet')
      expect(document.activeElement).toBe(surface(wrapper).element)

      await changeReason(wrapper).trigger('click')
      await nextTick()
      await nextTick()
      expect(body(wrapper).classes()).not.toContain('is-stage-2')
      expect(flight(wrapper).exists()).toBe(false)
    } finally {
      setReducedMotion(false)
    }
  })

  it('weaves the refusal into stage 2 as a node of the scene', async () => {
    const wrapper = mountProbe()
    await pickReason(wrapper, 'spam')
    await wrapper.setProps(
      apiError(classifyError(new ApiRequestError(400, 'Validation error'))),
    )
    await nextTick()

    const notice = wrapper.find('[data-testid="probe-error"]')
    expect(notice.exists()).toBe(true)
    // it lives inside stage 2, on the anchor's own line — not under the form
    expect(stage2(wrapper).find('[data-testid="probe-error"]').exists()).toBe(true)
    expect(notice.find('[role="alert"]').exists()).toBe(true)
    // the surface names it for a screen reader and answers in red
    expect(surface(wrapper).attributes('aria-describedby')).toBe('probe-notice')
    expect(surface(wrapper).attributes('aria-invalid')).toBe('true')
  })
})

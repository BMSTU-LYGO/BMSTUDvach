import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const { gsapMock, state } = vi.hoisted(() => {
  const revert = vi.fn()
  const context = vi.fn((fn: () => void) => {
    fn()
    return { revert, add: vi.fn() }
  })
  return {
    state: { reduced: false },
    gsapMock: {
      context,
      fromTo: vi.fn(),
      from: vi.fn(),
      to: vi.fn(),
      set: vi.fn(),
      revert,
    },
  }
})

// Твины здесь — предмет проверки, поэтому GSAP замокан ровно настолько,
// насколько это нужно компоненту.
vi.mock('@/composables/useGsap', () => ({
  gsap: gsapMock,
  ScrollTrigger: {},
  Flip: {},
  prefersReducedMotion: () => state.reduced,
  isTouchDevice: () => false,
}))

import KineticText from '@/components/ui/KineticText.vue'

/** jsdom не считает пересечения — наблюдатель сам сообщает, что элемент в зоне видимости. */
class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | null = null

  readonly root: Element | null = null
  readonly rootMargin = ''
  readonly thresholds: readonly number[] = []

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.last = this
  }

  observe(target: Element): void {
    this.callback(
      [
        {
          target,
          isIntersecting: true,
          intersectionRatio: 1,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    )
  }

  unobserve(): void {}

  disconnect(): void {}

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

/** Наблюдатель, который никогда не сообщает о пересечении. */
class SilentIntersectionObserver extends FakeIntersectionObserver {
  override observe(): void {}
}

beforeEach(() => {
  state.reduced = false
  gsapMock.context.mockClear()
  gsapMock.fromTo.mockClear()
  gsapMock.from.mockClear()
  gsapMock.to.mockClear()
  gsapMock.set.mockClear()
  gsapMock.revert.mockClear()
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KineticText', () => {
  it('renders the whole text and gives it to the screen reader exactly once', () => {
    const wrapper = mount(KineticText, {
      props: { text: 'Первая строка\nВторая строка' },
    })

    const root = wrapper.find('[data-testid="kinetic-text"]')
    expect(root.attributes('aria-label')).toBe('Первая строка\nВторая строка')
    expect(root.text()).toContain('Первая строка')
    expect(root.text()).toContain('Вторая строка')

    const pieces = wrapper.findAll('[data-testid="kinetic-piece"]')
    expect(pieces).toHaveLength(2)
    for (const piece of pieces) {
      expect(piece.attributes('aria-hidden')).toBe('true')
    }
    for (const mask of wrapper.findAll('[data-testid="kinetic-mask"]')) {
      expect(mask.attributes('aria-hidden')).toBe('true')
    }

    // Скринридер не должен получать ни роли, ни живых регионов: это обычный текст.
    expect(root.attributes('role')).toBeUndefined()
    expect(root.attributes('aria-live')).toBeUndefined()
  })

  it('renders as the requested tag', () => {
    const wrapper = mount(KineticText, {
      props: { text: 'Заголовок', as: 'h2' },
    })

    expect(wrapper.find('h2[data-testid="kinetic-text"]').exists()).toBe(true)
  })

  it('splits the text into words when asked', () => {
    const wrapper = mount(KineticText, {
      props: { text: 'Каждое слово', mode: 'words' },
    })

    expect(wrapper.findAll('[data-testid="kinetic-piece"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Каждое слово')
    expect(wrapper.find('[data-testid="kinetic-text"]').attributes('aria-label')).toBe(
      'Каждое слово',
    )
  })

  it('shows the text at once and never touches the DOM when motion is reduced', () => {
    state.reduced = true

    const wrapper = mount(KineticText, { props: { text: 'Тишина' } })

    expect(gsapMock.context).not.toHaveBeenCalled()
    expect(gsapMock.fromTo).not.toHaveBeenCalled()
    expect(gsapMock.to).not.toHaveBeenCalled()
    expect(gsapMock.set).not.toHaveBeenCalled()

    const root = wrapper.find('[data-testid="kinetic-text"]')
    expect(root.attributes('style')).toBeUndefined()
    for (const piece of wrapper.findAll('[data-testid="kinetic-piece"]')) {
      expect(piece.attributes('style')).toBeUndefined()
      expect((piece.element as HTMLElement).style.opacity).not.toBe('0')
    }
  })

  it('keeps the text readable when the animation never starts', () => {
    vi.stubGlobal('IntersectionObserver', SilentIntersectionObserver)

    const wrapper = mount(KineticText, { props: { text: 'Без движения' } })

    expect(gsapMock.fromTo).not.toHaveBeenCalled()
    const pieces = wrapper.findAll('[data-testid="kinetic-piece"]')
    expect(pieces).toHaveLength(1)
    expect(pieces[0].text()).toBe('Без движения')
    expect((pieces[0].element as HTMLElement).style.opacity).not.toBe('0')
    expect((pieces[0].element as HTMLElement).style.transform).toBe('')
  })

  it('never hides the content: no piece is transparent or invisible', () => {
    const wrapper = mount(KineticText, {
      props: { text: 'Каждое слово', mode: 'words' },
    })

    const root = wrapper.find('[data-testid="kinetic-text"]').element as HTMLElement
    expect(root.style.opacity).not.toBe('0')
    expect(root.style.visibility).not.toBe('hidden')

    for (const piece of wrapper.findAll('[data-testid="kinetic-piece"]')) {
      const el = piece.element as HTMLElement
      expect(el.style.opacity).not.toBe('0')
      expect(el.style.visibility).not.toBe('hidden')
    }
  })

  it('leaves no hidden styles behind when motion is reduced', () => {
    state.reduced = true

    const wrapper = mount(KineticText, { props: { text: 'Тишина' } })

    const root = wrapper.find('[data-testid="kinetic-text"]')
    expect(root.attributes('style')).toBeUndefined()
    for (const piece of wrapper.findAll('[data-testid="kinetic-piece"]')) {
      expect(piece.attributes('style')).toBeUndefined()
    }
  })

  it('gives the screen reader the text once for tags whose role has no name', () => {
    // У `<p>` и `<span>` имя автора запрещено правилами ARIA: `aria-label`
    // браузер игнорирует, а доли скрыты — текст без скрытой копии пропал бы
    // из accessibility-дерева совсем.
    const wrapper = mount(KineticText, { props: { text: 'Строка', as: 'p' } })

    const copy = wrapper.find('.kinetic-text__sr')
    expect(copy.exists()).toBe(true)
    expect(copy.text()).toBe('Строка')
    expect(copy.attributes('aria-hidden')).toBeUndefined()

    // Копия одна — значит, текст читается один раз.
    expect(wrapper.findAll('.kinetic-text__sr')).toHaveLength(1)
    for (const piece of wrapper.findAll('[data-testid="kinetic-piece"]')) {
      expect(piece.attributes('aria-hidden')).toBe('true')
    }
  })

  it('does not duplicate the text where the tag itself carries the name', () => {
    const wrapper = mount(KineticText, { props: { text: 'Заголовок', as: 'h2' } })

    expect(wrapper.find('.kinetic-text__sr').exists()).toBe(false)
    expect(wrapper.find('h2').attributes('aria-label')).toBe('Заголовок')
  })

  it('masks the pieces in document order when the text appears', () => {
    const wrapper = mount(KineticText, {
      props: { text: 'Одно\nДва\nТри' },
    })

    expect(gsapMock.context).toHaveBeenCalledTimes(1)
    expect(gsapMock.fromTo).toHaveBeenCalledTimes(1)

    const [targets, fromVars, toVars] = gsapMock.fromTo.mock.calls[0] as [
      HTMLElement[],
      Record<string, unknown>,
      Record<string, unknown>,
    ]

    const domPieces = wrapper
      .findAll('[data-testid="kinetic-piece"]')
      .map((piece) => piece.text())
    expect(targets.map((target) => target.textContent)).toEqual(domPieces)
    expect(targets).toHaveLength(3)

    expect(fromVars).toEqual({ yPercent: 110 })
    expect(toVars).toMatchObject({
      yPercent: 0,
      duration: 0.6,
      delay: 0,
      ease: 'expo.out',
    })
    expect(toVars.stagger).toBeGreaterThan(0)
  })

  it('honours the delay, stagger, duration and ease props', () => {
    mount(KineticText, {
      props: {
        text: 'Один Два',
        mode: 'words',
        delay: 0.2,
        stagger: 0.1,
        duration: 0.9,
        ease: 'power2.out',
      },
    })

    const [, , toVars] = gsapMock.fromTo.mock.calls[0] as [
      HTMLElement[],
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(toVars).toMatchObject({
      delay: 0.2,
      stagger: 0.1,
      duration: 0.9,
      ease: 'power2.out',
    })
  })

  it('starts the reveal only once', () => {
    mount(KineticText, { props: { text: 'Один раз' } })

    expect(gsapMock.fromTo).toHaveBeenCalledTimes(1)
  })

  it('reverts the gsap context on unmount', () => {
    const wrapper = mount(KineticText, { props: { text: 'Прощание' } })

    expect(gsapMock.revert).not.toHaveBeenCalled()

    wrapper.unmount()

    expect(gsapMock.revert).toHaveBeenCalledTimes(1)
  })
})

import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  useMagnetic,
  useMotionEnabled,
  usePointerLight,
  usePress,
} from '@/composables/useMotion'
import { useQuality3D } from '@/composables/useQuality3D'

/**
 * jsdom не умеет matchMedia (его ставит глобальный setup заглушкой, которая
 * всегда отвечает `matches: false`), поэтому здесь — свой controllable-мок:
 * он хранит состояние запроса и умеет оповещать подписчиков, как это делает
 * настоящий MediaQueryList при смене системной настройки.
 */
type ChangeListener = (event: MediaQueryListEvent) => void

class MockMediaQueryList {
  readonly media: string
  matches: boolean
  onchange: ChangeListener | null = null
  private readonly listeners = new Set<ChangeListener>()

  constructor(media: string, matches: boolean) {
    this.media = media
    this.matches = matches
  }

  addEventListener(type: string, listener: ChangeListener): void {
    if (type === 'change') this.listeners.add(listener)
  }

  removeEventListener(type: string, listener: ChangeListener): void {
    if (type === 'change') this.listeners.delete(listener)
  }

  addListener(listener: ChangeListener): void {
    this.listeners.add(listener)
  }

  removeListener(listener: ChangeListener): void {
    this.listeners.delete(listener)
  }

  dispatchEvent(_event: Event): boolean {
    return true
  }

  /** Смена системной настройки: обновляем состояние и будим подписчиков. */
  set(matches: boolean): void {
    this.matches = matches
    const event = { matches, media: this.media } as MediaQueryListEvent
    this.listeners.forEach((listener) => listener(event))
  }

  get listenerCount(): number {
    return this.listeners.size
  }
}

const mediaQueries = new Map<string, MockMediaQueryList>()
const originalMatchMedia = window.matchMedia

function mediaQuery(query: string): MockMediaQueryList {
  let entry = mediaQueries.get(query)
  if (!entry) {
    entry = new MockMediaQueryList(query, false)
    mediaQueries.set(query, entry)
  }
  return entry
}

function installMatchMedia(rules: Record<string, boolean> = {}): void {
  mediaQueries.clear()
  window.matchMedia = ((query: string) => {
    const entry = mediaQuery(query)
    if (rules[query] !== undefined) entry.matches = rules[query]
    return entry
  }) as unknown as typeof window.matchMedia
}

function setMaxTouchPoints(value: number): void {
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    value,
    configurable: true,
    writable: true,
  })
}

/**
 * jsdom объявляет `ontouchstart` у окна всегда, поэтому `isTouchDevice()`
 * в тестах всегда отвечает «тач». Убираем/возвращаем свойство, чтобы
 * можно было проверить обе ветки поведения.
 */
function setTouchDevice(enabled: boolean): void {
  const target = window as unknown as Record<string, unknown>
  if (enabled) {
    target.ontouchstart = null
  } else {
    delete target.ontouchstart
  }
}

/** Прямоугольник элемента: jsdom по умолчанию отдаёт нули, а примитивам нужен размер. */
const RECT = {
  left: 0,
  top: 0,
  width: 200,
  height: 100,
  right: 200,
  bottom: 100,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect

/** Прогнать кадры: rAF зафейкается, чтобы тест не зависел от реального времени. */
function flushFrames(times = 1): void {
  for (let i = 0; i < times; i += 1) {
    vi.advanceTimersByTime(20)
  }
}

const LightProbe = defineComponent({
  setup() {
    const host = ref<HTMLElement | null>(null)
    usePointerLight(host)
    return () => h('div', { ref: host, 'data-testid': 'light' })
  },
})

const MagneticProbe = defineComponent({
  setup() {
    const host = ref<HTMLElement | null>(null)
    useMagnetic(host, { strength: 8, radius: 120 })
    return () => h('div', { ref: host, 'data-testid': 'magnetic' })
  },
})

const PressProbe = defineComponent({
  setup() {
    const host = ref<HTMLElement | null>(null)
    usePress(host)
    return () => h('div', { ref: host, 'data-testid': 'press' })
  },
})

const MotionEnabledProbe = defineComponent({
  setup() {
    const enabled = useMotionEnabled()
    return () => h('span', { 'data-testid': 'enabled' }, String(enabled.value))
  },
})

/** Элемент появляется позже — примитив обязан подписаться уже на него. */
const lateHost = { visible: ref(false) }

const LateProbe = defineComponent({
  setup() {
    const host = ref<HTMLElement | null>(null)
    usePointerLight(host)
    return () =>
      h('div', [
        lateHost.visible.value ? h('span', { ref: host, 'data-testid': 'late' }) : null,
      ])
  },
})

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'],
  })
  installMatchMedia()
  setMaxTouchPoints(0)
  setTouchDevice(false)
  // Качество 3D — синглтон приложения: возвращаем его в «auto», чтобы
  // тесты не зависели от порядка выполнения.
  useQuality3D().setting.value = 'auto'
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(RECT)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.matchMedia = originalMatchMedia
  setTouchDevice(true)
  document.body.innerHTML = ''
})

describe('usePointerLight', () => {
  it('пишет координаты курсора в --mx/--my в процентах от центра элемента', () => {
    const wrapper = mount(LightProbe)
    const el = wrapper.element as HTMLElement

    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 50 }))
    flushFrames()

    expect(el.style.getPropertyValue('--mx')).toBe('50%')
    expect(el.style.getPropertyValue('--my')).toBe('50%')
    wrapper.unmount()
  })

  it('в один кадр попадает только последнее положение курсора', () => {
    const wrapper = mount(LightProbe)
    const el = wrapper.element as HTMLElement

    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 0, clientY: 0 }))
    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 100 }))
    flushFrames()

    expect(el.style.getPropertyValue('--mx')).toBe('100%')
    expect(el.style.getPropertyValue('--my')).toBe('100%')
    wrapper.unmount()
  })

  it('не пишет в DOM до кадра: запись отложена до requestAnimationFrame', () => {
    const wrapper = mount(LightProbe)
    const el = wrapper.element as HTMLElement

    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 100 }))

    // Событие указателя не пишет в стиль: это делает кадр.
    expect(el.style.getPropertyValue('--mx')).toBe('50%')
    expect(el.style.getPropertyValue('--my')).toBe('50%')

    flushFrames()

    expect(el.style.getPropertyValue('--mx')).toBe('100%')
    expect(el.style.getPropertyValue('--my')).toBe('100%')
    wrapper.unmount()
  })

  it('не переписывает значение, если оно почти не изменилось', () => {
    // Крупная поверхность: здесь один пиксель — это меньше порога заметности.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      ...RECT,
      width: 1000,
      height: 1000,
      right: 1000,
      bottom: 1000,
    } as DOMRect)
    const wrapper = mount(LightProbe)
    const el = wrapper.element as HTMLElement

    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 500 }))
    flushFrames()
    expect(el.style.getPropertyValue('--mx')).toBe('50%')

    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 504, clientY: 500 }))
    flushFrames()

    // 4 пикселя из 1000 — меньше половины процента: перерисовка не нужна.
    expect(el.style.getPropertyValue('--mx')).toBe('50%')
    wrapper.unmount()
  })

  it('отменяет запланированный кадр при размонтировании', () => {
    const wrapper = mount(LightProbe)
    const el = wrapper.element as HTMLElement
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame')

    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }))
    wrapper.unmount()

    expect(cancelSpy).toHaveBeenCalled()
    // Стили очищены, и никакой оставшийся кадр не вернёт их обратно.
    flushFrames()
    expect(el.style.getPropertyValue('--mx')).toBe('')
    expect(el.style.getPropertyValue('--my')).toBe('')
  })

  it('не пишет координаты при prefers-reduced-motion: reduce', () => {
    installMatchMedia({ '(prefers-reduced-motion: reduce)': true })
    const wrapper = mount(LightProbe)
    const el = wrapper.element as HTMLElement

    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 20, clientY: 20 }))
    flushFrames()

    expect(el.style.getPropertyValue('--mx')).toBe('')
    expect(el.style.getPropertyValue('--my')).toBe('')
    wrapper.unmount()
  })

  it('не пишет координаты при выключенном качестве 3D', () => {
    useQuality3D().setting.value = 'off'
    const wrapper = mount(LightProbe)
    const el = wrapper.element as HTMLElement

    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 100 }))
    flushFrames()

    expect(el.style.getPropertyValue('--mx')).toBe('')
    expect(el.style.getPropertyValue('--my')).toBe('')
    wrapper.unmount()
  })

  it('снимает слушатель после размонтирования', () => {
    const wrapper = mount(LightProbe)
    const el = wrapper.element as HTMLElement
    const removeSpy = vi.spyOn(el, 'removeEventListener')

    wrapper.unmount()

    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
  })

  it('подписывается на элемент, который появился позже', async () => {
    lateHost.visible.value = false
    const wrapper = mount(LateProbe)

    lateHost.visible.value = true
    await nextTick()
    await nextTick()

    const el = wrapper.find('[data-testid="late"]').element as HTMLElement
    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 50 }))
    flushFrames()

    expect(el.style.getPropertyValue('--mx')).toBe('50%')
    wrapper.unmount()
  })
})

describe('useMagnetic', () => {
  it('тянет элемент к курсору, пока тот в пределах радиуса', () => {
    installMatchMedia({ '(pointer: fine)': true })
    const wrapper = mount(MagneticProbe)
    const el = wrapper.element as HTMLElement

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 50 }))
    flushFrames(40)

    expect(parseFloat(el.style.getPropertyValue('--mag-x'))).toBeGreaterThan(0)
    expect(parseFloat(el.style.getPropertyValue('--mag-y'))).toBe(0)
    wrapper.unmount()
  })

  it('возвращает элемент в ноль, когда курсор ушёл за радиус', () => {
    installMatchMedia({ '(pointer: fine)': true })
    const wrapper = mount(MagneticProbe)
    const el = wrapper.element as HTMLElement

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 50 }))
    flushFrames(40)
    expect(parseFloat(el.style.getPropertyValue('--mag-x'))).toBeGreaterThan(0)

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1400, clientY: 900 }))
    flushFrames(60)

    expect(parseFloat(el.style.getPropertyValue('--mag-x'))).toBe(0)
    expect(parseFloat(el.style.getPropertyValue('--mag-y'))).toBe(0)
    wrapper.unmount()
  })

  it('выключен при prefers-reduced-motion: reduce', () => {
    installMatchMedia({
      '(pointer: fine)': true,
      '(prefers-reduced-motion: reduce)': true,
    })
    const wrapper = mount(MagneticProbe)
    const el = wrapper.element as HTMLElement

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 50 }))
    flushFrames(40)

    expect(el.style.getPropertyValue('--mag-x')).toBe('')
    wrapper.unmount()
  })

  it('выключен без настоящего курсора (pointer: fine)', () => {
    installMatchMedia({ '(pointer: fine)': false })
    const wrapper = mount(MagneticProbe)
    const el = wrapper.element as HTMLElement

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 50 }))
    flushFrames(40)

    expect(el.style.getPropertyValue('--mag-x')).toBe('')
    wrapper.unmount()
  })

  it('выключен при выключенном качестве 3D', () => {
    installMatchMedia({ '(pointer: fine)': true })
    useQuality3D().setting.value = 'off'
    const wrapper = mount(MagneticProbe)
    const el = wrapper.element as HTMLElement

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 50 }))
    flushFrames(40)

    expect(el.style.getPropertyValue('--mag-x')).toBe('')
    wrapper.unmount()
  })

  it('останавливает кадровый цикл, когда элемент доехал до цели', () => {
    installMatchMedia({ '(pointer: fine)': true })
    const wrapper = mount(MagneticProbe)
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 50 }))
    flushFrames(60)
    const scheduled = rafSpy.mock.calls.length
    expect(scheduled).toBeGreaterThan(1)

    // Элемент доехал: цикл больше не планирует кадров.
    flushFrames(30)
    expect(rafSpy.mock.calls.length).toBe(scheduled)
    wrapper.unmount()
  })

  it('навешивает will-change только на время смещения', () => {
    installMatchMedia({ '(pointer: fine)': true })
    const wrapper = mount(MagneticProbe)
    const el = wrapper.element as HTMLElement

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 50 }))
    flushFrames(2)
    expect(el.style.getPropertyValue('will-change')).toBe('translate')

    flushFrames(80)
    expect(el.style.getPropertyValue('will-change')).toBe('')
    wrapper.unmount()
  })

  it('снимает слушатель после размонтирования', () => {
    installMatchMedia({ '(pointer: fine)': true })
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(MagneticProbe)

    wrapper.unmount()

    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
  })
})

describe('usePress', () => {
  it('ставит data-pressed на pointerdown и снимает на pointerup', () => {
    const wrapper = mount(PressProbe)
    const el = wrapper.element as HTMLElement

    el.dispatchEvent(new MouseEvent('pointerdown'))
    expect(el.dataset.pressed).toBe('true')
    expect(el.style.getPropertyValue('--press')).toBe('1')

    el.dispatchEvent(new MouseEvent('pointerup'))
    expect(el.hasAttribute('data-pressed')).toBe(false)
    expect(el.style.getPropertyValue('--press')).toBe('')
    wrapper.unmount()
  })

  it('реагирует на Space и Enter с клавиатуры', () => {
    const wrapper = mount(PressProbe)
    const el = wrapper.element as HTMLElement

    el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    expect(el.dataset.pressed).toBe('true')
    el.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }))
    expect(el.hasAttribute('data-pressed')).toBe(false)

    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(el.dataset.pressed).toBe('true')
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))
    expect(el.hasAttribute('data-pressed')).toBe(false)
    wrapper.unmount()
  })

  it('не масштабирует элемент (никакого transform: scale)', () => {
    const wrapper = mount(PressProbe)
    const el = wrapper.element as HTMLElement

    el.dispatchEvent(new MouseEvent('pointerdown'))

    expect(el.style.transform).toBe('')
    expect(el.style.getPropertyValue('scale')).toBe('')
    wrapper.unmount()
  })

  it('снимает состояние нажатия после размонтирования', () => {
    const wrapper = mount(PressProbe)
    const el = wrapper.element as HTMLElement
    el.dispatchEvent(new MouseEvent('pointerdown'))

    wrapper.unmount()

    expect(el.hasAttribute('data-pressed')).toBe(false)
    expect(el.style.getPropertyValue('--press')).toBe('')
  })

  it('не планирует кадров: нажатие — это переключение состояния', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')
    const wrapper = mount(PressProbe)
    const el = wrapper.element as HTMLElement

    el.dispatchEvent(new MouseEvent('pointerdown'))
    el.dispatchEvent(new MouseEvent('pointerup'))

    expect(rafSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('useMotionEnabled', () => {
  it('выключается при prefers-reduced-motion: reduce', () => {
    installMatchMedia({ '(prefers-reduced-motion: reduce)': true })

    expect(useMotionEnabled().value).toBe(false)
  })

  it('выключается на тач-устройствах', () => {
    installMatchMedia()
    setTouchDevice(true)

    expect(useMotionEnabled().value).toBe(false)
  })

  it('включается в обычных условиях', () => {
    installMatchMedia()

    expect(useMotionEnabled().value).toBe(true)
  })

  it('выключается при выключенном качестве 3D', () => {
    installMatchMedia()
    useQuality3D().setting.value = 'off'

    expect(useMotionEnabled().value).toBe(false)
  })

  it('реагирует на смену качества 3D', async () => {
    installMatchMedia()
    const wrapper = mount(MotionEnabledProbe)
    expect(wrapper.text()).toBe('true')

    useQuality3D().setting.value = 'off'
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toBe('false')
    wrapper.unmount()
  })

  it('реагирует на смену prefers-reduced-motion', async () => {
    installMatchMedia()
    const wrapper = mount(MotionEnabledProbe)
    expect(wrapper.text()).toBe('true')

    mediaQuery('(prefers-reduced-motion: reduce)').set(true)
    await nextTick()

    expect(wrapper.text()).toBe('false')
    wrapper.unmount()
  })

  it('снимает подписку на matchMedia после размонтирования', () => {
    installMatchMedia()
    const query = mediaQuery('(prefers-reduced-motion: reduce)')

    const wrapper = mount(MotionEnabledProbe)
    expect(query.listenerCount).toBe(1)

    wrapper.unmount()
    expect(query.listenerCount).toBe(0)
  })
})

describe('примитивы без окна (SSR) и с пустым ref', () => {
  it('не падают и не подписываются', () => {
    vi.stubGlobal('window', undefined)
    const host = ref<HTMLElement | null>(null)

    expect(() => usePointerLight(host)).not.toThrow()
    expect(() => useMagnetic(host)).not.toThrow()
    expect(() => usePress(host)).not.toThrow()
    expect(useMotionEnabled().value).toBe(false)

    vi.unstubAllGlobals()
  })
})

describe('бюджет внимания', () => {
  // Тест идёт последним: кап считает живые реакции, поэтому он зависит от
  // того, что все предыдущие примитивы уже сняты.
  it('кап тяжёлых реакций: лишние поверхности остаются статичными', () => {
    const first = mount(LightProbe)
    const second = mount(LightProbe)
    const third = mount(LightProbe)

    const firstEl = first.element as HTMLElement
    const secondEl = second.element as HTMLElement
    const thirdEl = third.element as HTMLElement

    firstEl.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 100 }))
    secondEl.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 200, clientY: 100 }),
    )
    thirdEl.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 100 }))
    flushFrames()

    // Две поверхности получили свет (это и есть кап), третья осталась статичной.
    expect(firstEl.style.getPropertyValue('--mx')).toBe('100%')
    expect(secondEl.style.getPropertyValue('--mx')).toBe('100%')
    expect(thirdEl.style.getPropertyValue('--mx')).toBe('')

    first.unmount()
    second.unmount()
    third.unmount()
  })
})

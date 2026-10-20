/**
 * useMotion — единый модуль motion-примитивов BMSTUDvach.
 *
 * Здесь собраны три «материальные» реакции и общий ответ на вопрос
 * «можно ли вообще двигать»:
 *
 * - `usePointerLight` — свет по кромке от курсора (реактивное освещение бумаги);
 * - `useMagnetic` — лёгкое притяжение элемента к курсору;
 * - `usePress` — состояние «нажато» (чернила впитались);
 * - `useMotionEnabled` — единый переключатель движения.
 *
 * Примитивы намеренно НЕ дублируют `useTilt` (3D-наклон по курсору) и
 * `useParallax` (глобальные координаты мыши): здесь всё локально
 * относительно элемента и дешево — один слушатель, один rAF, никаких
 * вечных `will-change` и никакого `transform: scale`.
 *
 * Контракт с CSS (см. `src/assets/material.css`):
 * - `usePointerLight` пишет `--mx` / `--my` — координаты курсора в процентах
 *   от левого верхнего угла элемента (50% / 50% — центр);
 * - `useMagnetic` пишет `--mag-x` / `--mag-y` — смещение в пикселях;
 * - `usePress` ставит `data-pressed="true"` и `--press: 1`.
 */

import {
  getCurrentInstance,
  getCurrentScope,
  onMounted,
  onScopeDispose,
  onUnmounted,
  readonly,
  ref,
  watch,
  type Ref,
} from 'vue'

import { isTouchDevice, prefersReducedMotion } from './useGsap'
import { useQuality3D } from './useQuality3D'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const FINE_POINTER_QUERY = '(pointer: fine)'

/** Радиус светового пятна: это пятно, а не прожектор — край должен оставаться бумагой. */
const DEFAULT_LIGHT_RADIUS = 180
/** Максимальная тяга magnetic: смещение в несколько пикселей, а не прыжок. */
const DEFAULT_MAGNETIC_STRENGTH = 8
/** Радиус, в котором курсор вообще тянет элемент к себе. */
const DEFAULT_MAGNETIC_RADIUS = 120
/** Коэффициент сглаживания тяги: меньше — «тяжелее», больше — «резче». */
const MAGNETIC_EASING = 0.2
/** Порог, ниже которого разница считается нулём и кадр-за-кадром цикл встаёт. */
const MAGNETIC_EPSILON = 0.05

/**
 * Признак «мы в браузере». Нужен для SSR-безопасности: composable-ы
 * вызываются и на сервере, где нет ни `window`, ни `document`.
 */
function inBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

/** Округление до сотых: в CSS-переменную попадает читаемое число, а не хвост деления. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Можно ли двигать прямо сейчас.
 *
 * Три стоп-фактора: системная настройка «меньше движения», тач-устройство
 * (там нет курсора — значит нет и реакции на него) и выключенное 3D-качество
 * (пользователь попросил облегчить страницу — лишние пиксельные эффекты
 * на ней не нужны).
 */
function motionAllowed(): boolean {
  if (!inBrowser()) return false
  if (prefersReducedMotion()) return false
  if (isTouchDevice()) return false
  return useQuality3D().resolved.value !== 'off'
}

/**
 * Обвязка примитива с элементом: подписка, отписка и правильный жизненный цикл.
 *
 * Зачем так сложно: ref в Vue заполняется ПОСЛЕ setup, а сам элемент может
 * появиться позже (`v-if`, `v-for`). Поэтому подписка делается в `onMounted`,
 * а `watch` следит за сменой узла — иначе примитив молча не работал бы на
 * динамически созданных элементах. Отписка обязана быть симметричной:
 * иначе «мёртвые» слушатели копятся на каждом переходе роутера.
 */
function useElementBinding(
  el: Ref<HTMLElement | null>,
  onBind: (node: HTMLElement) => void,
  onUnbind: (node: HTMLElement) => void,
): void {
  let bound: HTMLElement | null = null

  const attach = (node: HTMLElement | null) => {
    if (bound === node) return
    if (bound) {
      onUnbind(bound)
      bound = null
    }
    if (!node) return
    bound = node
    onBind(node)
  }

  const detach = () => {
    if (!bound) return
    onUnbind(bound)
    bound = null
  }

  if (getCurrentInstance()) {
    onMounted(() => attach(el.value))
    onUnmounted(detach)
  } else if (getCurrentScope()) {
    // Вне компонента (например, в unit-тесте) подписываемся сразу.
    attach(el.value)
    onScopeDispose(detach)
  }

  if (getCurrentScope()) {
    const stop = watch(el, (node) => attach(node), { flush: 'post' })
    onScopeDispose(() => {
      stop()
      detach()
    })
  }
}

export interface PointerLightOptions {
  /** Радиус светового пятна в px; попадает в `--m-light-radius`. */
  radius?: number
  /** Явное отключение: примитив не подписывается вовсе. */
  disabled?: boolean
}

/**
 * Реактивное освещение: свет идёт за курсором по кромке поверхности.
 *
 * Пишет в элемент `--mx` / `--my` — координаты курсора в процентах от
 * левого верхнего угла (50% / 50% — центр). CSS по этим значениям рисует
 * `radial-gradient` или подсвеченную кромку.
 *
 * Обновление идёт через `requestAnimationFrame`: события указателя приходят
 * чаще, чем кадры, поэтому в кадр попадает только последнее значение.
 * В самом кадре нет аллокаций объектов — только две записи в стиль.
 */
export function usePointerLight(
  el: Ref<HTMLElement | null>,
  options: PointerLightOptions = {},
): void {
  const { radius = DEFAULT_LIGHT_RADIUS, disabled = false } = options

  let node: HTMLElement | null = null
  let frame: number | null = null
  let pendingX = 50
  let pendingY = 50

  const write = () => {
    frame = null
    if (!node) return
    node.style.setProperty('--mx', `${round2(pendingX)}%`)
    node.style.setProperty('--my', `${round2(pendingY)}%`)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!node) return
    // Замер здесь, а не в кадре: прямоугольник нужен свежим (страница могла
    // уехать), но читать layout внутри rAF — значит заставлять браузер
    // пересчитывать раскладку в середине отрисовки.
    const rect = node.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    pendingX = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100)
    pendingY = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
    if (frame === null) frame = requestAnimationFrame(write)
  }

  useElementBinding(
    el,
    (bound) => {
      // Выключенный примитив не должен оставлять следов в DOM: иначе у
      // пользователя с отключённым движением в разметке останется свет,
      // которого он не заказывал.
      if (disabled || !motionAllowed()) return
      node = bound
      // Статичный эквивалент: пока курсор не над поверхностью, свет в центре.
      node.style.setProperty('--mx', '50%')
      node.style.setProperty('--my', '50%')
      node.style.setProperty('--m-light-radius', `${round2(radius)}px`)
      node.addEventListener('pointermove', onPointerMove, { passive: true })
    },
    (bound) => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
      bound.removeEventListener('pointermove', onPointerMove)
      bound.style.removeProperty('--mx')
      bound.style.removeProperty('--my')
      bound.style.removeProperty('--m-light-radius')
      node = null
    },
  )
}

export interface MagneticOptions {
  /** Максимальное смещение в px. Мало по умолчанию: это «тяга», а не прыжок. */
  strength?: number
  /** Радиус притяжения вокруг элемента в px. */
  radius?: number
  /** Явное отключение: примитив не подписывается вовсе. */
  disabled?: boolean
}

/**
 * Magnetic interaction: элемент слегка тянется к курсору.
 *
 * Тяга считается от кромки элемента: внутри элемента она максимальная, у
 * границы радиуса — нулевая, дальше элемент спокойно возвращается на место.
 * Смещение пишется в `--mag-x` / `--mag-y` (в пикселях) и применяется
 * отдельным CSS-свойством `translate`, а не `transform` — так наклон из
 * `useTilt` не затирает тягу, если они окажутся на одном элементе.
 *
 * Сглаживание живёт в JS (экспоненциальное сближение к цели), а не в CSS:
 * примитив обязан работать сам по себе, без обязательного `material.css`.
 */
export function useMagnetic(
  el: Ref<HTMLElement | null>,
  options: MagneticOptions = {},
): void {
  const {
    strength = DEFAULT_MAGNETIC_STRENGTH,
    radius = DEFAULT_MAGNETIC_RADIUS,
    disabled = false,
  } = options

  let node: HTMLElement | null = null
  let frame: number | null = null
  let targetX = 0
  let targetY = 0
  let currentX = 0
  let currentY = 0

  const write = () => {
    if (!node) return
    node.style.setProperty('--mag-x', `${round2(currentX)}px`)
    node.style.setProperty('--mag-y', `${round2(currentY)}px`)
  }

  const step = () => {
    frame = null
    if (!node) return
    currentX += (targetX - currentX) * MAGNETIC_EASING
    currentY += (targetY - currentY) * MAGNETIC_EASING
    if (Math.abs(targetX - currentX) < MAGNETIC_EPSILON) currentX = targetX
    if (Math.abs(targetY - currentY) < MAGNETIC_EPSILON) currentY = targetY
    write()
    // Кадр нужен только пока элемент едет; как только он пришёл в цель,
    // цикл останавливается — «вечный» rAF в проекте не приветствуется.
    if (currentX !== targetX || currentY !== targetY) {
      frame = requestAnimationFrame(step)
    }
  }

  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(step)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!node) return
    const rect = node.getBoundingClientRect()
    const halfWidth = rect.width / 2
    const halfHeight = rect.height / 2
    // Смещение самого элемента (translate) сдвигает и прямоугольник —
    // вычитаем его, иначе получится петля обратной связи и дрейф.
    const centerX = rect.left + halfWidth - currentX
    const centerY = rect.top + halfHeight - currentY
    const dx = event.clientX - centerX
    const dy = event.clientY - centerY
    // Расстояние до кромки элемента: 0 — курсор над самим элементом.
    const outsideX = Math.max(0, Math.abs(dx) - halfWidth)
    const outsideY = Math.max(0, Math.abs(dy) - halfHeight)
    const distance = Math.hypot(outsideX, outsideY)

    if (distance > radius) {
      targetX = 0
      targetY = 0
      schedule()
      return
    }

    const falloff = 1 - distance / radius
    targetX = clamp(dx / halfWidth, -1, 1) * strength * falloff
    targetY = clamp(dy / halfHeight, -1, 1) * strength * falloff
    schedule()
  }

  const onPointerLeave = () => {
    targetX = 0
    targetY = 0
    schedule()
  }

  useElementBinding(
    el,
    (bound) => {
      if (disabled) return
      if (!motionAllowed()) return
      if (!inBrowser() || !window.matchMedia) return
      // Тяга — только там, где есть настоящий курсор: на тач-экране
      // «курсор» = палец, и элемент дёргался бы под пальцем.
      if (!window.matchMedia(FINE_POINTER_QUERY).matches) return
      node = bound
      bound.style.setProperty('--mag-x', '0px')
      bound.style.setProperty('--mag-y', '0px')
      bound.style.translate = 'var(--mag-x) var(--mag-y)'
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      window.addEventListener('pointercancel', onPointerLeave, { passive: true })
      window.addEventListener('blur', onPointerLeave)
    },
    (bound) => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointercancel', onPointerLeave)
      window.removeEventListener('blur', onPointerLeave)
      bound.style.removeProperty('--mag-x')
      bound.style.removeProperty('--mag-y')
      bound.style.removeProperty('translate')
      node = null
    },
  )
}

/**
 * Материальная реакция нажатия: «чернила впитались».
 *
 * Ставит `data-pressed="true"` и `--press: 1` — CSS по этим состояниям
 * вдавливает поверхность тенью (см. `.react-press` в `material.css`).
 * Никакого масштабирования: нажатие должно ощущаться как вмятина в бумаге,
 * а не как «элемент стал больше».
 *
 * Клавиатура работает наравне с мышью: Space и Enter держат состояние,
 * пока клавиша нажата.
 */
export function usePress(el: Ref<HTMLElement | null>): void {
  let node: HTMLElement | null = null
  let pressed = false

  const setPressed = (value: boolean) => {
    if (!node || pressed === value) return
    pressed = value
    if (value) {
      node.dataset.pressed = 'true'
      node.style.setProperty('--press', '1')
    } else {
      delete node.dataset.pressed
      node.style.removeProperty('--press')
    }
  }

  const isActivationKey = (event: KeyboardEvent): boolean =>
    event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter'

  const onPointerDown = () => setPressed(true)
  const onPointerRelease = () => setPressed(false)
  const onKeyDown = (event: KeyboardEvent) => {
    if (isActivationKey(event)) setPressed(true)
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (isActivationKey(event)) setPressed(false)
  }
  const onBlur = () => setPressed(false)

  useElementBinding(
    el,
    (bound) => {
      node = bound
      bound.addEventListener('pointerdown', onPointerDown, { passive: true })
      bound.addEventListener('pointerup', onPointerRelease)
      bound.addEventListener('pointercancel', onPointerRelease)
      bound.addEventListener('pointerleave', onPointerRelease)
      bound.addEventListener('keydown', onKeyDown)
      bound.addEventListener('keyup', onKeyUp)
      bound.addEventListener('blur', onBlur)
    },
    (bound) => {
      bound.removeEventListener('pointerdown', onPointerDown)
      bound.removeEventListener('pointerup', onPointerRelease)
      bound.removeEventListener('pointercancel', onPointerRelease)
      bound.removeEventListener('pointerleave', onPointerRelease)
      bound.removeEventListener('keydown', onKeyDown)
      bound.removeEventListener('keyup', onKeyUp)
      bound.removeEventListener('blur', onBlur)
      // Снятое состояние: на размонтированном элементе «залипшее» нажатие
      // выглядело бы как забытый след чернил.
      delete bound.dataset.pressed
      bound.style.removeProperty('--press')
      pressed = false
      node = null
    },
  )
}

/**
 * Единый ответ на вопрос «можно ли двигать».
 *
 * Значение кэшируется: пересчитывать его на каждый вызов дорого, а между
 * кадрами оно не меняется. Исключение — системная настройка «меньше
 * движения»: на неё подписан `matchMedia`, и подписка снимается, когда
 * потребитель (scope) исчезает.
 */
export function useMotionEnabled(): Readonly<Ref<boolean>> {
  const enabled = ref(false)

  if (inBrowser()) {
    enabled.value = !prefersReducedMotion() && !isTouchDevice()
    if (window.matchMedia) {
      const query = window.matchMedia(REDUCED_MOTION_QUERY)
      const onChange = () => {
        enabled.value = !prefersReducedMotion() && !isTouchDevice()
      }
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', onChange)
        if (getCurrentScope()) {
          onScopeDispose(() => query.removeEventListener('change', onChange))
        }
      } else if (typeof query.addListener === 'function') {
        query.addListener(onChange)
        if (getCurrentScope()) {
          onScopeDispose(() => query.removeListener(onChange))
        }
      }
    }
  }

  return readonly(enabled) as Readonly<Ref<boolean>>
}

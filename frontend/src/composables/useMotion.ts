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
 * Перф-дисциплина (правила модуля, а не пожелания):
 * - ни одного `setInterval` и ни одного rAF, который живёт без причины:
 *   цикл крутится только пока элемент едет;
 * - в кадре нет лишней работы: координаты пишутся в стиль только когда они
 *   заметно изменились, а не на каждый кадр;
 * - `will-change` навешивается на время смещения и снимается в покое;
 * - тяжёлые реакции ограничены капом (см. `--motion-cap` в `motion.css`),
 *   поэтому страница не может превратиться в коллекцию прожекторов;
 * - каждая подписка снимается симметрично: ушедший элемент не оставляет
 *   за собой ни слушателей, ни запланированных кадров.
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
  watch,
  type Ref,
} from 'vue'

import { inBrowser, motionAllowed, useMotionPreference } from './useGsap'

const FINE_POINTER_QUERY = '(pointer: fine)'

/** Радиус светового пятна: это пятно, а не прожектор — край должен остаться бумагой. */
const DEFAULT_LIGHT_RADIUS = 180
/** Максимальная тяга magnetic: смещение в несколько пикселей, а не прыжок. */
const DEFAULT_MAGNETIC_STRENGTH = 6
/** Радиус, в котором курсор вообще тянет элемент к себе. */
const DEFAULT_MAGNETIC_RADIUS = 120
/** Коэффициент сглаживания тяги: меньше — «тяжелее», больше — «резче». */
const MAGNETIC_EASING = 0.2
/** Порог, ниже которого разница считается нулём и кадр-за-кадром цикл встаёт. */
const MAGNETIC_EPSILON = 0.05
/**
 * Порог заметного изменения света: меньше половины процента глаз не видит,
 * а лишняя запись в стиль перерисовывает слой света целиком.
 */
const LIGHT_EPSILON = 0.5
/**
 * Кап одновременных «тяжёлых» реакций (см. `--motion-cap` в `motion.css`):
 * свет по кромке живёт максимум на двух поверхностях страницы.
 */
const LIGHT_CAP = 2
/** Магнит в приложении один: тяга — это внимание, а внимания должно быть мало. */
const MAGNETIC_CAP = 1

/**
 * Живые «тяжёлые» реакции: считаем их, чтобы кап был настоящим, а не
 * декларацией в CSS. Записи удаляются в обвязке элемента, поэтому счётчик
 * не растёт при переходах роутера.
 */
const liveLights = new Set<HTMLElement>()
const liveMagnetics = new Set<HTMLElement>()

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
 * Обвязка примитива с элементом: подписка, отписка и правильный жизненный цикл.
 *
 * Зачем так сложно: ref в Vue заполняется ПОСЛЕ setup, а сам элемент может
 * появиться позже (`v-if`, `v-for`). Поэтому подписка делается в `onMounted`,
 * а `watch` следит за сменой узла — иначе примитив молча не работал бы на
 * динамически создаваемых элементах. Отписка обязана быть симметричной:
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
 * В кадре нет аллокаций наших объектов — только запись в стиль, и только
 * если значение заметно изменилось.
 */
export function usePointerLight(
  el: Ref<HTMLElement | null>,
  options: PointerLightOptions = {},
): void {
  const { radius = DEFAULT_LIGHT_RADIUS, disabled = false } = options

  let node: HTMLElement | null = null
  let frame: number | null = null
  let clientX = 0
  let clientY = 0
  let pendingX = 50
  let pendingY = 50
  let appliedX = 50
  let appliedY = 50
  let active = false

  /**
   * Запись в кадр. Пишем только то, что заметно изменилось: и лишняя запись
   * в стиль, и лишняя сборка строки — работа, которой никто не видит.
   */
  const write = () => {
    if (!node) return
    const nextX = round2(pendingX)
    const nextY = round2(pendingY)
    if (Math.abs(nextX - appliedX) >= LIGHT_EPSILON) {
      appliedX = nextX
      node.style.setProperty('--mx', `${nextX}%`)
    }
    if (Math.abs(nextY - appliedY) >= LIGHT_EPSILON) {
      appliedY = nextY
      node.style.setProperty('--my', `${nextY}%`)
    }
  }

  /**
   * Кадр света: замер, пересчёт в проценты, запись. Замер именно здесь:
   * к моменту кадра браузер уже посчитал раскладку, поэтому чтение
   * прямоугольника не форсирует пересчёт посреди отрисовки.
   */
  const measure = () => {
    frame = null
    if (!node) return
    const rect = node.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    pendingX = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100)
    pendingY = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100)
    write()
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!node) return
    // Только координаты: всё остальное считается в кадре.
    clientX = event.clientX
    clientY = event.clientY
    if (frame === null) frame = requestAnimationFrame(measure)
  }

  useElementBinding(
    el,
    (bound) => {
      // Выключенный примитив не должен оставлять следов в DOM: иначе у
      // пользователя с отключённым движением в разметке останется свет,
      // которого он не заказывал.
      if (disabled || !motionAllowed()) return
      // Кап: свет — это внимание, и на странице ему место только у героя
      // и у одной детали. Остальные поверхности остаются статичными.
      if (liveLights.size >= LIGHT_CAP) return
      node = bound
      active = true
      liveLights.add(bound)
      // Статичный эквивалент: пока курсор не над поверхностью, свет в центре.
      bound.style.setProperty('--mx', '50%')
      bound.style.setProperty('--my', '50%')
      bound.style.setProperty('--m-light-radius', `${round2(radius)}px`)
      bound.addEventListener('pointermove', onPointerMove, { passive: true })
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
      if (active) {
        liveLights.delete(bound)
        active = false
      }
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
 * Цель считается в кадре, а не в событии: события указателя приходят чаще
 * кадров, и в кадр попадает только последнее положение курсора.
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
  let clientX = 0
  let clientY = 0
  let targetX = 0
  let targetY = 0
  let currentX = 0
  let currentY = 0
  let writtenX = 0
  let writtenY = 0
  let released = false
  let active = false

  /** Кадр тяги: замер, цель, сглаживание, запись. */
  const step = () => {
    frame = null
    if (!node) return

    if (released) {
      // Указатель ушёл из окна (cancel/blur) — тяги больше нет.
      targetX = 0
      targetY = 0
    } else {
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        targetX = 0
        targetY = 0
      } else {
        const halfWidth = rect.width / 2
        const halfHeight = rect.height / 2
        // Смещение самого элемента (translate) сдвигает и прямоугольник —
        // вычитаем его, иначе получится петля обратной связи и дрейф.
        const centerX = rect.left + halfWidth - currentX
        const centerY = rect.top + halfHeight - currentY
        const dx = clientX - centerX
        const dy = clientY - centerY
        // Расстояние до кромки элемента: 0 — курсор над самим элементом.
        const outsideX = Math.max(0, Math.abs(dx) - halfWidth)
        const outsideY = Math.max(0, Math.abs(dy) - halfHeight)
        const distance = Math.hypot(outsideX, outsideY)

        if (distance > radius) {
          targetX = 0
          targetY = 0
        } else {
          const falloff = 1 - distance / radius
          targetX = clamp(dx / halfWidth, -1, 1) * strength * falloff
          targetY = clamp(dy / halfHeight, -1, 1) * strength * falloff
        }
      }
    }

    currentX += (targetX - currentX) * MAGNETIC_EASING
    currentY += (targetY - currentY) * MAGNETIC_EASING
    if (Math.abs(targetX - currentX) < MAGNETIC_EPSILON) currentX = targetX
    if (Math.abs(targetY - currentY) < MAGNETIC_EPSILON) currentY = targetY

    const nextX = round2(currentX)
    const nextY = round2(currentY)
    if (nextX !== writtenX || nextY !== writtenY) {
      writtenX = nextX
      writtenY = nextY
      // Слой готовим только на время движения: постоянный `will-change`
      // заставляет браузер держать лишний слой композитора всё время.
      node.style.willChange = 'translate'
      node.style.setProperty('--mag-x', `${nextX}px`)
      node.style.setProperty('--mag-y', `${nextY}px`)
    }

    // Кадр нужен только пока элемент едет; как только он пришёл в цель,
    // цикл останавливается — «вечный» rAF в проекте не приветствуется.
    if (currentX !== targetX || currentY !== targetY) {
      frame = requestAnimationFrame(step)
    } else {
      node.style.removeProperty('will-change')
    }
  }

  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(step)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!node) return
    released = false
    clientX = event.clientX
    clientY = event.clientY
    schedule()
  }

  const onRelease = () => {
    released = true
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
      // Кап: тяга в приложении одна. Второй претендент остаётся статичным.
      if (liveMagnetics.size >= MAGNETIC_CAP) return
      node = bound
      active = true
      liveMagnetics.add(bound)
      bound.style.setProperty('--mag-x', '0px')
      bound.style.setProperty('--mag-y', '0px')
      bound.style.translate = 'var(--mag-x) var(--mag-y)'
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      window.addEventListener('pointercancel', onRelease, { passive: true })
      window.addEventListener('blur', onRelease)
    },
    (bound) => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointercancel', onRelease)
      window.removeEventListener('blur', onRelease)
      if (active) {
        liveMagnetics.delete(bound)
        active = false
      }
      bound.style.removeProperty('--mag-x')
      bound.style.removeProperty('--mag-y')
      bound.style.removeProperty('translate')
      bound.style.removeProperty('will-change')
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
 * Здесь нет ни rAF, ни замеров: нажатие — это переключение состояния,
 * а всю анимацию тени делает CSS. Клавиатура работает наравне с мышью:
 * Space и Enter держат состояние, пока клавиша нажата.
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
      node.removeAttribute('data-pressed')
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
      bound.removeAttribute('data-pressed')
      bound.style.removeProperty('--press')
      pressed = false
      node = null
    },
  )
}

/**
 * Единый ответ на вопрос «можно ли двигать».
 *
 * Источник — `useMotionPreference` из `useGsap`: он следит за системной
 * настройкой «меньше движения» и за качеством 3D, а подписки снимает
 * вместе со scope потребителя. Здесь только тонкая обёртка, чтобы
 * примитивы и вью говорили об одном и том же.
 */
export function useMotionEnabled(): Readonly<Ref<boolean>> {
  return useMotionPreference()
}

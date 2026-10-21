import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Flip } from 'gsap/Flip'
import { getCurrentScope, onScopeDispose, readonly, ref, watch, type Ref } from 'vue'

import { useQuality3D } from './useQuality3D'

gsap.registerPlugin(ScrollTrigger, Flip)

export { gsap, ScrollTrigger, Flip }

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Признак «мы в браузере». Composable-ы вызываются и на сервере, где нет ни
 * `window`, ни `document` — и там никакого движения быть не может.
 */
export function inBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/**
 * Кэш MediaQueryList.
 *
 * `matchMedia` каждый раз создаёт новый объект, а системные настройки
 * спрашиваются в каждом кадре motion-примитивов — без кэша это заметный мусор
 * в куче. Кэш сбрасывается, если подменена сама функция `matchMedia`
 * (тесты делают именно это), иначе примитивы держали бы мёртвый объект.
 */
let cachedMatchMedia: typeof window.matchMedia | null = null
const mediaCache = new Map<string, MediaQueryList>()

/** Живой MediaQueryList по запросу — один объект на запрос, а не на вызов. */
function mediaQuery(query: string): MediaQueryList | null {
  if (!inBrowser() || typeof window.matchMedia !== 'function') return null
  if (cachedMatchMedia !== window.matchMedia) {
    cachedMatchMedia = window.matchMedia
    mediaCache.clear()
  }
  let list = mediaCache.get(query)
  if (!list) {
    list = window.matchMedia(query)
    mediaCache.set(query, list)
  }
  return list
}

export const prefersReducedMotion = (): boolean =>
  mediaQuery(REDUCED_MOTION_QUERY)?.matches ?? false

export const isTouchDevice = (): boolean =>
  inBrowser() && ('ontouchstart' in window || navigator.maxTouchPoints > 0)

/**
 * Единая точка правды «можно ли двигать».
 *
 * Три стоп-фактора: системная настройка «меньше движения», тач-устройство
 * (там нет курсора — значит нет и реакции на него) и выключенное 3D-качество
 * (пользователь попросил облегчить страницу — лишние пиксельные эффекты на
 * ней не нужны).
 *
 * Функция ничего не подписывает и ничего не кэширует сама: системная
 * настройка читается из кэша MediaQueryList, качество 3D — из computed,
 * который Vue пересчитывает только при реальном изменении.
 */
export const motionAllowed = (): boolean => {
  if (!inBrowser()) return false
  if (prefersReducedMotion()) return false
  if (isTouchDevice()) return false
  return useQuality3D().resolved.value !== 'off'
}

/**
 * Реактивная версия `motionAllowed`.
 *
 * Значение обновляется само, когда меняется системная настройка «меньше
 * движения» или падает качество 3D (деградация по FPS). Подписки снимаются
 * вместе со scope потребителя — «вечных» слушателей в проекте нет.
 */
export function useMotionPreference(): Readonly<Ref<boolean>> {
  const enabled = ref(motionAllowed())

  if (inBrowser()) {
    const update = () => {
      enabled.value = motionAllowed()
    }

    const query = mediaQuery(REDUCED_MOTION_QUERY)
    if (query) {
      const onChange = () => update()
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

    // Качество 3D может упасть на лету: тогда движение выключается вместе с
    // ним. Источник — computed, поэтому пересчёт случается только при
    // реальном изменении качества, а не в каждом кадре.
    if (getCurrentScope()) {
      const stopQuality = watch(() => useQuality3D().resolved.value, update)
      onScopeDispose(stopQuality)
    }
  }

  return readonly(enabled) as Readonly<Ref<boolean>>
}

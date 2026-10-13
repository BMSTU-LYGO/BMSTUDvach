import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { useReadingPosition } from '@/composables/useReadingPosition'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

const STORAGE_KEY = 'bmstud-thread-position'

function stored(): Record<string, number> {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : {}
}

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
}

function setScrollHeight(height: number) {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: height,
    configurable: true,
  })
}

/** jsdom крутит rAF по таймеру — ждём пару кадров, как настоящий браузер. */
function nextFrames(count = 2) {
  let done = 0
  return new Promise<void>((resolve) => {
    const step = () => (++done < count ? requestAnimationFrame(step) : resolve())
    requestAnimationFrame(step)
  })
}

describe('useReadingPosition', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorageMock.clear()
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('remember / restore', () => {
    it('does nothing when the thread was never read', () => {
      const { restore } = useReadingPosition()
      expect(restore(7)).toBe(false)
      expect(scrollTo).not.toHaveBeenCalled()
    })

    it('round-trips the position of a thread', () => {
      const { remember, restore } = useReadingPosition()
      remember(7, 640)

      expect(stored()).toEqual({ '7': 640 })
      expect(restore(7)).toBe(true)
      expect(scrollTo).toHaveBeenCalledWith(0, 640)
    })

    it('keeps a position per thread', () => {
      const { remember, restore } = useReadingPosition()
      remember(7, 120)
      remember(9, 480)

      expect(stored()).toEqual({ '7': 120, '9': 480 })
      expect(restore(9)).toBe(true)
      expect(scrollTo).toHaveBeenCalledWith(0, 480)
      expect(restore(8)).toBe(false)
    })

    it('neglects a zero position — the page keeps its own behaviour', () => {
      const { remember, restore } = useReadingPosition()
      remember(7, 0)

      expect(stored()).toEqual({ '7': 0 })
      expect(restore(7)).toBe(false)
      expect(scrollTo).not.toHaveBeenCalled()
    })
  })

  describe('защита от мусора', () => {
    it('clamps a negative value to zero', () => {
      const { remember, restore } = useReadingPosition()
      remember(7, -500)

      expect(stored()).toEqual({ '7': 0 })
      expect(restore(7)).toBe(false)
    })

    it('floors a fractional position', () => {
      const { remember } = useReadingPosition()
      remember(7, 240.8)
      expect(stored()).toEqual({ '7': 240 })
    })

    it('clamps the position to the document height', () => {
      setScrollHeight(1800)
      const { remember, restore } = useReadingPosition()
      remember(7, 99999)

      expect(stored()).toEqual({ '7': 1800 })
      expect(restore(7)).toBe(true)
      expect(scrollTo).toHaveBeenCalledWith(0, 1800)
    })

    it('reads a broken payload as "no position" and recovers by writing', () => {
      localStorage.setItem(STORAGE_KEY, '{"1": {"сломано"')
      const { remember, restore } = useReadingPosition()

      expect(restore(1)).toBe(false)
      remember(1, 300)
      expect(stored()).toEqual({ '1': 300 })
    })

    it('ignores payloads that are not an id map', () => {
      localStorage.setItem(STORAGE_KEY, '["7"]')
      const { restore } = useReadingPosition()
      expect(restore(7)).toBe(false)
    })

    it('drops non-numeric and negative entries', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ 7: 300, 8: 'низ', 9: -12, 10: null, 11: Number.NaN }),
      )
      const { restore } = useReadingPosition()

      expect(restore(7)).toBe(true)
      expect(restore(8)).toBe(false)
      expect(restore(9)).toBe(false)
      expect(restore(10)).toBe(false)
      expect(restore(11)).toBe(false)
    })
  })

  describe('watchPosition', () => {
    it('writes the position on scroll', async () => {
      const { watchPosition } = useReadingPosition()
      const stop = watchPosition(7)

      setScrollY(540)
      window.dispatchEvent(new Event('scroll'))
      await nextFrames()

      expect(stored()).toEqual({ '7': 540 })
      stop()
    })

    it('throttles scroll writes to ~200ms', async () => {
      const { watchPosition } = useReadingPosition()
      const stop = watchPosition(7)

      setScrollY(100)
      window.dispatchEvent(new Event('scroll'))
      await nextFrames()
      expect(stored()).toEqual({ '7': 100 })

      // второй скролл в пределах интервала не пишет
      setScrollY(200)
      window.dispatchEvent(new Event('scroll'))
      await nextFrames()
      expect(stored()).toEqual({ '7': 100 })

      await new Promise((resolve) => setTimeout(resolve, 240))

      setScrollY(300)
      window.dispatchEvent(new Event('scroll'))
      await nextFrames()
      expect(stored()).toEqual({ '7': 300 })

      stop()
    })

    it('fixes the position when the tab goes hidden', async () => {
      const { watchPosition } = useReadingPosition()
      const stop = watchPosition(7)

      setScrollY(360)
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      expect(stored()).toEqual({ '7': 360 })
      stop()
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
    })

    it('fixes the position when the page is unloaded', () => {
      const { watchPosition } = useReadingPosition()
      const stop = watchPosition(7)

      setScrollY(720)
      window.dispatchEvent(new Event('pagehide'))

      expect(stored()).toEqual({ '7': 720 })
      stop()
    })

    it('stops writing and drops pending frames after stop()', async () => {
      const { watchPosition } = useReadingPosition()
      const stop = watchPosition(7)

      setScrollY(400)
      window.dispatchEvent(new Event('scroll'))
      stop()

      await nextFrames()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

      setScrollY(900)
      window.dispatchEvent(new Event('scroll'))
      await nextFrames()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('subscribes passively and removes every listener on stop()', () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const documentRemoveSpy = vi.spyOn(document, 'removeEventListener')

      const { watchPosition } = useReadingPosition()
      const stop = watchPosition(7)

      expect(addSpy.mock.calls.map((call) => call[0])).toContain('scroll')
      expect(
        addSpy.mock.calls.find((call) => call[0] === 'scroll')?.[2],
      ).toEqual({ passive: true })
      expect(addSpy.mock.calls.map((call) => call[0])).toContain('pagehide')

      stop()

      expect(removeSpy.mock.calls.map((call) => call[0])).toContain('scroll')
      expect(removeSpy.mock.calls.map((call) => call[0])).toContain('pagehide')
      expect(documentRemoveSpy.mock.calls.map((call) => call[0])).toContain(
        'visibilitychange',
      )
    })
  })
})

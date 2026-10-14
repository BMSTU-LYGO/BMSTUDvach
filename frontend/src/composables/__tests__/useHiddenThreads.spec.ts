import { describe, it, expect, beforeEach } from 'vitest'

import { useHiddenThreads, __reloadHiddenThreads } from '@/composables/useHiddenThreads'

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

const STORAGE_KEY = 'bmstud-hidden-threads'
const REVEAL_KEY = 'bmstud-hidden-reveal'

function stored(): unknown {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

describe('useHiddenThreads', () => {
  beforeEach(() => {
    localStorageMock.clear()
    __reloadHiddenThreads()
  })

  it('starts empty', () => {
    const hidden = useHiddenThreads()
    expect(hidden.hiddenCount.value).toBe(0)
    expect(hidden.hiddenIds.value.size).toBe(0)
    expect(hidden.isHidden(7)).toBe(false)
    expect(hidden.revealHidden.value).toBe(false)
  })

  it('hide writes the id into localStorage and unhide removes it', () => {
    const hidden = useHiddenThreads()
    hidden.hide(7)

    expect(hidden.isHidden(7)).toBe(true)
    expect(hidden.hiddenCount.value).toBe(1)
    expect(stored()).toEqual([7])

    hidden.unhide(7)
    expect(hidden.isHidden(7)).toBe(false)
    expect(hidden.hiddenCount.value).toBe(0)
    expect(stored()).toEqual([])
  })

  it('persists across composable instances', () => {
    useHiddenThreads().hide(11)
    const second = useHiddenThreads()
    expect(second.isHidden(11)).toBe(true)
    expect(second.hiddenCount.value).toBe(1)
  })

  it('is idempotent — hiding twice keeps a single entry', () => {
    const hidden = useHiddenThreads()
    hidden.hide(7)
    hidden.hide(7)
    expect(hidden.hiddenCount.value).toBe(1)
    expect(stored()).toEqual([7])
  })

  it('toggle flips the id', () => {
    const hidden = useHiddenThreads()
    hidden.toggle(7)
    expect(hidden.isHidden(7)).toBe(true)
    hidden.toggle(7)
    expect(hidden.isHidden(7)).toBe(false)
  })

  it('ignores non-positive and non-integer ids', () => {
    const hidden = useHiddenThreads()
    hidden.hide(0)
    hidden.hide(-3)
    hidden.hide(2.5)
    expect(hidden.hiddenCount.value).toBe(0)
  })

  it('ignores a broken JSON payload', () => {
    localStorage.setItem(STORAGE_KEY, '[1, {"broken"')
    __reloadHiddenThreads()
    expect(useHiddenThreads().hiddenCount.value).toBe(0)
  })

  it('ignores a payload that is not an array', () => {
    localStorage.setItem(STORAGE_KEY, '{"7": true}')
    __reloadHiddenThreads()
    expect(useHiddenThreads().hiddenCount.value).toBe(0)
  })

  it('drops non-numeric, negative and duplicate entries', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([7, 'нет', -3, 7, 9, null, 0]))
    __reloadHiddenThreads()
    const hidden = useHiddenThreads()
    expect(hidden.isHidden(7)).toBe(true)
    expect(hidden.isHidden(9)).toBe(true)
    expect(hidden.hiddenCount.value).toBe(2)
  })

  it('reveal toggles and persists', () => {
    const hidden = useHiddenThreads()
    expect(hidden.revealHidden.value).toBe(false)

    hidden.toggleReveal()
    expect(hidden.revealHidden.value).toBe(true)
    expect(localStorage.getItem(REVEAL_KEY)).toBe('1')

    __reloadHiddenThreads()
    const second = useHiddenThreads()
    expect(second.revealHidden.value).toBe(true)

    second.toggleReveal()
    expect(second.revealHidden.value).toBe(false)
    expect(localStorage.getItem(REVEAL_KEY)).toBe('0')
  })

  it('recovers by overwriting a previously broken value', () => {
    localStorage.setItem(STORAGE_KEY, '{не json')
    __reloadHiddenThreads()
    const hidden = useHiddenThreads()
    hidden.hide(7)
    expect(hidden.isHidden(7)).toBe(true)
    expect(stored()).toEqual([7])
  })

  it('picks up changes written by another tab', () => {
    const hidden = useHiddenThreads()
    expect(hidden.isHidden(7)).toBe(false)

    localStorage.setItem(STORAGE_KEY, JSON.stringify([7]))
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))

    expect(hidden.isHidden(7)).toBe(true)
    expect(hidden.hiddenCount.value).toBe(1)
  })

  it('picks up a reveal flag written by another tab', () => {
    const hidden = useHiddenThreads()
    localStorage.setItem(REVEAL_KEY, '1')
    window.dispatchEvent(new StorageEvent('storage', { key: REVEAL_KEY }))
    expect(hidden.revealHidden.value).toBe(true)
  })
})

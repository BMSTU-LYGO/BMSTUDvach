import { describe, it, expect, beforeEach } from 'vitest'

import { useWatchlist } from '@/composables/useWatchlist'

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

describe('useWatchlist', () => {
  beforeEach(() => {
    localStorageMock.clear()
    // the store is a module singleton — reset it between tests
    const w = useWatchlist()
    for (const e of [...w.entries.value]) w.untrack(e.threadId)
  })

  it('tracks and untracks threads', () => {
    const w = useWatchlist()
    w.track(7, 'Тред про сессию', 3)
    expect(w.isTracked(7)).toBe(true)
    w.untrack(7)
    expect(w.isTracked(7)).toBe(false)
  })

  it('toggle flips both ways', () => {
    const w = useWatchlist()
    w.toggle(7, 'Тред', 1)
    expect(w.isTracked(7)).toBe(true)
    w.toggle(7, 'Тред', 1)
    expect(w.isTracked(7)).toBe(false)
  })

  it('replies after markSeen count as unread', () => {
    const w = useWatchlist()
    w.track(7, 'Тред', 3)
    expect(w.unread(7, 3)).toBe(0)
    expect(w.unread(7, 6)).toBe(3)

    // reading the thread resets the counter
    w.markSeen(7, 6)
    expect(w.unread(7, 6)).toBe(0)
    expect(w.unread(7, 7)).toBe(1)
  })

  it('totals unread from a counts map', () => {
    const w = useWatchlist()
    w.track(7, 'A', 2)
    w.track(8, 'B', 0)
    w.markSeen(8, 1)
    // thread 7: 5-2=3 новых, thread 8: 4-1=3 новых
    expect(w.totalUnread({ 7: 5, 8: 4 })).toBe(6)
    expect(w.totalUnread({})).toBe(0)
  })

  it('persists across instances (localStorage)', () => {
    const w = useWatchlist()
    w.track(11, 'Долгий тред', 4)

    const w2 = useWatchlist()
    expect(w2.isTracked(11)).toBe(true)
    expect(w2.entries.value[0].title).toBe('Долгий тред')
  })
})

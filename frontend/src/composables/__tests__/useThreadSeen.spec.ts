import { describe, it, expect, beforeEach } from 'vitest'

import { useThreadSeen } from '@/composables/useThreadSeen'
import type { Post } from '@/types'

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

const STORAGE_KEY = 'bmstud-thread-seen'

function post(id: number, thread = 1): Post {
  return {
    id,
    thread,
    body: `пост ${id}`,
    is_op: id === 1,
    sage: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    author: 'Аноним',
    tripcode: '',
    attachments: [],
  }
}

const posts = [post(1), post(2), post(3), post(4), post(5)]

function stored(): Record<string, number> {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : {}
}

describe('useThreadSeen', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('reports 0 for a thread never opened', () => {
    const seen = useThreadSeen()
    expect(seen.lastSeenPostId(7)).toBe(0)
  })

  it('markSeen writes the boundary and reads it back', () => {
    const seen = useThreadSeen()
    seen.markSeen(7, 3)

    expect(seen.lastSeenPostId(7)).toBe(3)
    expect(stored()).toEqual({ '7': 3 })
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"7":3')
  })

  it('keeps separate boundaries per thread', () => {
    const seen = useThreadSeen()
    seen.markSeen(7, 3)
    seen.markSeen(9, 12)

    expect(seen.lastSeenPostId(7)).toBe(3)
    expect(seen.lastSeenPostId(9)).toBe(12)
    expect(stored()).toEqual({ '7': 3, '9': 12 })
  })

  it('markSeen is idempotent — a smaller id never rewinds the boundary', () => {
    const seen = useThreadSeen()
    seen.markSeen(7, 4)
    seen.markSeen(7, 4)
    seen.markSeen(7, 2)
    seen.markSeen(7, 0)

    expect(seen.lastSeenPostId(7)).toBe(4)
    expect(stored()).toEqual({ '7': 4 })
  })

  it('persists across composable instances (localStorage)', () => {
    const first = useThreadSeen()
    first.markSeen(11, 5)

    const second = useThreadSeen()
    expect(second.lastSeenPostId(11)).toBe(5)
    expect(second.newPostsCount(11, posts)).toBe(0)
  })

  it('newPostsCount counts posts above the boundary', () => {
    const seen = useThreadSeen()
    seen.markSeen(1, 3)

    expect(seen.newPostsCount(1, posts)).toBe(2)
    expect(seen.newPostsCount(1, [post(2), post(3)])).toBe(0)
    expect(seen.newPostsCount(1, [])).toBe(0)
  })

  it('newPostsCount counts everything while there is no record', () => {
    // граница 0 — формально «новые» все; решение не показывать разделитель
    // при первом посещении принимает уже вьюха
    const seen = useThreadSeen()
    expect(seen.newPostsCount(1, posts)).toBe(posts.length)
  })

  it('ignores a broken JSON payload', () => {
    localStorage.setItem(STORAGE_KEY, '{"1": {"broken"')
    const seen = useThreadSeen()
    expect(seen.lastSeenPostId(1)).toBe(0)
    expect(seen.newPostsCount(1, posts)).toBe(posts.length)
  })

  it('ignores a payload that is not an id map', () => {
    localStorage.setItem(STORAGE_KEY, '["7", "9"]')
    const seen = useThreadSeen()
    expect(seen.lastSeenPostId(7)).toBe(0)
  })

  it('drops non-numeric and negative entries', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 7: 4, 8: 'нет', 9: -3, 10: null }))
    const seen = useThreadSeen()
    expect(seen.lastSeenPostId(7)).toBe(4)
    expect(seen.lastSeenPostId(8)).toBe(0)
    expect(seen.lastSeenPostId(9)).toBe(0)
    expect(seen.lastSeenPostId(10)).toBe(0)
  })

  it('recovers by overwriting a previously broken value', () => {
    localStorage.setItem(STORAGE_KEY, '{не json')
    const seen = useThreadSeen()
    seen.markSeen(7, 2)
    expect(seen.lastSeenPostId(7)).toBe(2)
    expect(stored()).toEqual({ '7': 2 })
  })

  it('picks up a boundary written by another tab', () => {
    const seen = useThreadSeen()
    expect(seen.lastSeenPostId(7)).toBe(0)

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ '7': 6 }))
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))

    expect(seen.lastSeenPostId(7)).toBe(6)
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  collectLocalData,
  collectLocalDataKeys,
  downloadLocalData,
  isAppStorageKey,
  resetLocalData,
} from '@/composables/useLocalData'

const store = new Map<string, string>()

const localStorageMock = {
  get length() {
    return store.size
  },
  key: (index: number) => [...store.keys()][index] ?? null,
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => {
    store.set(key, String(value))
  },
  removeItem: (key: string) => {
    store.delete(key)
  },
  clear: () => {
    store.clear()
  },
}

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

function seed() {
  store.clear()
  store.set('bmstud-identity', JSON.stringify({ name: 'Пустота' }))
  store.set('bmstud-identities', JSON.stringify(['!u3V2icOT']))
  store.set('bmstud-mentions-seen', JSON.stringify({ '!u3V2icOT': 12 }))
  store.set('bmstud-thread-seen', JSON.stringify({ 7: 42 }))
  store.set('bmstud-thread-position', JSON.stringify({ 7: 1200 }))
  store.set('bmstudvach-watchlist', JSON.stringify([{ threadId: 7, title: 'A' }]))
  store.set('board-view-mode', 'grid')
  store.set('board-thread-order', 'bump')
  store.set('bmstud-announcement-dismissed', 'true')
  store.set('bmstudvach-sound', 'true')
  store.set('bmstudvach-crt', 'false')
  store.set('bmstudvach-3d', 'medium')
  store.set('draft:new-thread', JSON.stringify({ body: 'черновик', timestamp: 1 }))
}

describe('useLocalData', () => {
  beforeEach(() => {
    seed()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('isAppStorageKey', () => {
    it('recognises our prefixes and rejects foreign keys', () => {
      expect(isAppStorageKey('bmstud-identity')).toBe(true)
      expect(isAppStorageKey('bmstudvach-watchlist')).toBe(true)
      expect(isAppStorageKey('board-view-mode')).toBe(true)
      expect(isAppStorageKey('draft:new-thread')).toBe(true)

      expect(isAppStorageKey('other-app')).toBe(false)
      expect(isAppStorageKey('theme')).toBe(false)
      expect(isAppStorageKey('session-id')).toBe(false)
      expect(isAppStorageKey('bmstud')).toBe(false)
    })
  })

  describe('collectLocalData', () => {
    it('parses JSON values and falls back to raw strings', () => {
      store.set('bmstud-broken', '{"invalid":')

      const dump = collectLocalData()

      expect(dump.keys['bmstud-broken']).toBe('{"invalid":')
      expect(dump.keys['board-view-mode']).toBe('grid')
      expect(dump.keys).toHaveProperty('bmstudvach-3d', 'medium')
      expect(dump.keys['bmstud-thread-seen']).toEqual({ 7: 42 })
      expect(dump.keys['draft:new-thread']).toEqual({ body: 'черновик', timestamp: 1 })
      expect(dump.keys['bmstudvach-watchlist']).toEqual([{ threadId: 7, title: 'A' }])
    })

    it('stamps the export time', () => {
      const dump = collectLocalData()
      expect(Number.isNaN(Date.parse(dump.exported_at))).toBe(false)
    })

    it('sorts keys and skips keys the app does not own', () => {
      const dump = collectLocalData()
      const keys = Object.keys(dump.keys)

      expect([...keys].sort()).toEqual(keys)
      expect(keys).not.toContain('other-app')
      expect(keys.every((k) => k.startsWith('bmstud') || k.startsWith('board-') || k.startsWith('draft:'))).toBe(
        true,
      )
    })

    it('returns an empty snapshot when nothing is stored', () => {
      store.clear()
      expect(collectLocalData()).toEqual({ exported_at: expect.any(String), keys: {} })
    })
  })

  describe('collectLocalDataKeys', () => {
    it('lists only app keys', () => {
      const keys = collectLocalDataKeys()
      expect(keys).toContain('bmstud-identity')
      expect(keys).toContain('draft:new-thread')
      expect(keys).not.toContain('other-app')
    })
  })

  describe('downloadLocalData', () => {
    it('creates a JSON blob download and revokes the url', () => {
      const createObjectURL = vi.fn((_blob: Blob) => 'blob:bmstud')
      const revokeObjectURL = vi.fn()
      vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

      const links: HTMLAnchorElement[] = []
      const originalCreate = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreate(tag)
        if (tag === 'a') {
          links.push(el as HTMLAnchorElement)
          vi.spyOn(el, 'click').mockImplementation(() => {})
        }
        return el
      })

      downloadLocalData()

      expect(createObjectURL).toHaveBeenCalledTimes(1)
      const blob = createObjectURL.mock.calls[0][0]
      expect(blob.type).toBe('application/json')
      expect(blob).toBeInstanceOf(Blob)

      expect(links).toHaveLength(1)
      expect(links[0].getAttribute('download')).toBe('bmstudvach-local-data.json')
      expect(links[0].click).toHaveBeenCalledTimes(1)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:bmstud')
    })

    it('is a no-op when createObjectURL is unavailable', () => {
      vi.stubGlobal('URL', { revokeObjectURL: vi.fn() })
      expect(() => downloadLocalData()).not.toThrow()
    })

    it('is a no-op when URL itself is unavailable', () => {
      const url = globalThis.URL
      // @ts-expect-error — simulating an environment without URL
      delete globalThis.URL
      expect(() => downloadLocalData()).not.toThrow()
      globalThis.URL = url
    })
  })

  describe('resetLocalData', () => {
    it('removes only app keys and returns the count', () => {
      store.set('other-app', 'чужое')
      store.set('theme', 'dark')

      const removed = resetLocalData()

      expect(removed).toBe(13)
      expect(store.size).toBe(2)
      expect(store.get('other-app')).toBe('чужое')
      expect(store.get('theme')).toBe('dark')
      expect(collectLocalDataKeys()).toEqual([])
      expect(collectLocalData().keys).toEqual({})
    })

    it('returns 0 when there is nothing to remove', () => {
      store.clear()
      expect(resetLocalData()).toBe(0)
    })
  })
})

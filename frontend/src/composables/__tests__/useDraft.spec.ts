import { describe, it, expect, beforeEach } from 'vitest'

import { discardDraft, listDrafts } from '@/composables/useDraft'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
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

function seed(key: string, value: unknown) {
  localStorageMock.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
}

describe('listDrafts', () => {
  beforeEach(() => localStorageMock.clear())

  it('returns an empty list when nothing is stored', () => {
    expect(listDrafts()).toEqual([])
  })

  it('parses valid signal drafts and projects their fields', () => {
    seed('draft:signal-7', { body: '  незаконченный сигнал  ', files: [], timestamp: 1000 })

    expect(listDrafts()).toEqual([
      {
        key: 'draft:signal-7',
        threadId: 7,
        body: '  незаконченный сигнал  ',
        filesCount: 0,
        savedAt: 1000,
      },
    ])
  })

  it('counts attachments and keeps a draft that has files but no text', () => {
    seed('draft:signal-8', { body: '   ', files: [{}, {}], timestamp: 2000 })

    const [draft] = listDrafts()
    expect(draft.threadId).toBe(8)
    expect(draft.filesCount).toBe(2)
    expect(draft.body).toBe('   ')
  })

  it('skips broken JSON, foreign keys and empty buffers', () => {
    seed('draft:signal-1', '{ broken json')
    seed('draft:signal-2', 'not-json-at-all')
    seed('draft:signal-3', { body: '', files: [], timestamp: 3000 })
    seed('draft:signal-4', { body: '   ', files: [], timestamp: 4000 })
    seed('draft:signal-x', { body: 'числа нет', files: [], timestamp: 5000 })
    seed('draft:', { body: 'пустой id', files: [], timestamp: 6000 })
    seed('other:1', { body: 'чужой ключ', files: [], timestamp: 7000 })
    seed('cached:signal-9', { body: 'чужой префикс', files: [], timestamp: 8000 })

    expect(listDrafts()).toEqual([])
  })

  it('sorts the drafts by savedAt descending', () => {
    seed('draft:signal-7', { body: 'старый', files: [], timestamp: 1000 })
    seed('draft:signal-8', { body: 'свежий', files: [], timestamp: 3000 })
    seed('draft:signal-9', { body: 'средний', files: [], timestamp: 2000 })

    expect(listDrafts().map((d) => d.threadId)).toEqual([8, 9, 7])
  })
})

describe('discardDraft', () => {
  beforeEach(() => localStorageMock.clear())

  it('removes only the requested key', () => {
    seed('draft:signal-7', { body: 'a', files: [], timestamp: 1 })
    seed('draft:signal-8', { body: 'b', files: [], timestamp: 2 })
    seed('other:1', 'keep me')

    discardDraft('draft:signal-7')

    expect(localStorageMock.getItem('draft:signal-7')).toBe(null)
    expect(localStorageMock.getItem('draft:signal-8')).not.toBe(null)
    expect(localStorageMock.getItem('other:1')).toBe('keep me')
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

import { discardDraft, listDrafts, useDraft } from '@/composables/useDraft'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      if (localStorageMock.failSetItem) {
        throw new Error('QuotaExceededError')
      }
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    /** test-only switch: simulate quota / security failures */
    failSetItem: false,
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

function seed(key: string, value: unknown) {
  localStorageMock.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
}

/** useDraft needs a component instance for its lifecycle hooks. */
function mountDraft(key: string) {
  let api: ReturnType<typeof useDraft> | null = null
  const Host = defineComponent({
    setup() {
      api = useDraft(key)
      return () => h('div')
    },
  })
  const wrapper = mount(Host)
  return { wrapper, api: api! }
}

function stored(key = 'draft:signal-7') {
  const raw = localStorageMock.getItem(key)
  return raw === null ? null : JSON.parse(raw)
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
        kind: 'signal',
        threadId: 7,
        body: '  незаконченный сигнал  ',
        filesCount: 0,
        savedAt: 1000,
      },
    ])
  })

  it('reads launch drafts with their board slug and buffered title', () => {
    seed('draft:launch-bauman', {
      title: '  ИУ7 снова сломало  ',
      body: 'После обновления',
      files: [],
      timestamp: 1000,
    })

    expect(listDrafts()).toEqual([
      {
        key: 'draft:launch-bauman',
        kind: 'launch',
        boardSlug: 'bauman',
        title: 'ИУ7 снова сломало',
        body: 'После обновления',
        filesCount: 0,
        savedAt: 1000,
      },
    ])
  })

  it('keeps a launch draft that has only a title', () => {
    seed('draft:launch-b', { title: 'ещё не написан', body: '', files: [], timestamp: 1000 })

    const [draft] = listDrafts()
    expect(draft.kind).toBe('launch')
    expect(draft.title).toBe('ещё не написан')
    expect(draft.body).toBe('')
  })

  it('reads a short board slug the way the composer wrote it', () => {
    // the panel must read at least as loosely as the bay writes
    seed('draft:launch-b', { title: 'тред', body: 'текст', files: [], timestamp: 1000 })

    expect(listDrafts()).toEqual([
      {
        key: 'draft:launch-b',
        kind: 'launch',
        boardSlug: 'b',
        title: 'тред',
        body: 'текст',
        filesCount: 0,
        savedAt: 1000,
      },
    ])
  })

  it('reads report drafts by post id — no thread id invented', () => {
    seed('draft:report-42', {
      title: 'spam',
      body: 'флуд ссылками',
      files: [],
      timestamp: 1000,
    })

    expect(listDrafts()).toEqual([
      {
        key: 'draft:report-42',
        kind: 'report',
        postId: 42,
        title: 'spam',
        body: 'флуд ссылками',
        filesCount: 0,
        savedAt: 1000,
      },
    ])
  })

  it('counts attachments and keeps a draft that has files but no text', () => {
    seed('draft:signal-8', { body: '   ', files: [{}, {}], timestamp: 2000 })

    const [draft] = listDrafts()
    expect(draft.kind).toBe('signal')
    expect(draft.threadId).toBe(8)
    expect(draft.filesCount).toBe(2)
    expect(draft.body).toBe('   ')
  })

  it('counts stored attachment metadata by name', () => {
    seed('draft:signal-8', {
      body: 'сигнал с вложениями',
      files: [
        { name: 'photo.png', size: 2048 },
        { name: 'notes.txt', size: 17 },
      ],
      timestamp: 2000,
    })

    const [draft] = listDrafts()
    expect(draft.filesCount).toBe(2)
    expect(draft.body).toBe('сигнал с вложениями')
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
    // launch/report husks and keys that are not slugs at all
    seed('draft:launch-', { title: 'нет раздела', body: '', files: [], timestamp: 9000 })
    seed('draft:launch-B', { title: 'заглавные', body: 'текст', files: [], timestamp: 9500 })
    seed('draft:report-x', { body: 'не пост', files: [], timestamp: 10000 })
    seed('draft:report-42', { body: '   ', title: '  ', files: [], timestamp: 11000 })

    expect(listDrafts()).toEqual([])
  })

  it('sorts the drafts by savedAt descending, whatever their kind', () => {
    seed('draft:signal-7', { body: 'старый', files: [], timestamp: 1000 })
    seed('draft:launch-b', { title: 'свежий', body: '', files: [], timestamp: 3000 })
    seed('draft:report-9', { body: 'средний', files: [], timestamp: 2000 })

    expect(listDrafts().map((d) => [d.kind, d.savedAt])).toEqual([
      ['launch', 3000],
      ['report', 2000],
      ['signal', 1000],
    ])
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

describe('useDraft', () => {
  beforeEach(() => {
    localStorageMock.clear()
    localStorageMock.failSetItem = false
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('debounces the write and reports writing → saved', () => {
    const { wrapper, api } = mountDraft('signal-7')

    api.saveDraft('незаконченный сигнал')
    expect(api.status.value).toBe('writing')
    expect(stored()).toBe(null)

    vi.advanceTimersByTime(499)
    expect(stored()).toBe(null)

    vi.advanceTimersByTime(1)
    expect(stored().body).toBe('незаконченный сигнал')
    expect(stored().files).toEqual([])
    expect(api.status.value).toBe('saved')
    expect(api.hasDraft.value).toBe(true)
    expect(api.savedAt.value).not.toBe(null)

    wrapper.unmount()
  })

  it('flushes the pending write on pagehide instead of losing it', () => {
    const { wrapper, api } = mountDraft('signal-7')
    api.saveDraft('текст, набранный за 300мс')

    // the debounce has not elapsed — the tab is closing right now
    vi.advanceTimersByTime(300)
    expect(stored()).toBe(null)

    window.dispatchEvent(new Event('pagehide'))

    expect(stored().body).toBe('текст, набранный за 300мс')
    expect(api.status.value).toBe('saved')

    // and it must not write twice when the timer finally fires
    vi.advanceTimersByTime(1000)
    expect(stored().body).toBe('текст, набранный за 300мс')

    wrapper.unmount()
  })

  it('flushes on visibilitychange while the tab is hidden', () => {
    const { wrapper, api } = mountDraft('signal-7')
    api.saveDraft('уходя в фон')

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(stored().body).toBe('уходя в фон')
    expect(api.status.value).toBe('saved')

    wrapper.unmount()
  })

  it('does not flush while the document is merely still visible', () => {
    const { wrapper, api } = mountDraft('signal-7')
    api.saveDraft('ещё печатаю')

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(stored()).toBe(null)
    expect(api.status.value).toBe('writing')

    wrapper.unmount()
  })

  it('flushes a pending write when the surface unmounts', () => {
    const { wrapper, api } = mountDraft('signal-7')
    api.saveDraft('ухожу со страницы')

    wrapper.unmount()

    expect(stored().body).toBe('ухожу со страницы')
  })

  it('detaches its listeners on unmount', () => {
    const { wrapper, api } = mountDraft('signal-7')
    api.saveDraft('раз')
    vi.advanceTimersByTime(500)
    wrapper.unmount()

    const spy = vi.spyOn(localStorageMock, 'setItem')
    window.dispatchEvent(new Event('pagehide'))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(spy).not.toHaveBeenCalled()
  })

  it('stores attachments as serializable metadata, not as File objects', () => {
    const file = new File(['hello'], 'photo.png', { type: 'image/png' })
    const { wrapper, api } = mountDraft('launch-b')

    api.saveDraft({ title: 'тред', body: 'тело', files: [file, { name: 't.txt', size: 17 }] })
    vi.advanceTimersByTime(500)

    expect(stored('draft:launch-b')).toEqual({
      title: 'тред',
      body: 'тело',
      files: [
        { name: 'photo.png', size: 5 },
        { name: 't.txt', size: 17 },
      ],
      timestamp: expect.any(Number),
    })
    expect(api.hasRestoredFiles.value).toBe(false)

    wrapper.unmount()
  })

  it('restores a buffered draft with metadata instead of files', () => {
    seed('draft:signal-7', {
      title: '',
      body: 'восстановленный сигнал',
      files: [{ name: 'photo.png', size: 2048 }],
      timestamp: 1234,
    })

    const { wrapper, api } = mountDraft('signal-7')

    expect(api.hasDraft.value).toBe(true)
    expect(api.status.value).toBe('saved')
    expect(api.savedAt.value).toBe(1234)
    expect(api.draft.value).toEqual({
      title: '',
      body: 'восстановленный сигнал',
      files: [{ name: 'photo.png', size: 2048 }],
      timestamp: 1234,
    })
    // honest signal: the text came back, the files did not
    expect(api.hasRestoredFiles.value).toBe(true)

    wrapper.unmount()
  })

  it('restores a legacy draft without attachments as plain text', () => {
    seed('draft:signal-7', { body: 'просто текст', files: [], timestamp: 55 })

    const { wrapper, api } = mountDraft('signal-7')

    expect(api.draft.value?.files).toEqual([])
    expect(api.hasRestoredFiles.value).toBe(false)

    wrapper.unmount()
  })

  it('reports a storage failure as an error status and never throws', () => {
    const { wrapper, api } = mountDraft('signal-7')
    localStorageMock.failSetItem = true

    api.saveDraft('слишком много черновиков')

    expect(api.status.value).toBe('writing')
    vi.advanceTimersByTime(500)

    expect(api.status.value).toBe('error')
    expect(stored()).toBe(null)

    wrapper.unmount()
  })

  it('keeps a flush failure as a status too', () => {
    const { wrapper, api } = mountDraft('signal-7')
    localStorageMock.failSetItem = true
    api.saveDraft('и тут квота')

    expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow()
    expect(api.status.value).toBe('error')

    wrapper.unmount()
  })

  it('recovers on the next save after a quota failure', () => {
    const { wrapper, api } = mountDraft('signal-7')
    localStorageMock.failSetItem = true
    api.saveDraft('первый')
    vi.advanceTimersByTime(500)
    expect(api.status.value).toBe('error')

    localStorageMock.failSetItem = false
    api.saveDraft('второй')
    vi.advanceTimersByTime(500)

    expect(api.status.value).toBe('saved')
    expect(stored().body).toBe('второй')

    wrapper.unmount()
  })

  it('clearDraft cancels a pending write and resets the restored-files flag', () => {
    seed('draft:signal-7', {
      body: 'старый',
      files: [{ name: 'a.png', size: 1 }],
      timestamp: 9,
    })
    const { wrapper, api } = mountDraft('signal-7')
    expect(api.hasRestoredFiles.value).toBe(true)

    api.saveDraft('новый текст, потом передумал')
    api.clearDraft()
    vi.advanceTimersByTime(1000)

    expect(stored()).toBe(null)
    expect(api.hasDraft.value).toBe(false)
    expect(api.status.value).toBe('idle')
    expect(api.hasRestoredFiles.value).toBe(false)

    wrapper.unmount()
  })

  it('restoreDraft hands back the draft and wipes the buffer', () => {
    seed('draft:signal-7', { body: 'вернуть мне', files: [], timestamp: 3 })
    const { wrapper, api } = mountDraft('signal-7')

    expect(api.restoreDraft()?.body).toBe('вернуть мне')
    expect(stored()).toBe(null)
    expect(api.hasDraft.value).toBe(false)

    wrapper.unmount()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  emitSceneEvent,
  focusStory,
  getArchiveStory,
  getBoardBySlug,
  highlightBoard,
  onSceneEvent,
  sceneState,
  selectStory,
  setArchiveStories,
  setSceneMode,
  setStoryCount,
  syncBoards,
  type ArchiveStoryRef,
  type BoardSummary,
  type SceneEvent,
} from '@/three/sceneState'

describe('sceneState', () => {
  beforeEach(() => {
    setSceneMode('home')
    syncBoards([])
    setStoryCount(0)
    highlightBoard(null)
    setArchiveStories([])
    focusStory(null)
    selectStory(null)
  })

  it('board mode stores its slug and clears thread id', () => {
    setSceneMode('board', { boardSlug: 'study' })
    expect(sceneState.mode).toBe('board')
    expect(sceneState.boardSlug).toBe('study')
    expect(sceneState.threadId).toBeNull()
  })

  it('leaving home/board clears the highlighted node', () => {
    highlightBoard('b')
    setSceneMode('platinum')
    expect(sceneState.highlightedBoard).toBeNull()
  })

  it('thread mode stores the thread id', () => {
    setSceneMode('thread', { threadId: 42 })
    expect(sceneState.threadId).toBe(42)
    expect(sceneState.boardSlug).toBeNull()
  })

  it('delivers one-shot events and unsubscribes cleanly', () => {
    const events: SceneEvent[] = []
    const off = onSceneEvent((ev) => events.push(ev))
    emitSceneEvent({ type: 'reply' })
    emitSceneEvent({ type: 'pulse', target: 'b' })
    off()
    emitSceneEvent({ type: 'reply' })
    expect(events).toEqual([
      { type: 'reply' },
      { type: 'pulse', target: 'b' },
    ])
  })

  it('delivers signal-console and report events', () => {
    const events: SceneEvent[] = []
    const off = onSceneEvent((ev) => events.push(ev))
    emitSceneEvent({ type: 'composer-focus' })
    emitSceneEvent({ type: 'composer-blur' })
    emitSceneEvent({ type: 'report-open' })
    emitSceneEvent({ type: 'report-submit' })
    emitSceneEvent({ type: 'thread-launch', target: 'study' })
    off()
    expect(events).toEqual([
      { type: 'composer-focus' },
      { type: 'composer-blur' },
      { type: 'report-open' },
      { type: 'report-submit' },
      { type: 'thread-launch', target: 'study' },
    ])
  })

  it('syncBoards copies the list', () => {
    const list: BoardSummary[] = [
      { slug: 'b', threadCount: 0, order: 0 },
      { slug: 'study', threadCount: 4, order: 1 },
    ]
    syncBoards(list)
    list.push({ slug: 'campus', threadCount: 0, order: 2 })
    expect(sceneState.boards).toEqual([
      { slug: 'b', threadCount: 0, order: 0 },
      { slug: 'study', threadCount: 4, order: 1 },
    ])
  })

  it('getBoardBySlug reads the synced board', () => {
    syncBoards([{ slug: 'study', threadCount: 4, order: 1 }])
    expect(getBoardBySlug('study')?.threadCount).toBe(4)
    expect(getBoardBySlug('campus')).toBeUndefined()
  })

  it('storyCount drives the archive', () => {
    setStoryCount(3)
    expect(sceneState.storyCount).toBe(3)
  })

  it('a throwing listener does not break others', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const spy = vi.fn()
    const offBad = onSceneEvent(() => {
      throw new Error('boom')
    })
    const offGood = onSceneEvent(spy)
    expect(() => emitSceneEvent({ type: 'reply' })).not.toThrow()
    expect(spy).toHaveBeenCalledWith({ type: 'reply' })
    offBad()
    offGood()
    errSpy.mockRestore()
  })

  it('starts with an empty archive', () => {
    expect(sceneState.archiveStories).toEqual([])
    expect(sceneState.focusedStory).toBeNull()
    expect(sceneState.selectedStory).toBeNull()
  })

  it('setArchiveStories copies the list and its items', () => {
    const refs: ArchiveStoryRef[] = [
      { id: 1, title: 'Первая', year: 1998, ringIndex: 0, sourceType: 'wave' },
      { id: 2, title: 'Вторая', year: null, ringIndex: 1, sourceType: null },
    ]
    setArchiveStories(refs)
    refs.push({
      id: 3,
      title: 'Третья',
      year: 2010,
      ringIndex: 2,
      sourceType: 'noise',
    })
    refs[0].title = 'Мутирована'
    expect(sceneState.archiveStories).toEqual([
      { id: 1, title: 'Первая', year: 1998, ringIndex: 0, sourceType: 'wave' },
      { id: 2, title: 'Вторая', year: null, ringIndex: 1, sourceType: null },
    ])
    expect(sceneState.archiveStories[0]).not.toBe(refs[0])
  })

  it('setArchiveStories drops focus and selection that left the set', () => {
    setArchiveStories([
      { id: 1, title: 'Первая', year: 1998, ringIndex: 0, sourceType: 'wave' },
      { id: 2, title: 'Вторая', year: null, ringIndex: 1, sourceType: null },
    ])
    focusStory(2)
    selectStory(2)
    setArchiveStories([
      { id: 1, title: 'Первая', year: 1998, ringIndex: 0, sourceType: 'wave' },
    ])
    expect(sceneState.focusedStory).toBeNull()
    expect(sceneState.selectedStory).toBeNull()
  })

  it('setArchiveStories keeps focus and selection that are still present', () => {
    setArchiveStories([
      { id: 1, title: 'Первая', year: 1998, ringIndex: 0, sourceType: 'wave' },
      { id: 2, title: 'Вторая', year: null, ringIndex: 1, sourceType: null },
    ])
    focusStory(2)
    selectStory(1)
    setArchiveStories([
      { id: 1, title: 'Первая', year: 1998, ringIndex: 0, sourceType: 'wave' },
      { id: 2, title: 'Вторая', year: null, ringIndex: 1, sourceType: null },
    ])
    expect(sceneState.focusedStory).toBe(2)
    expect(sceneState.selectedStory).toBe(1)
  })

  it('focusStory and selectStory drive the archive pointers', () => {
    focusStory(7)
    selectStory(9)
    expect(sceneState.focusedStory).toBe(7)
    expect(sceneState.selectedStory).toBe(9)
    focusStory(null)
    selectStory(null)
    expect(sceneState.focusedStory).toBeNull()
    expect(sceneState.selectedStory).toBeNull()
  })

  it('getArchiveStory reads the placed story by id', () => {
    setArchiveStories([
      { id: 4, title: 'Кольцо', year: 2004, ringIndex: 2, sourceType: 'drone' },
    ])
    expect(getArchiveStory(4)?.title).toBe('Кольцо')
    expect(getArchiveStory(5)).toBeUndefined()
  })

  it('an empty archive count clears the archive state', () => {
    setArchiveStories([
      { id: 1, title: 'Первая', year: 1998, ringIndex: 0, sourceType: 'wave' },
    ])
    focusStory(1)
    selectStory(1)
    setStoryCount(0)
    expect(sceneState.storyCount).toBe(0)
    expect(sceneState.archiveStories).toEqual([])
    expect(sceneState.focusedStory).toBeNull()
    expect(sceneState.selectedStory).toBeNull()
  })

  it('a non-zero story count keeps the archive state', () => {
    setArchiveStories([
      { id: 1, title: 'Первая', year: 1998, ringIndex: 0, sourceType: 'wave' },
    ])
    focusStory(1)
    setStoryCount(3)
    expect(sceneState.storyCount).toBe(3)
    expect(sceneState.archiveStories).toHaveLength(1)
    expect(sceneState.focusedStory).toBe(1)
  })

  it('delivers archive events and unsubscribes cleanly', () => {
    const events: SceneEvent[] = []
    const off = onSceneEvent((ev) => events.push(ev))
    emitSceneEvent({ type: 'archive-focus', target: 3 })
    emitSceneEvent({ type: 'archive-open', target: 3 })
    emitSceneEvent({ type: 'archive-clear' })
    off()
    emitSceneEvent({ type: 'archive-focus', target: null })
    expect(events).toEqual([
      { type: 'archive-focus', target: 3 },
      { type: 'archive-open', target: 3 },
      { type: 'archive-clear' },
    ])
  })
})

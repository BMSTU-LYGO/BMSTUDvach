import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  emitSceneEvent,
  highlightBoard,
  onSceneEvent,
  sceneState,
  setSceneMode,
  setStoryCount,
  syncBoards,
  type SceneEvent,
} from '@/three/sceneState'

describe('sceneState', () => {
  beforeEach(() => {
    setSceneMode('home')
    syncBoards([])
    setStoryCount(0)
    highlightBoard(null)
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

  it('syncBoards copies the list', () => {
    const list = ['b', 'study']
    syncBoards(list)
    list.push('campus')
    expect(sceneState.boards).toEqual(['b', 'study'])
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
})

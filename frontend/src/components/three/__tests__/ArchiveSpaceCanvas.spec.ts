import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import ArchiveSpaceCanvas from '../ArchiveSpaceCanvas.vue'
import {
  emitSceneEvent,
  onSceneEvent,
  sceneState,
  setArchiveStories,
  type ArchiveStoryRef,
  type SceneEvent,
} from '@/three/sceneState'

/**
 * Behavioural tests of the Archive Space canvas: the thin Vue wrapper over
 * `buildArchiveSpace`.
 *
 * The WebGL scene itself is mocked (`@/three/archive/space`) — the contract
 * of the canvas is what matters here: it wires the shared state into the
 * scene, follows the scene events and translates the pointer into the box
 * of the canvas.
 */

interface FakeController {
  scene: Record<string, never>
  camera: Record<string, never>
  setStories: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  travelToFocus: ReturnType<typeof vi.fn>
  releaseFocus: ReturnType<typeof vi.fn>
  setPointer: ReturnType<typeof vi.fn>
  pointerStoryId: ReturnType<typeof vi.fn>
  openStory: ReturnType<typeof vi.fn>
  orbitBy: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  build: null as ((ctx: unknown) => unknown) | null,
  active: null as { value: boolean } | null,
  controller: null as FakeController | null,
}))

vi.mock('@/composables/useThreeScene', async () => {
  const { ref } = await import('vue')
  return {
    useThreeScene: (_canvasRef: unknown, build: (ctx: unknown) => unknown) => {
      mocks.build = build
      const active = ref(true)
      mocks.active = active
      return { active, supported: ref(true) }
    },
  }
})

vi.mock('@/three/archive/space', () => ({
  buildArchiveSpace: vi.fn(() => mocks.controller),
}))

vi.mock('@/composables/useGsap', () => ({
  prefersReducedMotion: () => false,
}))

/** A story descriptor of the archive. */
function story(id: number): ArchiveStoryRef {
  return { id, title: `story ${id}`, year: 2024, ringIndex: 0, sourceType: 'generated' }
}

function createController(): FakeController {
  return {
    scene: {},
    camera: {},
    setStories: vi.fn(),
    update: vi.fn(),
    dispose: vi.fn(),
    focus: vi.fn(),
    travelToFocus: vi.fn(),
    releaseFocus: vi.fn(),
    setPointer: vi.fn(),
    pointerStoryId: vi.fn(() => null),
    openStory: vi.fn(() => null),
    orbitBy: vi.fn(),
  }
}

/** The fake `three` module — the scene builder is mocked, it is never used. */
const fakeThree = {} as unknown as typeof import('three')

/** The box of the canvas — the pointer is mapped into it. */
const BOX = {
  x: 100,
  y: 50,
  left: 100,
  top: 50,
  right: 500,
  bottom: 350,
  width: 400,
  height: 300,
  toJSON: () => ({}),
} as DOMRect

let wrapper: ReturnType<typeof mount> | null = null

function mountCanvas() {
  wrapper = mount(ArchiveSpaceCanvas, { attachTo: document.body })
  return wrapper
}

/** Run the build of the component with a fake context. */
function buildNow() {
  const build = mocks.build
  if (!build) throw new Error('the canvas did not hand its build over')
  return build({ three: fakeThree, quality: 'high' })
}

/** Collect the scene events of the test. */
function collectEvents() {
  const seen: SceneEvent[] = []
  const off = onSceneEvent((ev) => seen.push(ev))
  return { seen, off }
}

/** A pointer event — jsdom ships no PointerEvent, a MouseEvent carries the coordinates. */
function pointer(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true })
}

beforeEach(() => {
  mocks.controller = createController()
  mocks.build = null
  mocks.active = null
  sceneState.archiveStories = []
  sceneState.focusedStory = null
  sceneState.selectedStory = null
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(BOX)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('ArchiveSpaceCanvas', () => {
  describe('the canvas itself', () => {
    it('mounts a canvas the screen readers never see', () => {
      const view = mountCanvas()

      const canvas = view.find('canvas')
      expect(canvas.exists()).toBe(true)
      expect(canvas.attributes('aria-hidden')).toBe('true')
    })

    it('takes the pointer on the canvas alone, and lets the list through', () => {
      const view = mountCanvas()

      expect(view.find('.archive-canvas-wrap').attributes('style')).toBeUndefined()
      expect(view.find('canvas').classes()).toContain('archive-canvas')
    })

    it('falls back to a quiet layer when the WebGL context is not there', async () => {
      const view = mountCanvas()
      expect(view.find('.archive-fallback').exists()).toBe(false)

      mocks.active!.value = false
      await nextTick()

      expect(view.find('.archive-fallback').exists()).toBe(true)
      expect(view.find('.archive-fallback').attributes('aria-hidden')).toBe('true')
      expect(view.find('canvas').classes()).toContain('hidden')
    })
  })

  describe('the scene', () => {
    it('builds the archive and feeds it the stories of the state', () => {
      setArchiveStories([story(3), story(9)])
      const view = mountCanvas()

      buildNow()

      expect(mocks.controller!.setStories).toHaveBeenCalledWith(
        sceneState.archiveStories,
      )
      expect(view.exists()).toBe(true)
    })

    it('follows the stories of the state by their id signature', async () => {
      mountCanvas()
      buildNow()
      mocks.controller!.setStories.mockClear()

      setArchiveStories([story(3)])
      await nextTick()

      expect(mocks.controller!.setStories).toHaveBeenCalledWith(
        sceneState.archiveStories,
      )
    })

    it('does not rebuild the archive when the stories are the same ones', async () => {
      setArchiveStories([story(3)])
      mountCanvas()
      buildNow()
      mocks.controller!.setStories.mockClear()

      setArchiveStories([story(3)])
      await nextTick()

      expect(mocks.controller!.setStories).not.toHaveBeenCalled()
    })

    it('advances the scene with the state of the archive', () => {
      sceneState.focusedStory = 5
      sceneState.selectedStory = 6
      mountCanvas()
      const built = buildNow() as { frame: (dt: number) => void }

      built.frame(0.016)

      expect(mocks.controller!.update).toHaveBeenCalledWith(0.016, {
        stories: sceneState.archiveStories,
        focusedStory: 5,
        selectedStory: 6,
        reducedMotion: false,
      })
    })
  })

  describe('the scene events', () => {
    it('focuses the plate the outside world asks for', () => {
      mountCanvas()
      buildNow()

      emitSceneEvent({ type: 'archive-focus', target: 7 })

      expect(mocks.controller!.focus).toHaveBeenCalledWith(7)
      expect(mocks.controller!.travelToFocus).not.toHaveBeenCalled()
    })

    it('flies to the plate when a story is opened', () => {
      mountCanvas()
      buildNow()

      emitSceneEvent({ type: 'archive-open', target: 7 })

      expect(mocks.controller!.focus).toHaveBeenCalledWith(7)
      expect(mocks.controller!.travelToFocus).toHaveBeenCalled()
    })

    it('drops the focus and returns to the orbit when the archive is cleared', () => {
      mountCanvas()
      buildNow()

      emitSceneEvent({ type: 'archive-clear' })

      expect(mocks.controller!.focus).toHaveBeenCalledWith(null)
      expect(mocks.controller!.releaseFocus).toHaveBeenCalled()
    })

    it('follows the focus of the state without moving the camera', async () => {
      mountCanvas()
      buildNow()
      mocks.controller!.focus.mockClear()

      sceneState.focusedStory = 11
      await nextTick()

      expect(mocks.controller!.focus).toHaveBeenCalledWith(11)
      expect(mocks.controller!.travelToFocus).not.toHaveBeenCalled()
    })
  })

  describe('the pointer', () => {
    it('maps the pointer into the box of the canvas', () => {
      mountCanvas()
      buildNow()

      window.dispatchEvent(pointer('pointermove', 400, 125))

      expect(mocks.controller!.setPointer).toHaveBeenCalledWith(0.5, 0.5)
    })

    it('focuses the plate under the pointer and says so', () => {
      mountCanvas()
      buildNow()
      mocks.controller!.pointerStoryId.mockReturnValue(42)
      const { seen, off } = collectEvents()

      window.dispatchEvent(pointer('pointermove', 300, 125))

      expect(sceneState.focusedStory).toBe(42)
      expect(seen).toContainEqual({ type: 'archive-focus', target: 42 })
      off()
    })

    it('leaves the focus to the row of the list', () => {
      mountCanvas()
      buildNow()
      mocks.controller!.pointerStoryId.mockReturnValue(42)
      const row = document.createElement('div')
      row.setAttribute('data-testid', 'fragment-row')
      document.body.appendChild(row)
      const { seen, off } = collectEvents()

      row.dispatchEvent(pointer('pointermove', 300, 125))

      expect(sceneState.focusedStory).toBeNull()
      expect(seen).toHaveLength(0)
      off()
    })

    it('opens the plate under the pointer on a click', () => {
      const view = mountCanvas()
      buildNow()
      mocks.controller!.pointerStoryId.mockReturnValue(42)
      const { seen, off } = collectEvents()

      view.find('canvas').element.dispatchEvent(pointer('click', 300, 125))

      expect(sceneState.selectedStory).toBe(42)
      expect(mocks.controller!.travelToFocus).toHaveBeenCalled()
      expect(seen).toContainEqual({ type: 'archive-open', target: 42 })
      off()
    })

    it('opens nothing when the pointer hits no plate', () => {
      const view = mountCanvas()
      buildNow()
      const { seen, off } = collectEvents()

      view.find('canvas').element.dispatchEvent(pointer('click', 300, 125))

      expect(sceneState.selectedStory).toBeNull()
      expect(seen).toHaveLength(0)
      off()
    })

    it('steers the camera on a drag and opens nothing', () => {
      const view = mountCanvas()
      buildNow()
      mocks.controller!.pointerStoryId.mockReturnValue(42)
      const { seen, off } = collectEvents()
      const canvas = view.find('canvas').element

      canvas.dispatchEvent(pointer('pointerdown', 100, 100))
      window.dispatchEvent(pointer('pointermove', 160, 100))
      window.dispatchEvent(pointer('pointerup', 160, 100))
      canvas.dispatchEvent(pointer('click', 160, 100))

      expect(mocks.controller!.orbitBy).toHaveBeenCalledWith(60, 0)
      expect(sceneState.selectedStory).toBeNull()
      expect(seen).toHaveLength(0)
      off()
    })

    it('opens the plate again after the drag is over', () => {
      const view = mountCanvas()
      buildNow()
      mocks.controller!.pointerStoryId.mockReturnValue(42)
      const canvas = view.find('canvas').element

      canvas.dispatchEvent(pointer('pointerdown', 100, 100))
      window.dispatchEvent(pointer('pointermove', 160, 100))
      window.dispatchEvent(pointer('pointerup', 160, 100))
      canvas.dispatchEvent(pointer('click', 160, 100))
      expect(sceneState.selectedStory).toBeNull()

      canvas.dispatchEvent(pointer('pointerdown', 160, 100))
      window.dispatchEvent(pointer('pointerup', 160, 100))
      canvas.dispatchEvent(pointer('click', 160, 100))

      expect(sceneState.selectedStory).toBe(42)
    })

    it('never touches the focus while the pointer drags', () => {
      const view = mountCanvas()
      buildNow()
      mocks.controller!.pointerStoryId.mockReturnValue(42)
      const { seen, off } = collectEvents()
      const canvas = view.find('canvas').element

      canvas.dispatchEvent(pointer('pointerdown', 100, 100))
      window.dispatchEvent(pointer('pointermove', 160, 100))

      expect(sceneState.focusedStory).toBeNull()
      expect(seen).toHaveLength(0)
      off()
    })
  })

  describe('the teardown', () => {
    it('gives the scene back when the canvas goes away', () => {
      const view = mountCanvas()
      buildNow()

      view.unmount()
      wrapper = null

      expect(mocks.controller!.dispose).toHaveBeenCalled()
    })

    it('leaves the scene events behind', () => {
      const view = mountCanvas()
      buildNow()
      view.unmount()
      wrapper = null
      mocks.controller!.focus.mockClear()

      emitSceneEvent({ type: 'archive-open', target: 7 })

      expect(mocks.controller!.focus).not.toHaveBeenCalled()
      expect(mocks.controller!.travelToFocus).not.toHaveBeenCalled()
    })

    it('takes the pointer listeners off the window', () => {
      const view = mountCanvas()
      buildNow()
      view.unmount()
      wrapper = null
      mocks.controller!.setPointer.mockClear()

      window.dispatchEvent(pointer('pointermove', 300, 125))

      expect(mocks.controller!.setPointer).not.toHaveBeenCalled()
    })
  })
})

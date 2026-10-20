import { beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  Mesh,
  Object3D,
  PerspectiveCamera,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three'

import { buildArchiveSpace, type ArchiveSpaceSnapshot } from '@/three/archive/space'
import type { ArchiveStoryRef } from '@/three/sceneState'

/**
 * Behavioural tests of the archive space: the graph it builds, the stories
 * it places, the empty mode and the disposal of everything it owns.
 *
 * The real `three` module is enough — the scene is pure data, no renderer
 * and no WebGL context are involved.
 */

let three: typeof import('three')

beforeAll(async () => {
  // jsdom ships no 2d canvas — the archive never asks for one, but the
  // stub keeps the module importable in a DOM-less environment.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  three = await import('three')
})

const FPS = 60

function story(id: number, year: number | null = 2024): ArchiveStoryRef {
  return {
    id,
    title: `story ${id}`,
    year,
    ringIndex: 0,
    sourceType: 'generated',
  }
}

function snap(overrides: Partial<ArchiveSpaceSnapshot> = {}): ArchiveSpaceSnapshot {
  return {
    stories: [],
    focusedStory: null,
    selectedStory: null,
    reducedMotion: false,
    ...overrides,
  }
}

/** Every plate of the archive, in scene order. */
function plates(root: Object3D): Object3D[] {
  const found: Object3D[] = []
  root.traverse((child) => {
    if (child.name.startsWith('archive-fragment-')) found.push(child)
  })
  return found
}

/** Every orbit of the archive, in scene order. */
function orbits(root: Object3D): Object3D[] {
  const found: Object3D[] = []
  root.traverse((child) => {
    if (child.name.startsWith('archive-ring-')) found.push(child)
  })
  return found
}

/** The world position of an object of the archive. */
function worldOf(object: Object3D): Vector3 {
  const position = new three.Vector3()
  object.getWorldPosition(position)
  return position
}

/** The screen position of an object, in NDC. */
function ndcOf(camera: PerspectiveCamera, object: Object3D): { x: number; y: number } {
  const position = worldOf(object)
  camera.updateMatrixWorld()
  position.project(camera)
  return { x: position.x, y: position.y }
}

/** The plate of a story, as it sits in the scene. */
function plateOf(root: Object3D, id: number): Object3D {
  const plate = plates(root).find(
    (candidate) => candidate.name === `archive-fragment-${id}`,
  )
  if (!plate) throw new Error(`plate ${id} is missing`)
  return plate
}

describe('archive space: the graph of the scene', () => {
  it('builds orbits, a vault and a dust cloud', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      expect(orbits(space.scene).length).toBeGreaterThan(0)
      expect(space.scene.getObjectByName('vault')).toBeDefined()
      expect(space.scene.getObjectByName('archive-dust')).toBeDefined()
    } finally {
      space.dispose()
    }
  })

  it('gives the dust a position and a seed attribute of the same length', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      const dust = space.scene.getObjectByName('archive-dust') as Points
      const position = dust.geometry.getAttribute('position')
      const seed = dust.geometry.getAttribute('aSeed')
      expect(position).toBeDefined()
      expect(seed).toBeDefined()
      expect(seed.count).toBe(position.count)
      expect(seed.count).toBeGreaterThan(0)
    } finally {
      space.dispose()
    }
  })

  it('keeps the camera on a static rig looking at the core', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      expect(space.camera.type).toBe('PerspectiveCamera')
      expect(space.camera.position.x).toBeCloseTo(0)
      expect(space.camera.position.y).toBeCloseTo(2.2)
      expect(space.camera.position.z).toBeCloseTo(12.5)
    } finally {
      space.dispose()
    }
  })
})

describe('archive space: stories', () => {
  it('places one plate per story, tagged with its id', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(11), story(12), story(13)])
      const found = plates(space.scene)
      expect(found.length).toBe(3)
      expect(found.map((plate) => plate.name).sort()).toEqual([
        'archive-fragment-11',
        'archive-fragment-12',
        'archive-fragment-13',
      ])
      for (const plate of found) {
        expect(typeof plate.userData.storyId).toBe('number')
      }
      const ids = found.map((plate) => plate.userData.storyId).sort()
      expect(ids).toEqual([11, 12, 13])
    } finally {
      space.dispose()
    }
  })

  it('survives thirty frames of animation', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1), story(2, 2023)])
      expect(() => {
        for (let i = 0; i < 30; i++) space.update(1 / FPS, snap())
      }).not.toThrow()
    } finally {
      space.dispose()
    }
  })

  it('reuses one geometry and one material for every plate', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1), story(2), story(3)])
      const found = plates(space.scene) as Mesh[]
      expect(found.length).toBe(3)
      expect(found[0].geometry).toBe(found[1].geometry)
      expect(found[1].geometry).toBe(found[2].geometry)
      expect(found[0].material).toBe(found[1].material)
    } finally {
      space.dispose()
    }
  })

  it('rebuilds the plates instead of piling them up', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1), story(2), story(3)])
      space.setStories([story(4)])
      const found = plates(space.scene)
      expect(found.length).toBe(1)
      expect(found[0].name).toBe('archive-fragment-4')
    } finally {
      space.dispose()
    }
  })

  it('places the same stories at the same positions every time', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      const stories = [story(21, 2021), story(22, 2022), story(23, null)]
      space.setStories(stories)
      const first = plates(space.scene).map((plate) => plate.position.toArray())
      space.setStories(stories)
      const second = plates(space.scene).map((plate) => plate.position.toArray())
      expect(second).toEqual(first)
    } finally {
      space.dispose()
    }
  })
})

describe('archive space: the empty archive', () => {
  it('keeps bare orbits and lights the halo', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([])
      expect(orbits(space.scene).length).toBeGreaterThan(0)
      expect(plates(space.scene).length).toBe(0)

      const halo = space.scene.getObjectByName('archive-halo') as Mesh
      const material = halo.material as ShaderMaterial
      expect(material.uniforms.uDim.value).toBeGreaterThan(0.5)
    } finally {
      space.dispose()
    }
  })

  it('puts the halo out once stories arrive', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      const halo = space.scene.getObjectByName('archive-halo') as Mesh
      const material = halo.material as ShaderMaterial
      expect(material.uniforms.uDim.value).toBeLessThan(0.5)
    } finally {
      space.dispose()
    }
  })

  it('updates the empty archive without a story', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([])
      expect(() => {
        for (let i = 0; i < 10; i++) space.update(1 / FPS, snap())
      }).not.toThrow()
    } finally {
      space.dispose()
    }
  })
})

describe('archive space: disposal', () => {
  it('gives every geometry and material back', () => {
    const geometrySpy = vi.spyOn(three.BufferGeometry.prototype, 'dispose')
    const materialSpy = vi.spyOn(three.Material.prototype, 'dispose')
    try {
      const space = buildArchiveSpace(three, 'low')
      space.setStories([story(1), story(2)])
      geometrySpy.mockClear()
      materialSpy.mockClear()

      space.dispose()

      expect(geometrySpy).toHaveBeenCalled()
      expect(materialSpy).toHaveBeenCalled()
    } finally {
      geometrySpy.mockRestore()
      materialSpy.mockRestore()
    }
  })

  it('is idempotent and stays safe after the disposal', () => {
    const space = buildArchiveSpace(three, 'low')
    space.setStories([story(1)])
    space.dispose()
    expect(() => space.dispose()).not.toThrow()
    expect(() => space.update(1 / FPS, snap())).not.toThrow()
  })

  it('takes the world out of the scene', () => {
    const space = buildArchiveSpace(three, 'low')
    const world = space.scene.getObjectByName('archive-space')
    expect(world).toBeDefined()
    space.dispose()
    expect(space.scene.getObjectByName('archive-space')).toBeUndefined()
  })
})

describe('archive space: the camera rig', () => {
  it('flies to the focused plate and ends up next to it', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1), story(2)])
      for (let i = 0; i < 10; i++) space.update(1 / FPS, snap())
      const plate = plateOf(space.scene, 1)
      const before = space.camera.position.distanceTo(worldOf(plate))

      space.focus(1)
      space.travelToFocus()
      for (let i = 0; i < 40; i++) space.update(1 / FPS, snap())

      const after = space.camera.position.distanceTo(worldOf(plate))
      expect(after).toBeLessThan(before)
      expect(after).toBeLessThan(4)
    } finally {
      space.dispose()
    }
  })

  it('lands the travel in a single frame under reduced motion', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      space.update(1 / FPS, snap({ reducedMotion: true }))
      const plate = plateOf(space.scene, 1)

      space.focus(1)
      space.travelToFocus()
      space.update(1 / FPS, snap({ reducedMotion: true }))

      expect(space.camera.position.distanceTo(worldOf(plate))).toBeLessThan(4)
    } finally {
      space.dispose()
    }
  })

  it('returns to the idle orbit when the focus is released', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      for (let i = 0; i < 10; i++) space.update(1 / FPS, snap())

      space.focus(1)
      space.travelToFocus()
      for (let i = 0; i < 40; i++) space.update(1 / FPS, snap())

      space.releaseFocus()
      for (let i = 0; i < 60; i++) space.update(1 / FPS, snap())

      expect(Math.abs(space.camera.position.z - 12.5)).toBeLessThan(0.6)
    } finally {
      space.dispose()
    }
  })

  it('drifts the azimuth by hand', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      space.update(1 / FPS, snap())
      const before = Math.atan2(space.camera.position.z, space.camera.position.x)

      space.orbitBy(100, 0)
      space.update(1 / FPS, snap())

      const after = Math.atan2(space.camera.position.z, space.camera.position.x)
      expect(Math.abs(after - before)).toBeGreaterThan(0.2)
    } finally {
      space.dispose()
    }
  })

  it('ignores the drag while the camera travels', () => {
    const plain = buildArchiveSpace(three, 'low')
    const dragged = buildArchiveSpace(three, 'low')
    try {
      for (const space of [plain, dragged]) {
        space.setStories([story(1)])
        space.focus(1)
        space.travelToFocus()
      }
      dragged.orbitBy(100, 0)
      for (let i = 0; i < 60; i++) {
        plain.update(1 / FPS, snap())
        dragged.update(1 / FPS, snap())
      }
      expect(dragged.camera.position.toArray()).toEqual(plain.camera.position.toArray())
    } finally {
      plain.dispose()
      dragged.dispose()
    }
  })

  it('opens a story and returns the two ends of the travel', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1), story(2)])
      space.update(1 / FPS, snap())

      expect(space.openStory(999)).toBeNull()

      const opened = space.openStory(1)
      expect(opened).not.toBeNull()
      expect(opened?.id).toBe(1)
      for (const value of [
        opened?.from.x,
        opened?.from.y,
        opened?.from.z,
        opened?.to.x,
        opened?.to.y,
        opened?.to.z,
      ]) {
        expect(Number.isFinite(value)).toBe(true)
      }
      expect(opened?.from.z).toBeCloseTo(12.5, 3)
    } finally {
      space.dispose()
    }
  })

  it('does not move the camera when only the focus changes', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1), story(2)])
      for (let i = 0; i < 5; i++) space.update(1 / FPS, snap())
      const before = space.camera.position.toArray()

      space.focus(1)
      space.update(1 / FPS, snap())

      const after = space.camera.position.toArray()
      // The idle orbit keeps drifting, but the focus did not pull the
      // camera anywhere.
      expect(Math.abs(after[0] - before[0])).toBeLessThan(0.2)
      expect(Math.abs(after[1] - before[1])).toBeLessThan(0.2)
      expect(Math.abs(after[2] - before[2])).toBeLessThan(0.2)
    } finally {
      space.dispose()
    }
  })

  it('flies back to the idle orbit when the focused plate disappears', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      space.focus(1)
      space.travelToFocus()
      for (let i = 0; i < 40; i++) space.update(1 / FPS, snap())

      // The story set changed — the plate the camera held is gone.
      space.setStories([story(2)])
      for (let i = 0; i < 60; i++) space.update(1 / FPS, snap())

      expect(Math.abs(space.camera.position.z - 12.5)).toBeLessThan(0.6)
    } finally {
      space.dispose()
    }
  })

  it('follows the focus of the outside world without moving the camera', () => {
    const synced = buildArchiveSpace(three, 'low')
    const plain = buildArchiveSpace(three, 'low')
    try {
      for (const space of [synced, plain]) {
        space.setStories([story(1)])
        for (let i = 0; i < 5; i++) space.update(1 / FPS, snap())
      }
      synced.update(1 / FPS, snap({ focusedStory: 1 }))
      plain.update(1 / FPS, snap())

      // The focus alone changes nothing about the camera.
      expect(synced.camera.position.toArray()).toEqual(plain.camera.position.toArray())
      expect(Math.abs(synced.camera.position.z - 12.5)).toBeLessThan(0.6)

      // ...but the archive knows what to fly to now.
      const plate = plateOf(synced.scene, 1)
      synced.travelToFocus()
      for (let i = 0; i < 40; i++) synced.update(1 / FPS, snap({ focusedStory: 1 }))
      expect(synced.camera.position.distanceTo(worldOf(plate))).toBeLessThan(4)
    } finally {
      synced.dispose()
      plain.dispose()
    }
  })
})

describe('archive space: the pointer', () => {
  it('finds the plate under the pointer and loses it in the empty space', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      space.update(1 / FPS, snap())
      const plate = plateOf(space.scene, 1)
      const ndc = ndcOf(space.camera, plate)

      space.setPointer(ndc.x, ndc.y)
      for (let i = 0; i < 4; i++) space.update(1 / FPS, snap())
      expect(space.pointerStoryId()).toBe(1)

      space.setPointer(-ndc.x, -ndc.y)
      for (let i = 0; i < 4; i++) space.update(1 / FPS, snap())
      expect(space.pointerStoryId()).toBeNull()
    } finally {
      space.dispose()
    }
  })

  it('reports nothing while the pointer never moved', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      for (let i = 0; i < 4; i++) space.update(1 / FPS, snap())
      expect(space.pointerStoryId()).toBeNull()
    } finally {
      space.dispose()
    }
  })
})

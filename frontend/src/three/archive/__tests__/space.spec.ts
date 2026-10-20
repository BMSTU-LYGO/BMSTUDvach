import { beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  BufferAttribute,
  LineSegments,
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

/** Every object of the archive, in scene order. */
function countObjects(root: Object3D): number {
  let count = 0
  root.traverse(() => {
    count += 1
  })
  return count
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

describe('archive space: the depth of the dust', () => {
  it('keeps the dust out of an empty archive and brings it back', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      const dust = space.scene.getObjectByName('archive-dust') as Points
      const material = dust.material as ShaderMaterial

      space.setStories([])
      for (let i = 0; i < 120; i++) space.update(1 / FPS, snap())
      // An archive without stories is a lit void: it keeps no motes.
      expect(material.uniforms.uDust.value).toBeLessThan(0.05)

      space.setStories([story(1)])
      for (let i = 0; i < 120; i++) space.update(1 / FPS, snap())
      expect(material.uniforms.uDust.value).toBeGreaterThan(0.9)
    } finally {
      space.dispose()
    }
  })

  it('never rebuilds the cloud in the frame', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      const dust = space.scene.getObjectByName('archive-dust') as Points
      const position = dust.geometry.getAttribute('position') as BufferAttribute
      const version = position.version

      for (let i = 0; i < 30; i++) space.update(1 / FPS, snap())

      // The motes live in the shader: the buffer of the cloud is written
      // once and never touched again.
      expect(position.version).toBe(version)
    } finally {
      space.dispose()
    }
  })

  it('drifts an empty archive slower than a full one', () => {
    const empty = buildArchiveSpace(three, 'low')
    const full = buildArchiveSpace(three, 'low')
    try {
      full.setStories([story(1)])
      for (let i = 0; i < 5; i++) {
        empty.update(1 / FPS, snap())
        full.update(1 / FPS, snap())
      }
      const beforeEmpty = Math.atan2(empty.camera.position.z, empty.camera.position.x)
      const beforeFull = Math.atan2(full.camera.position.z, full.camera.position.x)

      for (let i = 0; i < 30; i++) {
        empty.update(1 / FPS, snap())
        full.update(1 / FPS, snap())
      }

      const driftEmpty = Math.abs(
        Math.atan2(empty.camera.position.z, empty.camera.position.x) - beforeEmpty,
      )
      const driftFull = Math.abs(
        Math.atan2(full.camera.position.z, full.camera.position.x) - beforeFull,
      )
      expect(driftEmpty).toBeGreaterThan(0)
      expect(driftEmpty).toBeLessThan(driftFull)
    } finally {
      empty.dispose()
      full.dispose()
    }
  })

  it('keeps fewer motes on the low tier', () => {
    const high = buildArchiveSpace(three, 'high')
    const low = buildArchiveSpace(three, 'low')
    try {
      const highDust = high.scene.getObjectByName('archive-dust') as Points
      const lowDust = low.scene.getObjectByName('archive-dust') as Points
      expect(lowDust.geometry.getAttribute('position').count).toBeLessThan(
        highDust.geometry.getAttribute('position').count,
      )
      // The cheap tier keeps its motes, it does not drop the cloud.
      expect(lowDust.geometry.getAttribute('position').count).toBeGreaterThan(0)
    } finally {
      high.dispose()
      low.dispose()
    }
  })
})

describe('archive space: the single accent of the archive', () => {
  it('points the accent at the focused plate', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1), story(2)])
      space.update(1 / FPS, snap({ focusedStory: 1 }))
      const plate = plateOf(space.scene, 1)
      const material = (plates(space.scene)[0] as Mesh).material as ShaderMaterial
      const point = material.uniforms.uFocusPoint.value as Vector3

      // The point of the gaze is the plate itself — only that one answers.
      expect(point.distanceTo(worldOf(plate))).toBeLessThan(0.01)
    } finally {
      space.dispose()
    }
  })

  it('takes the gaze away when the focus is gone', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1), story(2)])
      space.update(1 / FPS, snap({ focusedStory: 1 }))
      const material = (plates(space.scene)[0] as Mesh).material as ShaderMaterial
      const point = material.uniforms.uFocusPoint.value as Vector3
      expect(point.length()).toBeGreaterThan(1)

      space.update(1 / FPS, snap())
      // Without a focus the gaze falls back to the core, where no plate
      // can reach it.
      expect(point.length()).toBeLessThan(0.01)
      expect(material.uniforms.uFocus.value).toBe(0)
    } finally {
      space.dispose()
    }
  })

  it('freezes the clock under reduced motion', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      const dust = space.scene.getObjectByName('archive-dust') as Points
      const material = dust.material as ShaderMaterial

      space.update(1 / FPS, snap({ reducedMotion: true }))
      const first = material.uniforms.uTime.value
      space.update(1 / FPS, snap({ reducedMotion: true }))

      // The archive keeps its last frame instead of breathing.
      expect(material.uniforms.uTime.value).toBe(first)

      space.update(1 / FPS, snap())
      expect(material.uniforms.uTime.value).toBeGreaterThan(first)
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

  it('gives every resource back exactly once', () => {
    const geometrySpy = vi.spyOn(three.BufferGeometry.prototype, 'dispose')
    const materialSpy = vi.spyOn(three.Material.prototype, 'dispose')
    try {
      const space = buildArchiveSpace(three, 'low')
      space.setStories([story(1), story(2)])
      geometrySpy.mockClear()
      materialSpy.mockClear()

      space.dispose()

      // Seven of each: the core, the halo, the dust, the plate and the
      // three duty orbits an empty archive keeps alive.
      expect(geometrySpy).toHaveBeenCalledTimes(7)
      expect(materialSpy).toHaveBeenCalledTimes(7)

      // A second disposal gives nothing back a second time.
      space.dispose()
      expect(geometrySpy).toHaveBeenCalledTimes(7)
      expect(materialSpy).toHaveBeenCalledTimes(7)
    } finally {
      geometrySpy.mockRestore()
      materialSpy.mockRestore()
    }
  })

  it('gives nothing back when the story set changes', () => {
    const geometrySpy = vi.spyOn(three.BufferGeometry.prototype, 'dispose')
    const materialSpy = vi.spyOn(three.Material.prototype, 'dispose')
    try {
      const space = buildArchiveSpace(three, 'low')
      geometrySpy.mockClear()
      materialSpy.mockClear()

      // A rebuild reuses the orbits of the cache and the plates of the
      // pool — it must not throw a resource away.
      space.setStories([story(1)])
      space.setStories([story(2), story(3)])

      expect(geometrySpy).not.toHaveBeenCalled()
      expect(materialSpy).not.toHaveBeenCalled()
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

describe('archive space: the budget of the scene', () => {
  it('keeps a full archive inside its object budget', () => {
    const space = buildArchiveSpace(three, 'high')
    try {
      space.setStories(Array.from({ length: 60 }, (_, i) => story(i + 1)))
      expect(plates(space.scene).length).toBe(60)
      expect(orbits(space.scene).length).toBe(1)
      // The scene, the world, the core, the halo, the dust, one orbit and
      // the sixty plates.
      expect(countObjects(space.scene)).toBe(66)
    } finally {
      space.dispose()
    }
  })

  it('caps the plates at the budget of the archive', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories(Array.from({ length: 120 }, (_, i) => story(i + 1)))
      expect(plates(space.scene).length).toBe(60)
    } finally {
      space.dispose()
    }
  })

  it('keeps the scene graph stable over a hundred frames', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1), story(2), story(3)])
      const before = countObjects(space.scene)
      for (let i = 0; i < 100; i++) space.update(1 / FPS, snap())
      expect(countObjects(space.scene)).toBe(before)
    } finally {
      space.dispose()
    }
  })

  it('reuses the geometry and the material of an orbit across rebuilds', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      const ring = orbits(space.scene)[0] as LineSegments
      const geometry = ring.geometry
      const material = ring.material

      space.setStories([story(2)])

      const again = orbits(space.scene)[0] as LineSegments
      expect(again.geometry).toBe(geometry)
      expect(again.material).toBe(material)
    } finally {
      space.dispose()
    }
  })

  it('reuses the plate meshes across rebuilds', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1), story(2)])
      const first = plates(space.scene)
      space.setStories([story(3), story(4)])
      const second = plates(space.scene)
      expect(second[0]).toBe(first[0])
      expect(second[1]).toBe(first[1])
      expect(second[0].name).toBe('archive-fragment-3')
      expect(second[0].userData.storyId).toBe(3)
    } finally {
      space.dispose()
    }
  })

  it('keeps the composition of the low tier and cuts the detail', () => {
    const high = buildArchiveSpace(three, 'high')
    const low = buildArchiveSpace(three, 'low')
    try {
      for (const space of [high, low]) {
        space.setStories([story(1), story(2, 2023), story(3, 2022)])
      }

      // The same archive on both tiers: the same plates, the same orbits.
      expect(plates(low.scene).length).toBe(plates(high.scene).length)
      expect(orbits(low.scene).length).toBe(orbits(high.scene).length)

      // The orbits of the low tier are coarser...
      const highRing = orbits(high.scene)[0] as LineSegments
      const lowRing = orbits(low.scene)[0] as LineSegments
      expect(lowRing.geometry.getAttribute('position').count).toBeLessThan(
        highRing.geometry.getAttribute('position').count,
      )

      // ...and the dust of the low tier is sparser.
      const highDust = high.scene.getObjectByName('archive-dust') as Points
      const lowDust = low.scene.getObjectByName('archive-dust') as Points
      expect(lowDust.geometry.getAttribute('position').count).toBeLessThan(
        highDust.geometry.getAttribute('position').count,
      )
    } finally {
      high.dispose()
      low.dispose()
    }
  })

  it('keeps the plates of both tiers on the same places', () => {
    const high = buildArchiveSpace(three, 'high')
    const low = buildArchiveSpace(three, 'low')
    try {
      const stories = [story(1, 2021), story(2, 2022), story(3, null)]
      high.setStories(stories)
      low.setStories(stories)
      expect(plates(low.scene).map((plate) => plate.position.toArray())).toEqual(
        plates(high.scene).map((plate) => plate.position.toArray()),
      )
    } finally {
      high.dispose()
      low.dispose()
    }
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

describe('archive space: the life of the scene', () => {
  it('runs from the build to the disposal and back', () => {
    const space = buildArchiveSpace(three, 'low')
    space.setStories([story(1), story(2)])
    expect(() => space.update(1 / FPS, snap())).not.toThrow()

    space.dispose()

    // A second disposal is a no-op, and the scene is empty.
    expect(() => space.dispose()).not.toThrow()
    expect(() => space.update(1 / FPS, snap())).not.toThrow()
    expect(space.scene.getObjectByName('archive-space')).toBeUndefined()
    expect(countObjects(space.scene)).toBe(1)
  })

  it('starts in the empty mode, with the halo lit', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      // The archive is born empty — it never waits for the first story set.
      expect(plates(space.scene)).toHaveLength(0)
      const halo = space.scene.getObjectByName('archive-halo') as Mesh
      const material = halo.material as ShaderMaterial
      expect(material.uniforms.uDim.value).toBeGreaterThan(0.5)
    } finally {
      space.dispose()
    }
  })

  it('fades the archive in with the presence', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      const plate = plates(space.scene)[0] as Mesh
      const material = plate.material as ShaderMaterial

      space.update(1 / FPS, snap())
      const first = material.uniforms.uDim.value
      expect(first).toBeGreaterThan(0)
      expect(first).toBeLessThan(1)

      for (let i = 0; i < 120; i++) space.update(1 / FPS, snap())
      expect(material.uniforms.uDim.value).toBeGreaterThan(0.95)
    } finally {
      space.dispose()
    }
  })

  it('lights the fragments while a story is focused', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      const plate = plates(space.scene)[0] as Mesh
      const material = plate.material as ShaderMaterial

      space.update(1 / FPS, snap())
      expect(material.uniforms.uFocus.value).toBe(0)

      space.update(1 / FPS, snap({ focusedStory: 1 }))
      expect(material.uniforms.uFocus.value).toBeGreaterThan(0)
    } finally {
      space.dispose()
    }
  })

  it('forgets a story that left the archive', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      expect(space.openStory(1)).not.toBeNull()

      space.setStories([story(2)])
      expect(space.openStory(1)).toBeNull()
    } finally {
      space.dispose()
    }
  })

  it('does not travel when no fragment is focused', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      space.update(1 / FPS, snap())
      const before = space.camera.position.toArray()

      space.travelToFocus()
      space.update(1 / FPS, snap())

      // The idle orbit keeps drifting — the focus did not pull the camera
      // anywhere.
      expect(Math.abs(space.camera.position.x - before[0])).toBeLessThan(0.1)
      expect(Math.abs(space.camera.position.z - before[2])).toBeLessThan(0.1)
    } finally {
      space.dispose()
    }
  })

  it('does not break the frame on a broken delta', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      expect(() => {
        space.update(Number.NaN, snap())
        space.update(-1, snap())
      }).not.toThrow()
      expect(space.camera.position.toArray().every((v) => Number.isFinite(v))).toBe(
        true,
      )
    } finally {
      space.dispose()
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

  it('reports nothing when the pointer left the canvas', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      space.setPointer(2, 2)
      for (let i = 0; i < 4; i++) space.update(1 / FPS, snap())
      expect(space.pointerStoryId()).toBeNull()
    } finally {
      space.dispose()
    }
  })

  it('reports nothing in the empty archive', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([])
      space.setPointer(0, 0)
      for (let i = 0; i < 4; i++) space.update(1 / FPS, snap())
      expect(space.pointerStoryId()).toBeNull()
      expect(space.openStory(1)).toBeNull()
    } finally {
      space.dispose()
    }
  })

  it('ignores a broken pointer and a broken drag', () => {
    const space = buildArchiveSpace(three, 'low')
    try {
      space.setStories([story(1)])
      space.update(1 / FPS, snap())
      const before = space.camera.position.toArray()

      space.setPointer(Number.NaN, 0)
      space.orbitBy(Number.NaN, Number.NaN)

      // Neither of them moved the camera.
      expect(space.camera.position.toArray()).toEqual(before)

      space.update(1 / FPS, snap())
      expect(space.camera.position.toArray().every((v) => Number.isFinite(v))).toBe(
        true,
      )
      expect(space.pointerStoryId()).toBeNull()
    } finally {
      space.dispose()
    }
  })
})

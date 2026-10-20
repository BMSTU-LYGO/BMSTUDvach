import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Mesh, Object3D, Points, ShaderMaterial } from 'three'

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

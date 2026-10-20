import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Line, Mesh, Object3D, Points, ShaderMaterial } from 'three'

/**
 * The shader accents of the network and of the transition warps: the
 * travelling light (accent sweep), the ink grain and the warmth under the
 * cursor.
 *
 * Two rules hold for all of them:
 *
 * 1. **They live inside the shaders that were already there.** No new draw
 *    calls, no new materials, nothing to dispose — the accents are a change
 *    of the uniforms of the surfaces the scene already draws.
 * 2. **The tier decides how much of them is drawn.** The low tier draws the
 *    plain surface: no travelling light, no grain. The network keeps its
 *    shape, the veil keeps its transition.
 */

const quality = vi.hoisted(() => ({ resolved: 'low' as 'high' | 'low' }))

vi.mock('@/composables/useQuality3D', () => ({
  useQuality3D: () => ({ resolved: { value: quality.resolved } }),
}))

import {
  buildNetwork,
  type NetworkController,
  type NetworkSnapshot,
} from '@/three/network'
import { makeWarpMaterial, warpKindFor, warpKindIndex } from '@/three/warps'

let three: typeof import('three')

beforeAll(async () => {
  // jsdom ships no 2d canvas: the node labels fall back to no texture.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  three = await import('three')
})

const FPS = 60

function snap(
  mode: NetworkSnapshot['mode'],
  highlightedBoard: string | null = null,
): NetworkSnapshot {
  return { mode, boardSlug: null, highlightedBoard }
}

function build(tier: 'high' | 'low'): NetworkController {
  const net = buildNetwork(three, tier)
  net.setBoards([
    { slug: 'study', threadCount: 4, order: 1 },
    { slug: 'campus', threadCount: 12, order: 2 },
  ])
  return net
}

function run(
  net: NetworkController,
  mode: NetworkSnapshot['mode'],
  frames: number,
  highlightedBoard: string | null = null,
) {
  for (let i = 0; i < frames; i++) {
    net.update(1 / FPS, snap(mode, highlightedBoard))
  }
}

/** Only board nodes carry a label sprite. */
function nodeGroups(net: NetworkController): Object3D[] {
  const groups: Object3D[] = []
  net.scene.traverse((o) => {
    if (o.type === 'Sprite' && o.parent) groups.push(o.parent)
  })
  return groups
}

/** The shader material of a board node — the node mesh is its first child. */
function nodeMaterial(net: NetworkController, index: number): ShaderMaterial {
  const group = nodeGroups(net)[index]
  return (group.children[0] as Mesh).material as ShaderMaterial
}

/** Everything the renderer has to draw: meshes, lines and point clouds. */
function drawables(net: NetworkController): number {
  let count = 0
  net.scene.traverse((o) => {
    const drawable = o as Mesh & Points & Line
    if (drawable.isMesh || drawable.isPoints || drawable.isLine) count++
  })
  return count
}

/** Objects and materials of the scene — the budget of a frame. */
function budget(net: NetworkController) {
  let objects = 0
  const materials = new Set<string>()
  net.scene.traverse((o) => {
    objects++
    const material = (o as Mesh).material
    if (Array.isArray(material)) {
      for (const m of material) materials.add(m.uuid)
    } else if (material) {
      materials.add(material.uuid)
    }
  })
  return { objects, materials: materials.size }
}

/** Where a node sits on the screen, in normalised device coordinates. */
function ndcOf(net: NetworkController, group: Object3D) {
  net.scene.updateMatrixWorld(true)
  net.camera.updateMatrixWorld()
  const v = new three.Vector3()
  group.getWorldPosition(v)
  v.project(net.camera)
  return { x: v.x, y: v.y }
}

/**
 * Point the cursor at a node and hold it there while the camera drifts —
 * the pointer of a real user follows what it looks at.
 */
function holdPointerOn(
  net: NetworkController,
  group: Object3D,
  frames: number,
  mode: NetworkSnapshot['mode'] = 'home',
  highlightedBoard: string | null = null,
) {
  for (let i = 0; i < frames; i++) {
    const ndc = ndcOf(net, group)
    net.setPointer(ndc.x, ndc.y)
    net.update(1 / FPS, snap(mode, highlightedBoard))
  }
}

describe('network: accent sweep and ink grain', () => {
  it('draws the travelling light and the grain on the high tier', () => {
    const net = build('high')
    const mat = nodeMaterial(net, 0)

    expect(mat.uniforms.uSweep.value).toBeGreaterThan(0)
    expect(mat.uniforms.uGrain.value).toBeGreaterThan(0)
    // The sweep is a light on a surface, not a saturated hue: the sheen it
    // mixes towards is the warm paper of the archive.
    expect(mat.uniforms.uSheen.value.getHex()).toBe(0xf2ede0)
  })

  it('drops the accents on the low tier', () => {
    const net = build('low')
    const mat = nodeMaterial(net, 0)

    expect(mat.uniforms.uSweep.value).toBe(0)
    expect(mat.uniforms.uGrain.value).toBe(0)
    // The warmth stays: it is a reaction of the material, not a luxury.
    expect(mat.uniforms.uWarmColor.value.getHex()).toBe(0xd4882a)
  })

  it('keeps the accents inside the shaders — no new draw calls', () => {
    const high = build('high')
    const low = build('low')

    expect(drawables(high)).toBe(drawables(low))

    const mat = nodeMaterial(high, 0)
    // The uniforms must really be read by the shader: an unused uniform
    // would be a decoration, not an accent.
    expect(mat.fragmentShader).toContain('uSweep')
    expect(mat.fragmentShader).toContain('uGrain')
    expect(mat.fragmentShader).toContain('uWarm')
    expect(mat.vertexShader).toContain('vLocal')
  })

  it('never sweeps the nodes in unison', () => {
    const net = build('high')

    const seeds = nodeGroups(net).map(
      (_, i) => nodeMaterial(net, i).uniforms.uSweepSeed.value,
    )
    expect(new Set(seeds).size).toBe(seeds.length)
  })

  it('adds nothing to the scene while the frames run', () => {
    const net = build('high')
    const before = budget(net)

    holdPointerOn(net, nodeGroups(net)[0], 60)

    // The accents are uniforms of the surfaces that were already there:
    // a frame must not bring an object or a material with it.
    const after = budget(net)
    expect(after.objects).toBe(before.objects)
    expect(after.materials).toBe(before.materials)
  })
})

describe('network: warmth under the cursor', () => {
  it('warms the node the pointer passes closest to', () => {
    const net = build('high')
    const target = nodeGroups(net)[0]
    const other = nodeGroups(net)[1]

    holdPointerOn(net, target, 20)

    const warm = nodeMaterial(net, 0).uniforms.uWarm.value as number
    const cold = nodeMaterial(net, 1).uniforms.uWarm.value as number
    expect(warm).toBeGreaterThan(0.4)
    expect(cold).toBeLessThan(0.1)
    // The warmth is a material reaction, not a new colour of the node.
    expect(nodeMaterial(net, 0).uniforms.uColor.value.getHex()).not.toBe(0xffa840)
    expect(other.children.length).toBeGreaterThan(0)
  })

  it('lets the warmth fade away when the pointer is gone', () => {
    const net = build('high')
    const target = nodeGroups(net)[0]

    holdPointerOn(net, target, 20)
    expect(nodeMaterial(net, 0).uniforms.uWarm.value as number).toBeGreaterThan(0.4)

    // The pointer leaves the screen: the accent has to go out with it.
    net.setPointer(4, 4)
    run(net, 'home', 60)

    expect(nodeMaterial(net, 0).uniforms.uWarm.value as number).toBeLessThan(0.05)
  })

  it('yields to a hovered board — one accent at a time', () => {
    const net = build('high')
    const target = nodeGroups(net)[0]

    holdPointerOn(net, target, 20)
    expect(nodeMaterial(net, 0).uniforms.uWarm.value as number).toBeGreaterThan(0.4)

    // A highlighted board is the accent of the frame; the warmth stands down.
    holdPointerOn(net, target, 60, 'home', 'study')
    expect(nodeMaterial(net, 0).uniforms.uWarm.value as number).toBeLessThan(0.05)
  })
})

describe('warps: accent band and ink grain', () => {
  it('draws the band and the grain on the high tier', () => {
    const mat = makeWarpMaterial(three, { quality: 'high' })

    expect(mat.uniforms.uAccent.value).toBeGreaterThan(0)
    expect(mat.uniforms.uGrain.value).toBeGreaterThan(0)
    expect(mat.fragmentShader).toContain('gl_FragColor')
    expect(mat.fragmentShader).toContain('accentBand')
    expect(mat.fragmentShader).toContain('inkGrain')
  })

  it('takes the plain path on the low tier', () => {
    const mat = makeWarpMaterial(three, { quality: 'low' })

    expect(mat.uniforms.uAccent.value).toBe(0)
    expect(mat.uniforms.uGrain.value).toBe(0)
    // The transition itself is untouched.
    expect(mat.fragmentShader).toContain('gl_FragColor')
  })

  it('follows the resolved 3D quality when no tier is given', () => {
    quality.resolved = 'high'
    expect(makeWarpMaterial(three).uniforms.uAccent.value).toBeGreaterThan(0)

    quality.resolved = 'low'
    const low = makeWarpMaterial(three)
    expect(low.uniforms.uAccent.value).toBe(0)
    expect(low.uniforms.uGrain.value).toBe(0)
  })

  it('keeps every kind of the transition', () => {
    expect(warpKindFor('home', 'board')).toBe('signal')
    expect(warpKindFor('board', 'thread')).toBe('tunnel')
    expect(warpKindFor('home', 'platinum')).toBe('fracture')
    for (const kind of ['signal', 'tunnel', 'fracture'] as const) {
      expect(warpKindIndex(kind)).toBeGreaterThanOrEqual(0)
    }
  })
})

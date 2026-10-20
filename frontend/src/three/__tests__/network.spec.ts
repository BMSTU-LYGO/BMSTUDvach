import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { LineBasicMaterial, LineSegments, Object3D } from 'three'

import { buildNetwork, type NetworkController, type NetworkSnapshot } from '@/three/network'
import type { SceneMode } from '@/three/sceneState'

/** The slice of the geometry constructor params the fixtures key off. */
interface MeshParams {
  radius?: number
  width?: number
  geometry?: { type?: string; parameters?: MeshParams }
}

/**
 * Behavioural smoke tests for the route-transition layer: topology morphing
 * (network ⇄ archive ⇄ lost node) and shared-element continuity (the board
 * node the camera keeps looking at, the envoy packet).
 *
 * Everything is asserted through the public controller API and the scene
 * graph — the internals stay private. A morph is 650ms, i.e. ~39 frames at
 * 60fps, so "mid-morph" checks sample around frame 20.
 */

let three: typeof import('three')

beforeAll(async () => {
  // jsdom ships no 2d canvas: the node labels fall back to no texture.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  three = await import('three')
})

const FPS = 60
const MORPH_FRAMES = 40

function snap(mode: SceneMode, boardSlug: string | null = null): NetworkSnapshot {
  return { mode, boardSlug, highlightedBoard: null }
}

function build(): NetworkController {
  const net = buildNetwork(three, 'low')
  net.setBoards([
    { slug: 'study', threadCount: 4, order: 1 },
    { slug: 'campus', threadCount: 12, order: 2 },
  ])
  net.setStoryCount(6)
  return net
}

function run(net: NetworkController, mode: SceneMode, frames: number) {
  for (let i = 0; i < frames; i++) net.update(1 / FPS, snap(mode))
}

/**
 * Geometries remember their parameters, so the archive rings (`TorusGeometry`),
 * the vault (`DodecahedronGeometry`), the fragments (`BoxGeometry`), the reply
 * packets (`SphereGeometry` r 0.15) and the lost node (radius 1.25) are all
 * addressable from the scene graph.
 */
function find(
  net: NetworkController,
  kind: string,
  prop: 'radius' | 'width',
  value: number,
): Object3D[] {
  const found: Object3D[] = []
  net.scene.traverse((o) => {
    const geo = (
      o as { geometry?: { type?: string; parameters?: MeshParams } }
    ).geometry
    const params = geo?.parameters
    if (!geo || !params) return
    // EdgesGeometry wraps another geometry; plain geometries stand alone.
    const wrapped = params.geometry
    const inner = wrapped?.parameters
    const type = wrapped ? wrapped.type : geo.type
    const actual = wrapped ? inner : params
    if (type === kind && actual?.[prop] === value) found.push(o)
  })
  return found
}

function rings(net: NetworkController) {
  return [
    ...find(net, 'TorusGeometry', 'radius', 3.0),
    ...find(net, 'TorusGeometry', 'radius', 4.8),
    ...find(net, 'TorusGeometry', 'radius', 6.6),
  ]
}

function vault(net: NetworkController) {
  return find(net, 'DodecahedronGeometry', 'radius', 1.15)[0]
}

function lostNode(net: NetworkController) {
  return find(net, 'IcosahedronGeometry', 'radius', 1.25)[0] as LineSegments
}

function fragments(net: NetworkController) {
  return find(net, 'BoxGeometry', 'width', 0.85)
}

function packets(net: NetworkController) {
  return find(net, 'SphereGeometry', 'radius', 0.15).filter((o) => o.visible)
}

/** Only board nodes carry a label sprite. */
function nodeGroups(net: NetworkController): Object3D[] {
  const groups: Object3D[] = []
  net.scene.traverse((o) => {
    if (o.type === 'Sprite' && o.parent) groups.push(o.parent)
  })
  return groups
}

/** The shared element is the only node glowing at shared intensity. */
function sharedElementGroup(net: NetworkController): Object3D | null {
  let found: Object3D | null = null
  net.scene.traverse((o) => {
    const mat = (
      o as { material?: { uniforms?: Record<string, { value: number }> } }
    ).material
    if (mat?.uniforms?.uGlowIntensity?.value === 2.8 && o.parent) found = o.parent
  })
  return found
}

describe('network: shared-element continuity', () => {
  it('anchors the camera on the shared board node while travelling', () => {
    const net = build()
    net.anchorSharedElement('study')
    net.travelTo({ preset: 'board', durationMs: 650, easing: 'easeInOutCubic' })
    net.update(1 / FPS, snap('home'))

    const anchored = sharedElementGroup(net)
    expect(anchored).not.toBeNull()

    const facing = new three.Vector3()
    net.camera.getWorldDirection(facing)
    const expected = anchored!
      .getWorldPosition(new three.Vector3())
      .multiplyScalar(0.6)
      .sub(net.camera.position)
      .normalize()
    expect(facing.distanceTo(expected)).toBeLessThan(0.25)
  })

  it('ignores unknown slugs and releases the anchor when travel ends', () => {
    const net = build()
    net.anchorSharedElement('no-such-board')
    net.update(1 / FPS, snap('home'))
    expect(sharedElementGroup(net)).toBeNull()

    net.anchorSharedElement('campus')
    net.travelTo({ preset: 'home', durationMs: 650, easing: 'easeInOutCubic' })
    net.update(1 / FPS, snap('board', 'campus'))
    expect(sharedElementGroup(net)).not.toBeNull()

    run(net, 'home', 90)
    expect(sharedElementGroup(net)).toBeNull()
  })

  it('launches an envoy packet from the given board node', () => {
    const net = build()
    net.launchEnvoyPacket('study')
    net.update(1 / FPS, snap('board', 'study'))

    const flying = packets(net)
    expect(flying).toHaveLength(1)

    const positions = nodeGroups(net).map((g) => g.position)
    const packet = flying[0].getWorldPosition(new three.Vector3())
    expect(positions.some((p) => packet.distanceTo(p) < 1)).toBe(true)
  })

  it('falls back to a side source for an unknown envoy slug', () => {
    const net = build()
    net.launchEnvoyPacket('missing')
    net.update(1 / FPS, snap('board', 'study'))
    const flying = packets(net)
    expect(flying).toHaveLength(1)
    expect(flying[0].position.x).toBeGreaterThan(3)
  })
})

describe('network: topology morphing', () => {
  it('folds the board nodes into the archive rings on the way to platinum', () => {
    const net = build()
    expect(rings(net)).toHaveLength(3)
    expect(vault(net)).toBeTruthy()
    expect(fragments(net)).toHaveLength(6)

    const before = nodeGroups(net).map((g) => g.scale.x)
    net.morphTo('platinum', 650)
    run(net, 'platinum', 20)

    // Mid-morph: the constellation folds in while the archive unfolds.
    nodeGroups(net).forEach((group, i) => {
      expect(group.scale.x).toBeGreaterThan(0)
      expect(group.scale.x).toBeLessThan(before[i] - 0.05)
    })
    for (const ring of rings(net)) {
      expect(ring.scale.x).toBeGreaterThan(0)
      expect(ring.scale.x).toBeLessThan(1)
    }
    expect(vault(net).scale.x).toBeLessThan(1)

    // Last frames of the morph: the nodes have folded into the archive.
    run(net, 'platinum', 16)
    for (const group of nodeGroups(net)) expect(group.scale.x).toBeLessThan(0.35)
    for (const ring of rings(net)) expect(ring.scale.x).toBeGreaterThan(0.9)
    expect(vault(net).scale.x).toBeGreaterThan(0.9)
    for (const fragment of fragments(net)) expect(fragment.scale.x).toBeGreaterThan(0.9)

    // Settled: the network is gone, the archive is fully in place.
    run(net, 'platinum', 60)
    expect(nodeGroups(net)[0].parent?.visible).toBe(false)
    for (const ring of rings(net)) expect(ring.scale.x).toBeCloseTo(1, 3)
  })

  it('unwinds the archive again on the way back to home', () => {
    const net = build()
    run(net, 'platinum', 90)
    for (const ring of rings(net)) expect(ring.scale.x).toBeCloseTo(1, 3)

    net.morphTo('home', 650)
    run(net, 'home', 20)
    for (const ring of rings(net)) expect(ring.scale.x).toBeLessThan(1)

    // Settled: the archive is gone (idle scale restored) and the nodes are back.
    run(net, 'home', 60)
    expect(rings(net)[0].parent?.visible).toBe(false)
    for (const group of nodeGroups(net)) expect(group.scale.x).toBeGreaterThan(0.7)
  })

  it('materialises the lost node instead of popping it in', () => {
    const net = build()
    const lost = lostNode(net)
    expect(lost).toBeTruthy()

    net.morphTo('error', 650)
    run(net, 'error', 10)
    const earlyOpacity = (lost.material as LineBasicMaterial).opacity
    expect(earlyOpacity).toBeGreaterThan(0)
    expect(earlyOpacity).toBeLessThan(0.4)

    run(net, 'error', MORPH_FRAMES)
    expect((lost.material as LineBasicMaterial).opacity).toBeGreaterThan(
      earlyOpacity,
    )
  })

  it('leaves the presence lerp alone when no morph is running', () => {
    const net = build()
    run(net, 'thread', 120)
    for (const group of nodeGroups(net)) expect(group.scale.x).toBeGreaterThan(0.7)
  })
})

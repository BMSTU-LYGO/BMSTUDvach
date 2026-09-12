import type {
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  QuadraticBezierCurve3,
  Scene,
} from 'three'
import type { QualityResolved } from '@/composables/useQuality3D'
import type { SceneMode } from './sceneState'

type ThreeModule = typeof import('three')

export interface NetworkSnapshot {
  mode: SceneMode
  boardSlug: string | null
  highlightedBoard: string | null
}

export interface NetworkController {
  scene: Scene
  camera: PerspectiveCamera
  setBoards(slugs: string[]): void
  setStoryCount(count: number): void
  pulseAt(slug: string): void
  sendReply(): void
  /** 404 'rescue' ping: ring at the lost node + amber flash. */
  rescue(): void
  setPointer(ndcX: number, ndcY: number): void
  update(dt: number, snap: NetworkSnapshot): void
  dispose(): void
}

/** Stable hash for deterministic node layout. */
function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

const AMBER = 0xd4882a
const STEEL = 0x5a6480

interface BoardNode {
  slug: string
  pos: { x: number; y: number; z: number }
  group: Group
  mat: LineBasicMaterial
  scale: number
}

interface Pulse {
  ring: Mesh
  mat: MeshBasicMaterial
  life: number
  active: boolean
}

interface Packet {
  mesh: Mesh
  mat: MeshBasicMaterial
  curve: QuadraticBezierCurve3
  t: number
  active: boolean
}

/**
 * The persistent "engineering network": board nodes wired to a central
 * backbone, ambient dust, signal pulses and reply packets — plus three
 * special sets that fade in per route: the platinum archive (rings and
 * fragments), the lost node (404) and the calm thread core.
 *
 * One scene graph, five modes, presence-lerped transitions.
 */
export function buildNetwork(
  three: ThreeModule,
  quality: QualityResolved,
): NetworkController {
  const high = quality === 'high'
  const tracked: { dispose: () => void }[] = []
  const keep = <T extends { dispose: () => void }>(x: T): T => {
    tracked.push(x)
    return x
  }

  const scene = new three.Scene()
  const camera = new three.PerspectiveCamera(50, 1, 0.1, 200)
  camera.position.set(0, 1.2, 17)

  const world = new three.Group()
  scene.add(world)

  // --- ambient dust -----------------------------------------------------
  const dustCount = high ? 130 : 50
  const dustPos = new Float32Array(dustCount * 3)
  const dustVel = new Float32Array(dustCount * 3)
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 42
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 26
    dustPos[i * 3 + 2] = -14 + Math.random() * 20
    dustVel[i * 3] = (Math.random() - 0.5) * 0.6
    dustVel[i * 3 + 1] = (Math.random() - 0.5) * 0.4
    dustVel[i * 3 + 2] = 0
  }
  const dustGeo = keep(new three.BufferGeometry())
  dustGeo.setAttribute('position', new three.BufferAttribute(dustPos, 3))
  const dustMat = keep(
    new three.PointsMaterial({
      color: 0x8a94b8,
      size: 2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  )
  world.add(new three.Points(dustGeo, dustMat))

  // --- backbone core ------------------------------------------------------
  const coreGroup = new three.Group()
  world.add(coreGroup)
  const coreMat = keep(
    new three.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.85 }),
  )
  const coreNode = new three.LineSegments(
    keep(new three.EdgesGeometry(new three.OctahedronGeometry(0.55))),
    coreMat,
  )
  coreGroup.add(coreNode)

  // --- board nodes + edges --------------------------------------------------
  const networkGroup = new three.Group()
  world.add(networkGroup)
  let nodes: BoardNode[] = []
  let nodeOwned: { dispose: () => void }[] = []

  function makeLabel(txt: string) {
    const cv = document.createElement('canvas')
    cv.width = 256
    cv.height = 80
    const c = cv.getContext('2d')
    if (c) {
      c.font = '600 34px "JetBrains Mono", monospace'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillStyle = 'rgba(212, 136, 42, 0.9)'
      c.fillText(txt, 128, 42)
    }
    const tex = keep(new three.CanvasTexture(cv))
    const mat = keep(
      new three.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
    )
    const sprite = new three.Sprite(mat)
    sprite.scale.set(3, 0.95, 1)
    return sprite
  }

  function setBoards(slugs: string[]) {
    for (const child of [...networkGroup.children]) networkGroup.remove(child)
    for (const m of nodeOwned) m.dispose()
    nodeOwned = []
    nodes = []

    slugs.forEach((slug, idx) => {
      const angle = idx * 2.39996 + (hash(slug) % 100) * 0.004
      const radius = 7.4 + (idx % 2) * 2.4
      const pos = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.52,
        z: -3 + ((hash(slug) % 7) - 3) * 0.9,
      }

      const group = new three.Group()
      group.position.set(pos.x, pos.y, pos.z)

      const nodeMat = new three.LineBasicMaterial({
        color: STEEL,
        transparent: true,
        opacity: 0.55,
      })
      nodeOwned.push(nodeMat)
      const nodeGeo = new three.EdgesGeometry(
        new three.IcosahedronGeometry(0.62, high ? 1 : 0),
      )
      nodeOwned.push(nodeGeo)
      group.add(new three.LineSegments(nodeGeo, nodeMat))

      const dotMat = new three.MeshBasicMaterial({
        color: AMBER,
        transparent: true,
        opacity: 0.85,
      })
      const dotGeo = new three.SphereGeometry(0.09, 8, 8)
      nodeOwned.push(dotMat, dotGeo)
      group.add(new three.Mesh(dotGeo, dotMat))

      const label = makeLabel(`/${slug}/`)
      label.position.set(0, 0.95, 0)
      group.add(label)

      networkGroup.add(group)
      nodes.push({ slug, pos, group, mat: nodeMat, scale: 1 })

      const edgeMat = new three.LineBasicMaterial({
        color: STEEL,
        transparent: true,
        opacity: 0.16,
      })
      const edgeGeo = new three.BufferGeometry().setFromPoints([
        new three.Vector3(0, 0, 0),
        new three.Vector3(pos.x, pos.y, pos.z),
      ])
      nodeOwned.push(edgeMat, edgeGeo)
      const edge = new three.Line(edgeGeo, edgeMat)
      edge.userData = { slug, kind: 'edge' }
      networkGroup.add(edge)
    })
  }

  // --- signal pulses ---------------------------------------------------------
  const pulsePool: Pulse[] = []
  for (let i = 0; i < 6; i++) {
    const mat = new three.MeshBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0,
      side: three.DoubleSide,
      blending: three.AdditiveBlending,
      depthWrite: false,
    })
    const geo = new three.RingGeometry(0.32, 0.42, 40)
    nodeOwned.push(mat, geo)
    const ring = new three.Mesh(geo, mat)
    ring.visible = false
    world.add(ring)
    pulsePool.push({ ring, mat, life: 0, active: false })
  }

  function pulseAt(slug: string) {
    const node = nodes.find((n) => n.slug === slug)
    if (!node) return
    const p = pulsePool.find((x) => !x.active)
    if (!p) return
    p.ring.position.set(node.pos.x, node.pos.y, node.pos.z)
    p.ring.rotation.set(-0.35, 0, 0)
    p.ring.visible = true
    p.life = 0.0001
    p.active = true
    cameraKick = Math.min(0.6, cameraKick + 0.35)
  }

  // --- reply packets ------------------------------------------------------------
  const packetPool: Packet[] = []
  for (let i = 0; i < 5; i++) {
    const mat = new three.MeshBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0,
      blending: three.AdditiveBlending,
      depthWrite: false,
    })
    const geo = new three.SphereGeometry(0.13, 10, 10)
    nodeOwned.push(mat, geo)
    const mesh = new three.Mesh(geo, mat)
    mesh.visible = false
    world.add(mesh)
    packetPool.push({
      mesh,
      mat,
      curve: new three.QuadraticBezierCurve3(
        new three.Vector3(),
        new three.Vector3(),
        new three.Vector3(),
      ),
      t: 0,
      active: false,
    })
  }

  let lostFlash = 0
  function rescue() {
    const p = pulsePool.find((x) => !x.active)
    if (p) {
      p.ring.position.set(0, 0, 0)
      p.ring.rotation.set(0, 0, 0)
      p.ring.visible = true
      p.life = 0.0001
      p.active = true
    }
    lostFlash = 0.45
    cameraKick = Math.min(0.6, cameraKick + 0.3)
  }

  function sendReply() {
    const p = packetPool.find((x) => !x.active)
    if (!p) return
    const source =
      nodes.length > 0
        ? nodes[Math.floor(Math.random() * nodes.length)].pos
        : { x: 5, y: 2.5, z: -2 }
    p.curve = new three.QuadraticBezierCurve3(
      new three.Vector3(source.x, source.y, source.z),
      new three.Vector3(source.x * 0.4, source.y * 0.4 + 2.8, 3),
      new three.Vector3(0, 0, 0),
    )
    p.t = 0
    p.mesh.visible = true
    p.mat.opacity = 1
    p.active = true
    cameraKick = Math.min(0.5, cameraKick + 0.22)
  }

  // --- platinum archive -------------------------------------------------------
  const archiveGroup = new three.Group()
  archiveGroup.visible = false
  world.add(archiveGroup)

  const radii = [3.0, 4.8, 6.6]
  const ringMeshes: { mesh: LineSegments; spin: number; dir: number }[] = []
  radii.forEach((radius, i) => {
    const geo = keep(
      new three.EdgesGeometry(new three.TorusGeometry(radius, 0.035, 5, high ? 64 : 28)),
    )
    const mat = keep(
      new three.LineBasicMaterial({ color: STEEL, transparent: true, opacity: 0.35 }),
    )
    const mesh = new three.LineSegments(geo, mat)
    mesh.rotation.set(Math.PI / 2 + (i - 1) * 0.3, 0, 0.12 * (i - 1))
    archiveGroup.add(mesh)
    ringMeshes.push({ mesh, spin: 0.05 + radius * 0.008, dir: i % 2 ? -1 : 1 })
  })

  const vaultGeo = keep(new three.EdgesGeometry(new three.DodecahedronGeometry(1.15)))
  const vaultMat = keep(
    new three.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.7 }),
  )
  const vault = new three.LineSegments(vaultGeo, vaultMat)
  archiveGroup.add(vault)

  const glowGeo = keep(new three.SphereGeometry(1.4, 18, 18))
  const glowMat = keep(
    new three.MeshBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0.07,
      blending: three.AdditiveBlending,
      depthWrite: false,
    }),
  )
  archiveGroup.add(new three.Mesh(glowGeo, glowMat))

  let fragments: {
    mesh: LineSegments
    geo: { dispose: () => void }
    mat: LineBasicMaterial
    ringIdx: number
    angle: number
  }[] = []

  function setStoryCount(count: number) {
    for (const f of fragments) {
      archiveGroup.remove(f.mesh)
      f.geo.dispose()
      f.mat.dispose()
    }
    fragments = []
    const n = Math.max(0, Math.min(count, 18))
    for (let i = 0; i < n; i++) {
      const geo = new three.EdgesGeometry(new three.BoxGeometry(0.85, 1.1, 0.06))
      const mat = new three.LineBasicMaterial({
        color: i % 3 === 0 ? AMBER : STEEL,
        transparent: true,
        opacity: 0.65,
      })
      const mesh = new three.LineSegments(geo, mat)
      const ringIdx = i % 3
      const angle = (i / n) * Math.PI * 2 + ringIdx * 0.7
      mesh.position.set(Math.cos(angle) * radii[ringIdx], 0, Math.sin(angle) * radii[ringIdx])
      archiveGroup.add(mesh)
      fragments.push({ mesh, geo, mat, ringIdx, angle })
    }
  }

  // --- lost node (404) ----------------------------------------------------------
  const lostGroup = new three.Group()
  lostGroup.visible = false
  world.add(lostGroup)
  const lostMat = keep(
    new three.LineBasicMaterial({ color: STEEL, transparent: true, opacity: 0.75 }),
  )
  const lostNode = new three.LineSegments(
    keep(new three.EdgesGeometry(new three.IcosahedronGeometry(1.25, 1))),
    lostMat,
  )
  lostGroup.add(lostNode)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const mat = keep(
      new three.LineBasicMaterial({ color: STEEL, transparent: true, opacity: 0.22 }),
    )
    const geo = keep(
      new three.BufferGeometry().setFromPoints([
        new three.Vector3(Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0),
        new three.Vector3(
          Math.cos(a) * (2.8 + (i % 2) * 1.4),
          Math.sin(a) * 2.3,
          -1 - i * 0.4,
        ),
      ]),
    )
    lostGroup.add(new three.Line(geo, mat))
  }

  // --- camera / pointer / presence state -----------------------------------------
  const pointer = new three.Vector2(999, 999)
  const smoothPointer = new three.Vector2(0, 0)
  let cameraKick = 0
  let elapsed = 0
  const presence = { network: 1, archive: 0, lost: 0 }
  const raycaster = new three.Raycaster()

  function update(dt: number, snap: NetworkSnapshot) {
    elapsed += dt
    const ease = Math.min(1, dt * 2.6)
    const netTarget = snap.mode === 'platinum' || snap.mode === 'error' ? 0 : 1
    presence.network += (netTarget - presence.network) * ease
    presence.archive += ((snap.mode === 'platinum' ? 1 : 0) - presence.archive) * ease
    presence.lost += ((snap.mode === 'error' ? 1 : 0) - presence.lost) * ease

    networkGroup.visible = presence.network > 0.02
    coreGroup.visible = networkGroup.visible
    archiveGroup.visible = presence.archive > 0.02
    lostGroup.visible = presence.lost > 0.02

    const calm = snap.mode === 'thread'
    const netPresence = calm ? presence.network * 0.5 : presence.network
    coreMat.opacity = 0.85 * presence.network
    dustMat.opacity =
      0.28 * Math.max(presence.network, presence.archive * 0.8, presence.lost * 0.6)

    const hi = snap.highlightedBoard ?? (snap.mode === 'board' ? snap.boardSlug : null)
    for (const n of nodes) {
      const isHi = hi !== null && n.slug === hi
      n.scale += ((isHi ? 1.3 : 1) - n.scale) * Math.min(1, dt * 7)
      n.group.scale.setScalar(n.scale)
      n.mat.opacity = (isHi ? 1 : 0.55) * netPresence
      n.mat.color.setHex(isHi ? AMBER : STEEL)
    }
    for (const child of networkGroup.children) {
      if (child.userData.kind === 'edge') {
        const line = child as Line
        const m = line.material as LineBasicMaterial
        const edgeHi = hi !== null && child.userData.slug === hi
        m.opacity = (edgeHi ? 0.6 : 0.16) * netPresence
        m.color.setHex(edgeHi ? AMBER : STEEL)
      }
    }
    coreNode.rotation.y += dt * (calm ? 0.6 : 0.25)

    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] += dustVel[i * 3] * dt
      dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt
      if (dustPos[i * 3] > 22) dustPos[i * 3] = -22
      if (dustPos[i * 3] < -22) dustPos[i * 3] = 22
      if (dustPos[i * 3 + 1] > 14) dustPos[i * 3 + 1] = -14
      if (dustPos[i * 3 + 1] < -14) dustPos[i * 3 + 1] = 14
    }
    dustGeo.attributes.position.needsUpdate = true

    for (const p of pulsePool) {
      if (!p.active) continue
      p.life += dt
      const t = p.life / 1.1
      if (t >= 1) {
        p.ring.visible = false
        p.active = false
        continue
      }
      p.ring.scale.setScalar(1 + t * 7)
      p.mat.opacity = (1 - t) * 0.7
    }

    for (const p of packetPool) {
      if (!p.active) continue
      p.t += dt * 1.05
      if (p.t >= 1) {
        p.mesh.visible = false
        p.active = false
        continue
      }
      const eased = p.t * p.t * (3 - 2 * p.t)
      p.mesh.position.copy(p.curve.getPoint(eased))
      p.mat.opacity = 1 - Math.pow(p.t, 3)
    }

    if (archiveGroup.visible) {
      ringMeshes.forEach((r, i) => {
        r.mesh.rotation.z += dt * r.spin * r.dir * (i === 1 ? 0.7 : 1)
      })
      vault.rotation.y += dt * 0.4
      vault.rotation.x = Math.sin(elapsed * 0.3) * 0.15
      vaultMat.opacity = (0.6 + Math.sin(elapsed * 1.4) * 0.15) * presence.archive
      glowMat.opacity = (0.06 + Math.sin(elapsed * 0.9) * 0.02) * presence.archive

      for (const f of fragments) {
        f.angle += dt * 0.12 * (f.ringIdx % 2 ? -1 : 1)
        f.mesh.position.set(
          Math.cos(f.angle) * radii[f.ringIdx],
          Math.sin(elapsed * 0.6 + f.angle * 3) * 0.35,
          Math.sin(f.angle) * radii[f.ringIdx],
        )
      }
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(
        fragments.map((f) => f.mesh as unknown as Mesh),
        false,
      )
      const hovered =
        hits.length > 0
          ? fragments.findIndex((f) => (f.mesh as unknown) === hits[0].object)
          : -1
      fragments.forEach((f, i) => {
        const isHot = i === hovered
        f.mesh.scale.setScalar(isHot ? 1.35 : 1)
        f.mat.opacity = (isHot ? 1 : 0.65) * presence.archive
        f.mat.color.setHex(isHot ? AMBER : i % 3 === 0 ? AMBER : STEEL)
      })
    }

    if (lostGroup.visible) {
      lostNode.rotation.y += dt * (0.5 + Math.sin(elapsed * 2.1) * 0.3)
      lostNode.rotation.x += dt * 0.18
      lostFlash = Math.max(0, lostFlash - dt * 0.8)
      lostMat.opacity =
        Math.min(1, 0.5 + (Math.sin(elapsed * 7) > 0.85 ? 0.4 : 0) + lostFlash) *
        presence.lost
      lostGroup.position.x +=
        (smoothPointer.x * 1.1 - lostGroup.position.x) * Math.min(1, dt * 2)
      lostGroup.position.y +=
        (smoothPointer.y * 0.7 - lostGroup.position.y) * Math.min(1, dt * 2)
    }

    let tx = 0
    let ty = 1.2
    let tz = 17
    const lookTarget = new three.Vector3(0, 0, 0)
    if (snap.mode === 'board') {
      const node = nodes.find((n) => n.slug === snap.boardSlug)
      if (node) {
        tx = node.pos.x * 0.55
        ty = node.pos.y * 0.55 + 1.0
        tz = node.pos.z + 8.5
        lookTarget.set(node.pos.x * 0.6, node.pos.y * 0.6, node.pos.z * 0.6)
      }
    } else if (snap.mode === 'thread') {
      ty = 0.5
      tz = 9.5
    } else if (snap.mode === 'platinum') {
      ty = 2.2
      tz = 12.5
    } else if (snap.mode === 'error') {
      ty = 0
      tz = 6.5
    }

    cameraKick = Math.max(0, cameraKick - dt * 1.6)
    const camEase = Math.min(1, dt * 1.7)
    camera.position.x += (tx + smoothPointer.x * 0.9 - camera.position.x) * camEase
    camera.position.y += (ty - smoothPointer.y * 0.55 - camera.position.y) * camEase
    camera.position.z += (tz - cameraKick * 1.6 - camera.position.z) * camEase
    camera.lookAt(lookTarget)

    smoothPointer.x += (pointer.x - smoothPointer.x) * Math.min(1, dt * 2.2)
    smoothPointer.y += (pointer.y - smoothPointer.y) * Math.min(1, dt * 2.2)
  }

  setBoards([])
  setStoryCount(0)

  return {
    scene,
    camera,
    setBoards,
    setStoryCount,
    pulseAt,
    sendReply,
    rescue,
    setPointer: (x, y) => pointer.set(x, y),
    update,
    dispose: () => {
      for (const d of [...tracked, ...nodeOwned]) {
        try {
          d.dispose()
        } catch {
          /* already disposed */
        }
      }
      nodeOwned = []
      fragments = []
      nodes = []
    },
  }
}

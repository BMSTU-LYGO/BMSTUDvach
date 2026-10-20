#!/usr/bin/env node
/**
 * verify:3d — structural guard for the REAL3D plan (item 7).
 *
 * Static checks only (no browser): verifies that the required Three.js /
 * WebGL pieces exist and are wired, and FAILs (exit 1) if any of them has
 * been removed or silently degraded to plain DOM.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..') // frontend/

const results = []

function file(path) {
  const full = join(root, path)
  if (!existsSync(full)) return null
  return readFileSync(full, 'utf8')
}

/**
 * Source of a file with the comments stripped out. The archive guard has to
 * look at real code: a check that a commented-out line can satisfy is not a
 * guard, it is a decoration.
 */
function code(path) {
  const src = file(path)
  if (src === null) return ''
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
}

function check(name, cond, hint) {
  results.push({ name, ok: !!cond, hint })
}

// 1. dependencies & build config
const pkg = JSON.parse(file('package.json') ?? '{}')
check('three is a runtime dependency', pkg.dependencies?.three)
check(
  'verify:3d npm script exists',
  pkg.scripts?.['verify:3d']?.includes('verify-3d'),
)
const vite = file('vite.config.ts') ?? ''
check('three is split into its own chunk', /manualChunks[\s\S]*three:\s*\['three'\]/.test(vite))

// 2. scene lifecycle guard (no silent WebGL crashes / leaks)
const scene = file('src/composables/useThreeScene.ts') ?? ''
check('useThreeScene exists', scene.length > 0)
check('lazy three import', scene.includes("import('three')"))
check('context budget present', scene.includes('MAX_ACTIVE_CONTEXTS'))
check('renderer disposal', scene.includes('renderer.dispose()'))
check('visibility pause', scene.includes('visibilitychange'))
check('IntersectionObserver pause', scene.includes('IntersectionObserver'))
check('FPS degradation', scene.includes('degrade('))

// 3. single route-aware scene state (item 1)
const state = file('src/three/sceneState.ts') ?? ''
for (const mode of ['home', 'board', 'thread', 'platinum', 'error']) {
  check(`scene mode: ${mode}`, new RegExp(`'${mode}'`).test(state))
}
check('scene event bus', state.includes('onSceneEvent') && state.includes('emitSceneEvent'))

const network = file('src/three/network.ts') ?? ''
check('network scene builder', network.includes('buildNetwork'))
check('network: board nodes', network.includes('setBoards'))
check('network: signal pulses', network.includes('pulseAt'))
check('network: reply packets', network.includes('sendReply'))
check('network: archive rings', network.includes('TorusGeometry'))
check('network: archive fragments', network.includes('setStoryCount'))
check('network: lost node (404)', network.includes('lostNode'))
check('network: hover raycast', network.includes('Raycaster'))

const netCanvas = file('src/components/three/NetworkCanvas.vue') ?? ''
check('persistent NetworkCanvas', netCanvas.includes('buildNetwork'))

const router = file('src/router/index.ts') ?? ''
for (const sceneMode of ['home', 'board', 'thread', 'platinum', 'error']) {
  check(`route meta scene: ${sceneMode}`, router.includes(`scene: '${sceneMode}'`))
}
check('route → scene binding', (file('src/composables/useRouteScene.ts') ?? '').includes('setSceneMode'))

// 4. board card ↔ node link (item 2)
const card = file('src/components/ui/BoardCard3D.vue') ?? ''
check('card hover highlights node', card.includes('highlightBoard'))
check('card click emits pulse', card.includes("emitSceneEvent({ type: 'pulse'"))

// 5. shader route warps (item 3)
const warps = file('src/three/warps.ts') ?? ''
check('warp shader (GLSL fragment)', warps.includes('gl_FragColor'))
for (const kind of ['signal', 'tunnel', 'fracture']) {
  check(`warp kind: ${kind}`, warps.includes(`'${kind}'`))
}
check('warp canvas overlay', (file('src/components/three/WarpCanvas.vue') ?? '').includes('makeWarpMaterial'))

// 6. platinum archive (item 4)
const platinum = file('src/views/PlatinumView.vue') ?? ''
check('platinum feeds archive', platinum.includes('setStoryCount'))
check('platinum fetches stories', platinum.includes('listPlatinumStories'))

// 7. thread reply signal (item 6)
const thread = file('src/views/ThreadView.vue') ?? ''
check('new reply emits signal', thread.includes("emitSceneEvent({ type: 'reply' })"))
check(
  'no legacy floating-shapes canvas',
  !thread.includes('FloatingShapes3D') && !existsSync(join(root, 'src/components/three/FloatingShapes3D.vue')),
)

// 8. ambient fallback still exists for quality=off
check(
  'Canvas2D fallback retained',
  existsSync(join(root, 'src/components/ui/ParticleField.vue')),
)

// 9. committed style: engineering network, not hacker terminal (item 8)
const crt = file('src/composables/useCRT.ts') ?? ''
check('CRT is opt-in (off by default)', crt.includes("getItem(STORAGE_KEY) === 'true'"))
const home = file('src/views/HomeView.vue') ?? ''
check('hero has no forced scanlines', !home.includes('ScanlineOverlay'))
check('hero keeps engineering grid', home.includes('GridPattern'))

// 10. platinum archive space — the platinum route renders a scene of its own
// (epoch rings, one plate per story, procedural materials), not the list
// under the network background.
const archiveSpace = code('src/three/archive/space.ts')
check('archive space builder', /export\s+function\s+buildArchiveSpace/.test(archiveSpace))
check('archive space controller', /ArchiveSpaceController/.test(archiveSpace))

const archiveMaterials = code('src/three/archive/materials.ts')
check('archive materials: GLSL shaders', archiveMaterials.includes('gl_FragColor'))
check('archive materials: disposal', archiveMaterials.includes('dispose'))

const archiveLayout = code('src/three/archive/layout.ts')
check('archive layout: fragment placement', archiveLayout.includes('placeFragments'))
check('archive layout: epoch rings', archiveLayout.includes('ringsFor'))
check('archive layout: fragment lookup', archiveLayout.includes('fragmentById'))

const archiveCanvas = code('src/components/three/ArchiveSpaceCanvas.vue')
check('archive canvas builds the archive space', archiveCanvas.includes('buildArchiveSpace'))

// The platinum view either mounts the archive canvas itself or feeds the
// archive state — the same wiring, two import styles — so the check accepts
// both instead of pinning one spelling of the import.
check(
  'platinum view drives the archive space',
  /ArchiveSpaceCanvas|setArchiveStories|archiveStories/.test(
    code('src/views/PlatinumView.vue'),
  ),
)

const ambient = code('src/components/three/AmbientField.vue')
check('ambient renders the archive canvas', /<ArchiveSpaceCanvas/.test(ambient))
check('ambient keeps the network canvas', /<NetworkCanvas/.test(ambient))
check(
  'ambient: the archive takes the platinum mode',
  /mode\s*===\s*'platinum'/.test(ambient),
)

const archiveState = code('src/three/sceneState.ts')
check('archive state: story list', archiveState.includes('archiveStories'))
check('archive state: focus', archiveState.includes('focusStory'))
check('archive state: selection', archiveState.includes('selectStory'))
for (const ev of ['archive-focus', 'archive-open', 'archive-clear']) {
  check(`archive event: ${ev}`, archiveState.includes(ev))
}

// The network keeps the *distant* archive only: a handful of shared
// silhouettes and one spark cloud — never a box per story.
const networkCode = code('src/three/network.ts')
const silhouetteCap = /MAX_ARCHIVE_SILHOUETTES\s*=\s*(\d+)/.exec(networkCode)
check(
  'network: the archive detail stays decorative',
  silhouetteCap !== null && Number(silhouetteCap[1]) <= 6,
)
check('network: the stories are one shared spark cloud', networkCode.includes('setDrawRange'))

// report
const failed = results.filter((r) => !r.ok)
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`)
}
if (failed.length) {
  console.error(`\nverify:3d FAILED — ${failed.length}/${results.length} checks missing`)
  console.error('Required 3D pieces were removed or rewired — see list above.')
  process.exit(1)
}
console.log(`\nverify:3d OK — ${results.length} structural 3D checks passed`)

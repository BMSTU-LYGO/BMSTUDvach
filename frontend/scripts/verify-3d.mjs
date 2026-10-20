#!/usr/bin/env node
/**
 * verify:3d — structural guard for the REAL3D plan (item 7).
 *
 * Static checks only (no browser): verifies that the required Three.js /
 * WebGL pieces exist and are wired, and FAILs (exit 1) if any of them has
 * been removed or silently degraded to plain DOM.
 *
 * Every check reads *code*, never a comment: a guard that a commented-out
 * line can satisfy is a decoration, not a guard. The helpers below strip
 * the comments of a file before it is inspected, and the checks that look
 * for a piece of the archive ask for a call, an export or a declaration —
 * not for a word that happens to appear in the file.
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
 * Source of a file with the comments stripped out. Every check of this
 * script reads the code of a file, never its comments: a check that a
 * commented-out line can satisfy is not a guard, it is a decoration.
 */
function code(path) {
  const src = file(path)
  if (src === null) return ''
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
}

function check(name, cond) {
  results.push({ name, ok: !!cond })
}

/** Whether the source really calls the function (and not only names it). */
function calls(src, name) {
  return new RegExp(`\\b${name}\\s*\\(`).test(src)
}

/** Whether the source exports the function. */
function exported(src, name) {
  return new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`).test(src)
}

/** Every name of a list is mentioned in the text. */
function mentionsAll(text, names) {
  return names.every((name) => new RegExp(`\\b${name}\\b`).test(text))
}

/**
 * The handle the archive space hands back: the object literal it returns
 * with the story API in it.
 */
function returnedController(src) {
  const matches = [...src.matchAll(/return\s*\{([^}]*)\}/g)]
    .map((match) => match[1])
    .filter((body) => /\bsetStories\b/.test(body))
  return matches.length ? matches[matches.length - 1] : ''
}

// 1. dependencies & build config
const pkg = JSON.parse(file('package.json') ?? '{}')
check('three is a runtime dependency', pkg.dependencies?.three)
check(
  'verify:3d npm script exists',
  pkg.scripts?.['verify:3d']?.includes('verify-3d'),
)
const vite = code('vite.config.ts')
check('three is split into its own chunk', /manualChunks[\s\S]*three:\s*\['three'\]/.test(vite))

// 2. scene lifecycle guard (no silent WebGL crashes / leaks)
const scene = code('src/composables/useThreeScene.ts')
check('useThreeScene exists', scene.length > 0)
check('lazy three import', scene.includes("import('three')"))
check('context budget present', scene.includes('MAX_ACTIVE_CONTEXTS'))
check('renderer disposal', scene.includes('renderer.dispose()'))
check('visibility pause', scene.includes('visibilitychange'))
check('IntersectionObserver pause', scene.includes('IntersectionObserver'))
check('FPS degradation', scene.includes('degrade('))

// 3. single route-aware scene state (item 1)
const state = code('src/three/sceneState.ts')
const sceneModeUnion = /export\s+type\s+SceneMode\s*=([^;]*);/.exec(state)
for (const mode of ['home', 'board', 'thread', 'platinum', 'error']) {
  check(
    `scene mode: ${mode}`,
    sceneModeUnion !== null && sceneModeUnion[1].includes(`'${mode}'`),
  )
}
check('scene event bus', state.includes('onSceneEvent') && state.includes('emitSceneEvent'))

const network = code('src/three/network.ts')
check('network scene builder', exported(network, 'buildNetwork'))
check('network: board nodes', calls(network, 'setBoards'))
check('network: signal pulses', calls(network, 'pulseAt'))
check('network: reply packets', calls(network, 'sendReply'))
check('network: archive rings', network.includes('TorusGeometry'))
check('network: archive fragments', calls(network, 'setStoryCount'))
check('network: lost node (404)', network.includes('lostNode'))
check('network: hover raycast', network.includes('Raycaster'))

const netCanvas = code('src/components/three/NetworkCanvas.vue')
check('persistent NetworkCanvas', calls(netCanvas, 'buildNetwork'))

const router = code('src/router/index.ts')
for (const sceneMode of ['home', 'board', 'thread', 'platinum', 'error']) {
  check(`route meta scene: ${sceneMode}`, router.includes(`scene: '${sceneMode}'`))
}
check('route → scene binding', calls(code('src/composables/useRouteScene.ts'), 'setSceneMode'))

// 4. board card ↔ node link (item 2)
const card = code('src/components/ui/BoardCard3D.vue')
check('card hover highlights node', calls(card, 'highlightBoard'))
check('card click emits pulse', /emitSceneEvent\(\{\s*type:\s*'pulse'/.test(card))

// 5. shader route warps (item 3)
const warps = code('src/three/warps.ts')
check('warp shader (GLSL fragment)', warps.includes('gl_FragColor'))
for (const kind of ['signal', 'tunnel', 'fracture']) {
  check(`warp kind: ${kind}`, warps.includes(`'${kind}'`))
}
check(
  'warp canvas overlay',
  calls(code('src/components/three/WarpCanvas.vue'), 'makeWarpMaterial'),
)

// 6. platinum archive (item 4)
const platinum = code('src/views/PlatinumView.vue')
check('platinum feeds archive', calls(platinum, 'setStoryCount'))
check('platinum fetches stories', calls(platinum, 'listPlatinumStories'))

// 7. thread reply signal (item 6)
const thread = code('src/views/ThreadView.vue')
check('new reply emits signal', /emitSceneEvent\(\{\s*type:\s*'reply'\s*\}\)/.test(thread))
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
const crt = code('src/composables/useCRT.ts')
check('CRT is opt-in (off by default)', crt.includes("getItem(STORAGE_KEY) === 'true'"))
const home = code('src/views/HomeView.vue')
check('hero has no forced scanlines', !home.includes('ScanlineOverlay'))
check('hero keeps engineering grid', home.includes('GridPattern'))

// 10. the platinum archive space — the platinum route renders a scene of its
// own (epoch rings, one plate per story, procedural materials) instead of
// the list under the background of the network.
//
// 10.1 the scene graph
const archiveSpace = code('src/three/archive/space.ts')
check('archive space: the scene builder is exported', exported(archiveSpace, 'buildArchiveSpace'))
check(
  'archive space: the builder takes the three module as an argument',
  /buildArchiveSpace\s*\(\s*three:\s*ThreeModule/.test(archiveSpace),
)
check('archive space: the scene is built of its own', /new\s+three\.Scene\(\)/.test(archiveSpace))
check(
  'archive space: the camera is a rig of the scene',
  /new\s+three\.PerspectiveCamera\(/.test(archiveSpace),
)
check(
  'archive space: every plate carries the id of its story',
  /userData\.storyId\s*=/.test(archiveSpace),
)
check(
  'archive space: the scene owns a uniform bank of its own',
  calls(archiveSpace, 'createArchiveUniforms'),
)
check(
  'archive space: the scene gives every material back',
  calls(archiveSpace, 'disposeArchiveMaterials'),
)
check(
  'archive space: the scene gives every geometry back',
  /\bgeometry\.dispose\(\)/.test(archiveSpace),
)
check(
  'archive space: the camera rig needs no orbit controls',
  !archiveSpace.includes('OrbitControls'),
)
const archiveController = returnedController(archiveSpace)
check(
  'archive space: the controller drives the stories',
  mentionsAll(archiveController, ['setStories', 'update', 'dispose']),
)
check(
  'archive space: the controller drives the camera and the pointer',
  mentionsAll(archiveController, [
    'focus',
    'travelToFocus',
    'releaseFocus',
    'openStory',
    'setPointer',
    'pointerStoryId',
    'orbitBy',
  ]),
)

// 10.2 the pure layout — the placement of the fragments
const archiveLayout = code('src/three/archive/layout.ts')
check('archive layout: the fragment placement is exported', exported(archiveLayout, 'placeFragments'))
check('archive layout: the epoch rings are exported', exported(archiveLayout, 'ringsFor'))
check('archive layout: the fragment lookup is exported', exported(archiveLayout, 'fragmentById'))
check('archive layout: the whole layout is built in one pass', exported(archiveLayout, 'archiveLayout'))
check(
  'archive layout: the rings are grouped by publication year',
  /getFullYear\(\)/.test(archiveLayout),
)
check(
  'archive layout: the fragment budget is a hard cap',
  /const\s+DEFAULT_MAX_FRAGMENTS\s*=\s*\d+/.test(archiveLayout),
)
check(
  'archive layout: the budget keeps the lowest ids of the archive',
  /limit\s*<\s*stories\.length/.test(archiveLayout),
)

// 10.3 the procedural materials
const archiveMaterials = code('src/three/archive/materials.ts')
for (const factory of [
  'fragmentMaterial',
  'ringMaterial',
  'vaultMaterial',
  'dustMaterial',
  'emptyHaloMaterial',
]) {
  check(`archive materials: ${factory} is exported`, exported(archiveMaterials, factory))
}
check(
  'archive materials: every fragment stage writes gl_FragColor',
  (archiveMaterials.match(/gl_FragColor/g) ?? []).length >= 5,
)
check(
  'archive materials: the core uniform contract is declared',
  mentionsAll(archiveMaterials, ['uTime', 'uFocus', 'uDim']),
)
check(
  'archive materials: a scene can own a bank of its own',
  exported(archiveMaterials, 'createArchiveUniforms'),
)
check(
  'archive materials: the disposal of the materials is exported',
  exported(archiveMaterials, 'disposeArchiveMaterials'),
)
check(
  'archive materials: the disposal gives the textures back',
  /TEXTURE_SLOTS/.test(archiveMaterials) && /texture\.dispose\(\)|texture\)\.dispose\(\)/.test(archiveMaterials),
)
check(
  'archive materials: the shaders stay inside GLSL ES 1.00',
  !archiveMaterials.includes('#define') &&
    !archiveMaterials.includes('texture(') &&
    !archiveMaterials.includes('invert('),
)

// 10.4 the canvas — the thin wrapper around the scene
const archiveCanvas = code('src/components/three/ArchiveSpaceCanvas.vue')
check('archive canvas: the archive space is built', calls(archiveCanvas, 'buildArchiveSpace'))
check(
  'archive canvas: the stories come from the scene state',
  /sceneState\.archiveStories/.test(archiveCanvas),
)
check(
  'archive canvas: the focus comes from the scene state',
  /sceneState\.focusedStory/.test(archiveCanvas),
)
check('archive canvas: the archive events are listened to', calls(archiveCanvas, 'onSceneEvent'))
for (const ev of ['archive-focus', 'archive-open', 'archive-clear']) {
  check(`archive canvas: the event ${ev} is handled`, archiveCanvas.includes(`'${ev}'`))
}
check(
  'archive canvas: the canvas is hidden from the screen reader',
  /aria-hidden="true"/.test(archiveCanvas),
)
check(
  'archive canvas: the register of the archive is read',
  archiveCanvas.includes('bmstudvach-archive-3d'),
)

// 10.5 the route switch — the archive takes the layer on the platinum route
const ambient = code('src/components/three/AmbientField.vue')
check(
  'ambient: the archive takes the platinum mode',
  /mode\s*===\s*'platinum'/.test(ambient),
)
check(
  'ambient: the archive canvas comes first',
  /<ArchiveSpaceCanvas[^>]*\/>[\s\S]*?<NetworkCanvas[^>]*v-else-if/.test(ambient),
)
check(
  'ambient: the network canvas keeps the other routes',
  /<NetworkCanvas[^>]*v-else-if/.test(ambient),
)
check(
  'ambient: the canvas2d field is the last resort',
  /<ParticleField[^>]*v-else/.test(ambient),
)

// 10.6 the archive state — the single source of truth of the space
const archiveState = code('src/three/sceneState.ts')
check('archive state: the story list is a field', /archiveStories\s*:/.test(archiveState))
check('archive state: the focus is a field', /focusedStory\s*:/.test(archiveState))
check('archive state: the selection is a field', /selectedStory\s*:/.test(archiveState))
check('archive state: the stories are set', exported(archiveState, 'setArchiveStories'))
check('archive state: the focus is set', exported(archiveState, 'focusStory'))
check('archive state: the selection is set', exported(archiveState, 'selectStory'))
check(
  'archive state: a focus outside the new set is dropped',
  /!ids\.has\(sceneState\.focusedStory\)/.test(archiveState),
)
check(
  'archive state: a selection outside the new set is dropped',
  /!ids\.has\(sceneState\.selectedStory\)/.test(archiveState),
)
for (const ev of ['archive-focus', 'archive-open', 'archive-clear']) {
  check(`archive event: ${ev}`, new RegExp(`type:\\s*'${ev}'`).test(archiveState))
}

// 10.7 the consumers — the list and the story view
const platinumView = code('src/views/PlatinumView.vue')
// The archive is fed with the stories of the page — not only with the empty
// list of the "the archive is loading" moment.
const archiveFeeds = [...platinumView.matchAll(/setArchiveStories\(([^)]*)\)/g)].map((m) =>
  m[1].trim(),
)
check(
  'platinum view: the archive is fed with the loaded stories',
  archiveFeeds.some((arg) => arg !== '' && arg !== '[]'),
)
check('platinum view: the focus follows the row', calls(platinumView, 'focusStory'))
check('platinum view: the opened story is selected', calls(platinumView, 'selectStory'))
check(
  'platinum view: the space is told about the focus',
  /emitSceneEvent\(\{\s*type:\s*'archive-focus'/.test(platinumView),
)
check(
  'platinum view: the space is told about the opening',
  /emitSceneEvent\(\{\s*type:\s*'archive-open'/.test(platinumView),
)
check(
  'platinum view: the space is told about the clear',
  /emitSceneEvent\(\{\s*type:\s*'archive-clear'/.test(platinumView),
)
check(
  'platinum view: the rows carry the id of their story',
  /data-story-id/.test(platinumView),
)
check(
  'platinum view: the rows keep their test id',
  platinumView.includes('data-testid="fragment-row"'),
)
check(
  'platinum view: the register of the archive is remembered',
  platinumView.includes('bmstudvach-archive-3d'),
)
check('platinum view: the register announces its state', /aria-pressed/.test(platinumView))
check('platinum view: the archive speaks to the reader', /aria-live/.test(platinumView))

const platinumStoryView = code('src/views/PlatinumStoryView.vue')
check(
  'platinum story view: the story opens in the space',
  calls(platinumStoryView, 'selectStory') &&
    calls(platinumStoryView, 'focusStory') &&
    /emitSceneEvent\(\{\s*type:\s*'archive-open'/.test(platinumStoryView),
)
check(
  'platinum story view: the story closes back into the archive',
  /selectStory\(null\)/.test(platinumStoryView) &&
    /emitSceneEvent\(\{\s*type:\s*'archive-clear'/.test(platinumStoryView),
)
check(
  'platinum story view: the reading surface keeps its test id',
  platinumStoryView.includes('data-testid="platinum-story"'),
)

// 10.8 the route binding — the platinum route opens the archive mode
const routeScene = code('src/composables/useRouteScene.ts')
check(
  'route scene: the platinum route opens the archive mode',
  /case\s+'platinum':[\s\S]{0,120}?setSceneMode\(\s*mode\s*\)/.test(routeScene),
)

// 10.9 the network keeps its distance — the archive of the network is a
// distant background, never a plate per story
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

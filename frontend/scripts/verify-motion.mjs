#!/usr/bin/env node
/**
 * verify:motion — structural guard for the motion system (PLAN item M-T13).
 *
 * The art law of the product ("editorial archive") is only worth something
 * while it is enforced: paper does not jump, a hover does not grow, a
 * transition does not animate "everything", every motion has a token and
 * every moving thing has a static twin for reduced-motion.
 *
 * Every check of this script reads *code*: the comments of a file are blanked
 * out before it is inspected, so a guard that a commented-out line can
 * satisfy is a decoration, not a guard.
 *
 * Two kinds of rules live here:
 *   - hard rules: the system must hold them, a new violation fails the build;
 *   - waived rules: the debt that is already on the books (see WAIVERS).
 *     A waiver excuses ONE known violation in ONE file, is printed in the
 *     "motion debt" report with a reason, and stops being an excuse the
 *     moment the violation is gone — so the debt can be paid off instead of
 *     being quietly forgotten.
 *
 * Usage:
 *   node scripts/verify-motion.mjs          # the checks
 *   node scripts/verify-motion.mjs --debt   # only the open debt (for M-T14)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..') // frontend/
const srcRoot = join(root, 'src')

const results = []
const details = []
const debt = []

function file(path) {
  const full = join(root, path)
  if (!existsSync(full)) return null
  return readFileSync(full, 'utf8')
}

/**
 * The source of a file with its comments blanked out. The blanks keep the
 * length of the text, so the offset of a finding still points at the real
 * line of the real file.
 */
function blankComments(src, kind) {
  let out = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
  // `//` is a comment only in scripts; in CSS and in a template it can be a
  // part of a URL, so it is cut out of the scripts alone.
  if (kind === 'script') {
    out = out.replace(
      /(^|[^:])\/\/[^\n]*/g,
      (m, p1) => p1 + m.slice(p1.length).replace(/[^\n]/g, ' '),
    )
  }
  return out
}

/** The source of a file with its comments cut out — the code, not the words. */
function code(path) {
  const src = file(path)
  if (src === null) return ''
  return blankComments(
    src,
    path.endsWith('.ts') || path.endsWith('.mjs') ? 'script' : 'style',
  )
}

function check(name, cond) {
  results.push({ name, ok: !!cond })
}

/** Whether the source really exports the function (and not only names it). */
function exported(src, name) {
  return new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`).test(src)
}

// ---------------------------------------------------------------------------
// the open debt of the motion system
//
// Every entry names ONE file and ONE shape of the violation. A waiver is not
// a permission to keep writing new violations in the file: a violation that
// does not match the pattern is not waived and fails the check.
//
// The reasons say WHO can pay the debt off:
//   - "in the M-T14 allow-list"   — M-T14 replaces it with a semantic token;
//   - "out of the M-T14 allow-list" — the file is protected, it needs a
//     decision of its own;
//   - "the plan does not reach the file" — the allow-list of M-T14 has to be
//     extended, otherwise the debt can never be closed.
// ---------------------------------------------------------------------------

/** A file that M-T14 may touch: the composer and the thread layers, plus the
 *  files that were reworked in M-T5..M-T7 and M-T10..M-T12. */
const M_T14_SCOPE =
  'the file is in the M-T14 allow-list — M-T14 replaces the timing with a semantic token'
/** A file that M-T14 may not touch. */
const PROTECTED_SCOPE =
  'the file is explicitly out of the M-T14 allow-list — it needs a decision of its own'
/** A file that no task of the plan touches. */
const ORPHAN_SCOPE =
  'no task of the plan reaches the file — the M-T14 allow-list has to be extended, otherwise the debt stays forever'

const WAIVERS = {
  // The timing that was written by hand: a duration that is not a token, a
  // curve that is not a token, a keyword easing in place of a role.
  rawTiming: [
    {
      file: 'src/components/composer/AttachmentCapsule.vue',
      pattern: /^animation:\s*capsule-arrive\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/AttachmentCapsule.vue',
      pattern: /^transition:\s*opacity\s+160ms/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/AttachmentRail.vue',
      pattern: /^transition:\s*opacity\s+220ms/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/AttachmentRail.vue',
      pattern: /^animation:\s*fiber-stretch\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/AttachmentRail.vue',
      pattern: /^animation:\s*socket-open\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/AttachmentRail.vue',
      pattern: /^animation:\s*magnet-breathe\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/CommandLens.vue',
      pattern: /^animation:\s*lens-caret\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/CommandLens.vue',
      pattern: /^transition:\s*opacity\s+160ms/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/ContextFiber.vue',
      pattern: /^animation:\s*fiber-flow\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/DraftBeacon.vue',
      pattern: /^animation:\s*beacon-blink\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/IdentityCapsule.vue',
      pattern: /^transition:\s*color\s+160ms/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/SignalMeter.vue',
      pattern: /^transition:\s*background\s+200ms/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/SignalMeter.vue',
      pattern: /^animation:\s*broken-line\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/SignalSurface.vue',
      pattern: /^transition:\s*color\s+200ms/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/TransmitControl.vue',
      pattern: /^animation:\s*break-ring\s/,
      reason:
        'the shorthand is invalid CSS: the role already carries a curve, the extra ease-in-out breaks the declaration and the ring never breaks — M-T14 has to write one role',
    },
    {
      file: 'src/components/composer/TransmitControl.vue',
      pattern: /^animation:\s*charge-spin\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/TransmitNotice.vue',
      pattern: /^transition:\s*border-color\s+160ms/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/composer/TransmitNotice.vue',
      pattern: /^animation:\s*notice-in\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/home/MentionsBeacon.vue',
      pattern: /^--ease-out\s*:/,
      reason: ORPHAN_SCOPE,
    },
    {
      file: 'src/components/home/TelemetryRail.vue',
      pattern: /^--ease-out\s*:/,
      reason: ORPHAN_SCOPE,
    },
    {
      file: 'src/components/launch/LaunchBay.vue',
      pattern: /^animation:\s*bay-fade-in\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/composables/useTilt.ts',
      pattern: /^style\.transition\s*=/,
      reason:
        'the tilt writes the timing inline, because the speed is a parameter of the hook; the composables are not in the M-T14 allow-list',
    },
    {
      file: 'src/components/platinum/ArchiveEmpty.vue',
      pattern: /^animation:\s*archive-orbit\s/,
      reason: PROTECTED_SCOPE,
    },
    {
      file: 'src/components/report/ReasonConstellation.vue',
      pattern: /^transition:\s*stroke\s+220ms/,
      reason: ORPHAN_SCOPE,
    },
    {
      file: 'src/components/report/ReasonConstellation.vue',
      pattern: /^transition:\s*border-color\s+200ms/,
      reason:
        'the declaration carries a hand-written cubic-bezier next to a hand-written duration — the constellation has no role of its own yet',
    },
    {
      file: 'src/components/report/ReasonConstellation.vue',
      pattern: /^transition:\s*opacity\s+160ms/,
      reason: ORPHAN_SCOPE,
    },
    {
      file: 'src/components/scan/ScanLens.vue',
      pattern: /^animation:\s*scan-spin\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/thread/LoadMoreNode.vue',
      pattern: /^animation:\s*load-more-pulse\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/thread/RuleSheet.vue',
      pattern: /^transition:\s*height\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/thread/RuleSheet.vue',
      pattern: /^transition:\s*grid-template-rows\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/thread/RuleSheet.vue',
      pattern: /^animation:\s*rule-sheet-unveil\s/,
      reason: M_T14_SCOPE,
    },
    {
      file: 'src/components/ui/GlitchText.vue',
      pattern: /^animation:\s*glitch-before\s/,
      reason: ORPHAN_SCOPE,
    },
    {
      file: 'src/components/ui/GlitchText.vue',
      pattern: /^animation:\s*glitch-after\s/,
      reason: ORPHAN_SCOPE,
    },
    {
      file: 'src/components/ui/GlitchText.vue',
      pattern: /^animation:\s*glitch-main\s/,
      reason: ORPHAN_SCOPE,
    },
    {
      file: 'src/views/BoardView.vue',
      pattern: /^transition:\s*opacity\s+320ms/,
      reason: ORPHAN_SCOPE,
    },
    {
      file: 'src/views/PlatinumView.vue',
      pattern: /^animation:\s*pulseIdle\s/,
      reason: PROTECTED_SCOPE,
    },
    {
      file: 'src/views/PlatinumView.vue',
      pattern: /^animation:\s*archive-pulse\s/,
      reason: PROTECTED_SCOPE,
    },
  ],
  // A hover that grows the element: the element that is scaled is a tile of
  // the interface, not a sheet of paper.
  hoverScale: [
    {
      file: 'src/components/report/ReasonConstellation.vue',
      pattern: /^transform:\s*scale\(/,
      reason: ORPHAN_SCOPE,
    },
  ],
  // The name of a keyframe must belong to one file only.
  duplicateKeyframes: [
    {
      file: 'src/components/EmptyState.vue',
      pattern: /^state-(scan|live|rise)$/,
      reason:
        'the three states share the names of their keyframes; Vue scopes them at runtime, but the names must become unique in the source',
    },
    {
      file: 'src/components/ErrorState.vue',
      pattern: /^state-(scan|live)$/,
      reason:
        'the three states share the names of their keyframes; Vue scopes them at runtime, but the names must become unique in the source',
    },
    {
      file: 'src/components/LoadingState.vue',
      pattern: /^state-(scan|live|rise)$/,
      reason:
        'the three states share the names of their keyframes; Vue scopes them at runtime, but the names must become unique in the source',
    },
  ],
  // A layer that is promoted for good and never demoted.
  eternalWillChange: [
    {
      file: 'src/components/thread/ThreadProgress.vue',
      pattern: /^will-change/,
      reason: M_T14_SCOPE,
    },
  ],
  // The palette is defined once, in main.css.
  localPalette: [
    {
      file: 'src/components/home/MentionsBeacon.vue',
      pattern:
        /^--(paper|paper-raised|paper-sunken|ink|ink-secondary|ink-tertiary|rule|accent|accent-hover|danger|success)\s*:/,
      reason: ORPHAN_SCOPE,
    },
    {
      file: 'src/components/home/TelemetryRail.vue',
      pattern:
        /^--(paper|paper-raised|paper-sunken|ink|ink-secondary|ink-tertiary|rule|accent|accent-hover|danger|success)\s*:/,
      reason: ORPHAN_SCOPE,
    },
  ],
}

// ---------------------------------------------------------------------------
// reading the sources
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(relative(root, full).split(/[\\/]/).join('/'))
  }
  return out
}

/** Every source of the app — the tests are excluded: they describe the rules,
 *  they are not the code the rules are about. */
const sources = walk(srcRoot).filter(
  (p) => !p.includes('/__tests__/') && !/\.(spec|test)\./.test(p),
)
const styleFiles = sources.filter((p) => /\.(vue|css)$/.test(p))

/** The <style> blocks of a component (or the whole file of a stylesheet),
 *  each with the offset of the block inside the file. */
function styleBlocks(path, src) {
  if (path.endsWith('.css')) return [{ text: src, offset: 0 }]
  const blocks = []
  for (const m of src.matchAll(/<style[^>]*>/g)) {
    const start = m.index + m[0].length
    const end = src.indexOf('</style>', start)
    if (end === -1) continue
    blocks.push({ text: src.slice(start, end), offset: start })
  }
  return blocks
}

function matchBrace(src, open) {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** The rules of a stylesheet: the selector, the body and where the body
 *  starts, so a finding can be pointed at a real line. */
function parseRules(css, base = 0) {
  const rules = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open === -1) break
    const close = matchBrace(css, open)
    if (close === -1) break
    const prelude = css.slice(i, open).trim()
    const body = css.slice(open + 1, close)
    if (prelude.startsWith('@')) {
      for (const r of parseRules(body, base + open + 1))
        rules.push({ ...r, at: prelude })
    } else {
      rules.push({ selector: prelude, body, bodyOffset: base + open + 1 })
    }
    i = close + 1
  }
  return rules
}

/** The declarations of a rule body. */
function parseDecls(body) {
  const out = []
  for (const m of body.matchAll(/([-\w]+)\s*:\s*([^;{}]+)/g)) {
    out.push({
      prop: m[1],
      value: m[2].trim().replace(/\s+/g, ' '),
      offset: m.index,
    })
  }
  return out
}

function lineAt(src, offset) {
  let line = 1
  for (let i = 0; i < offset && i < src.length; i++) if (src[i] === '\n') line++
  return line
}

/** The whole parsed stylesheet of a file: the rules with their declarations,
 *  the raw text (comments blanked) and the offsets to report lines. */
function readStyles(path) {
  const raw = file(path)
  if (raw === null) return null
  const src = blankComments(raw, 'style')
  const blocks = styleBlocks(path, src)
  const rules = []
  for (const block of blocks) {
    for (const rule of parseRules(block.text, block.offset)) {
      rules.push({ ...rule, declarations: parseDecls(rule.body) })
    }
  }
  return { path, src, rules }
}

const styles = styleFiles.map(readStyles).filter(Boolean)

/** The declaration as it is written in the source — one line, no noise. */
function declarationText(decl) {
  return `${decl.prop}: ${decl.value}`
}

/** A finding of the motion debt: where it is and what it says. */
function finding(path, src, offset, text) {
  return { file: path, line: lineAt(src, offset), text }
}

/** Whether a finding is already on the books of the debt. */
function isWaived(group, item) {
  const list = WAIVERS[group] ?? []
  return list.some((w) => w.file === item.file && w.pattern.test(item.text))
}

/** The reason of the waiver that excuses the finding. */
function waiverReason(group, item) {
  const list = WAIVERS[group] ?? []
  const hit = list.find((w) => w.file === item.file && w.pattern.test(item.text))
  return hit?.reason ?? ''
}

/**
 * Report a group of the debt: the violations that are not waived fail the
 * check, the waived ones are printed as the open debt of the system. One
 * declaration can break two rules at once (a raw duration AND a raw curve),
 * so the debt of a line is counted once.
 */
function report(group, name, items) {
  const open = items.filter((item) => !isWaived(group, item))
  const waived = items.filter((item) => isWaived(group, item))
  check(name, open.length === 0)
  const anchor = results.length - 1
  for (const item of open) {
    details.push({ anchor, text: `    ${item.file}:${item.line}  ${item.text}` })
  }
  for (const item of waived) {
    const key = `${item.file}:${item.line}:${item.text}`
    const known = debt.find((d) => d.key === key)
    if (known) {
      known.groups.add(group)
      continue
    }
    debt.push({
      ...item,
      key,
      groups: new Set([group]),
      reason: waiverReason(group, item),
    })
  }
  return open
}

// ---------------------------------------------------------------------------
// 1. the motion layer is wired
// ---------------------------------------------------------------------------

const pkg = JSON.parse(file('package.json') ?? '{}')
check(
  'verify:motion npm script exists',
  pkg.scripts?.['verify:motion']?.includes('verify-motion'),
)

const main = code('src/main.ts')
check(
  'motion styles: motion.css is imported',
  /import\s+['"][^'"]*motion\.css['"]/.test(main),
)
check(
  'motion styles: material.css is imported',
  /import\s+['"][^'"]*material\.css['"]/.test(main),
)

// ---------------------------------------------------------------------------
// 2. the tokens of the motion system
// ---------------------------------------------------------------------------

const motionCss = code('src/assets/motion.css')
const materialCss = code('src/assets/material.css')

for (const role of ['hover', 'press', 'reveal', 'kinetic', 'magnetic', 'cinematic']) {
  check(
    `motion role: --motion-${role} is declared`,
    new RegExp(`--motion-${role}\\s*:`).test(motionCss),
  )
}
for (const curve of ['standard', 'emphasized', 'entrance', 'exit']) {
  check(
    `motion curve: --ease-${curve} is declared`,
    new RegExp(`--ease-${curve}\\s*:`).test(motionCss),
  )
}
check(
  'motion curves: the legacy aliases still bridge to the roles',
  ['--ease-out', '--ease-out-quart', '--ease-out-expo'].every((name) =>
    new RegExp(`${name}\\s*:`).test(motionCss),
  ),
)
for (const token of [
  '--material-shadow-1',
  '--material-shadow-2',
  '--material-edge',
  '--material-ink',
]) {
  check(
    `material token: ${token} is declared`,
    new RegExp(`${token}\\s*:`).test(materialCss),
  )
}
check(
  'material layer: the reactions move by the motion roles',
  materialCss.includes('var(--motion-hover)') &&
    materialCss.includes('var(--motion-press)'),
)

// ---------------------------------------------------------------------------
// 3. the law of the material
// ---------------------------------------------------------------------------

// 3.1 `transition: all` — the trash bin of the animations: it animates the
// properties nobody asked to animate and breaks the ones that were.
const transitionAll = []
for (const style of styles) {
  for (const rule of style.rules) {
    for (const decl of rule.declarations) {
      if (
        (decl.prop === 'transition' || decl.prop === 'transition-property') &&
        /^all\b/.test(decl.value)
      ) {
        transitionAll.push(
          finding(
            style.path,
            style.src,
            rule.bodyOffset + decl.offset,
            declarationText(decl),
          ),
        )
      }
    }
  }
}
// 3.2 raw durations and raw curves — the motion roles exist exactly so that
// a duration is never a number typed by hand. The delays are left alone: a
// stagger step is a rhythm, not a duration of the surface.
const MOTION_PROP = /^(transition|animation)(-|$)/
const DELAY_PROP = /^(transition|animation)-delay$/
const rawDuration = []
const rawEasing = []
for (const style of styles.filter((s) => s.path.endsWith('.vue'))) {
  for (const rule of style.rules) {
    for (const decl of rule.declarations) {
      const offset = rule.bodyOffset + decl.offset
      const isMotion = MOTION_PROP.test(decl.prop) && !DELAY_PROP.test(decl.prop)
      // a duration that hides inside a var() is a token with a safety net
      const bare = decl.value.replace(/var\([^)]*\)/g, ' var() ')
      if (isMotion && /\b\d+(\.\d+)?m?s\b/.test(bare)) {
        rawDuration.push(finding(style.path, style.src, offset, declarationText(decl)))
      }
      // a curve that hides inside a var() is a token; a curve written by hand
      // is a decision that belongs to the system, not to the component
      if (decl.value.includes('cubic-bezier(')) {
        rawEasing.push(finding(style.path, style.src, offset, declarationText(decl)))
      } else if (isMotion) {
        const timings = bare
          .replace(/steps\([^)]*\)/g, ' ')
          .replace(/cubic-bezier\([^)]*\)/g, ' ')
        if (/\b(ease-in-out|ease-in|ease-out|ease|linear)(?![\w-])/.test(timings)) {
          rawEasing.push(finding(style.path, style.src, offset, declarationText(decl)))
        }
      }
    }
  }
}
report('rawTiming', 'law: no raw durations in components', rawDuration)
report('rawTiming', 'law: no raw easing curves in components', rawEasing)

// 3.3 the timing written by hand inside a script — an inline style is still
// a style, so the roles of the motion system apply to it too.
const rawScriptDuration = []
const rawScriptEasing = []
for (const path of sources.filter((p) => p.endsWith('.ts'))) {
  const src = code(path)
  for (const m of src.matchAll(/style\.(transition|animation)\w*\s*=\s*([^\n;]+)/g)) {
    const value = m[2].trim()
    const text = `style.${m[1]} = ${value}`
    if (/(?:\$\{[^}]*\}|\b\d[\d.]*)\s*(?:ms|s)\b/.test(value)) {
      rawScriptDuration.push(finding(path, src, m.index, text))
    }
    if (value.includes('cubic-bezier(')) {
      rawScriptEasing.push(finding(path, src, m.index, text))
    }
    if (/^all\b/.test(value)) {
      transitionAll.push(finding(path, src, m.index, text))
    }
  }
}
report('rawTiming', 'law: no raw durations in scripts', rawScriptDuration)
report('rawTiming', 'law: no raw easing curves in scripts', rawScriptEasing)

report('transitionAll', 'law: no transition animates "all"', transitionAll)

// 3.4 a hover that grows — the element that is scaled on hover is a tile of
// the interface, not a sheet of paper. A line may grow (scaleX/scaleY), the
// element may not.
const hoverScale = []
for (const style of styles.filter((s) => s.path.endsWith('.vue'))) {
  for (const rule of style.rules) {
    if (!rule.selector.includes(':hover')) continue
    for (const decl of rule.declarations) {
      if (decl.prop !== 'transform') continue
      if (!/\bscale\s*\(/.test(decl.value)) continue
      hoverScale.push(
        finding(
          style.path,
          style.src,
          rule.bodyOffset + decl.offset,
          declarationText(decl),
        ),
      )
    }
  }
}
report('hoverScale', 'law: no hover grows the element', hoverScale)

// ---------------------------------------------------------------------------
// 4. the keyframes of the system
// ---------------------------------------------------------------------------

const keyframes = new Map()
for (const style of styles) {
  for (const m of style.src.matchAll(/@keyframes\s+([\w-]+)/g)) {
    const name = m[1]
    if (!keyframes.has(name)) keyframes.set(name, [])
    keyframes.get(name).push(finding(style.path, style.src, m.index, name))
  }
}
const duplicateKeyframes = []
for (const [, found] of keyframes) {
  const files = new Set(found.map((f) => f.file))
  if (files.size < 2) continue
  duplicateKeyframes.push(...found)
}
report('duplicateKeyframes', 'law: no keyframe name is used twice', duplicateKeyframes)

// ---------------------------------------------------------------------------
// 5. the primitives of the motion system
// ---------------------------------------------------------------------------

const useMotion = code('src/composables/useMotion.ts')
for (const hook of ['usePointerLight', 'useMagnetic', 'usePress', 'useMotionEnabled']) {
  check(`motion primitive: ${hook} is exported`, exported(useMotion, hook))
}
check(
  'motion primitive: the kinetic typography exists',
  existsSync(join(srcRoot, 'components/ui/KineticText.vue')),
)

// ---------------------------------------------------------------------------
// 6. the performance and the a11y of the motion
// ---------------------------------------------------------------------------

// 6.1 will-change forever — a promoted layer that is never demoted keeps the
// memory of the browser busy for nothing.
const eternalWillChange = []
for (const style of styles) {
  const promotions = []
  for (const rule of style.rules) {
    for (const decl of rule.declarations) {
      if (decl.prop === 'will-change') {
        promotions.push({ decl, offset: rule.bodyOffset + decl.offset })
      }
    }
  }
  if (promotions.length === 0) continue
  const released = promotions.some((p) =>
    /^(auto|unset|initial|revert)\b/.test(p.decl.value),
  )
  if (released) continue
  for (const promotion of promotions) {
    eternalWillChange.push(
      finding(style.path, style.src, promotion.offset, declarationText(promotion.decl)),
    )
  }
}
report('eternalWillChange', 'perf: no will-change that never ends', eternalWillChange)

// 6.2 the palette is defined once — a local copy of the colours is a second
// truth about the paper of the product.
const PALETTE_TOKENS = new Set([
  '--paper',
  '--paper-raised',
  '--paper-sunken',
  '--ink',
  '--ink-secondary',
  '--ink-tertiary',
  '--rule',
  '--accent',
  '--accent-hover',
  '--danger',
  '--success',
])
const localPalette = []
for (const style of styles.filter((s) => s.path.endsWith('.vue'))) {
  for (const rule of style.rules) {
    for (const decl of rule.declarations) {
      if (!PALETTE_TOKENS.has(decl.prop)) continue
      localPalette.push(
        finding(
          style.path,
          style.src,
          rule.bodyOffset + decl.offset,
          declarationText(decl),
        ),
      )
    }
  }
}
report('localPalette', 'law: the palette is defined once, in main.css', localPalette)

// 6.3 reduced motion — everything that moves needs a static twin for the
// people who asked the system to stand still.
const moves = (style) =>
  /@keyframes\s/.test(style.src) ||
  style.rules.some((rule) =>
    rule.declarations.some((decl) => /^animation(-name)?$/.test(decl.prop)),
  )

const missingGuard = styles
  .filter((s) => s.path.endsWith('.vue') && moves(s))
  .filter((s) => !/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(s.src))
check(
  'a11y: every moving component keeps a reduced-motion guard',
  missingGuard.length === 0,
)
for (const style of missingGuard) {
  details.push({
    anchor: results.length - 1,
    text: `    ${style.path}  no prefers-reduced-motion: reduce`,
  })
}

// The stylesheets of the motion system answer the same question with the
// opposite pole (`no-preference`), so both poles count as a guard there.
const missingStylesheetGuard = styles
  .filter((s) => s.path.endsWith('.css') && moves(s))
  .filter(
    (s) => !/@media\s*\(prefers-reduced-motion:\s*(reduce|no-preference)\)/.test(s.src),
  )
check(
  'a11y: every moving stylesheet keeps a reduced-motion guard',
  missingStylesheetGuard.length === 0,
)
for (const style of missingStylesheetGuard) {
  details.push({
    anchor: results.length - 1,
    text: `    ${style.path}  no prefers-reduced-motion guard`,
  })
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok)

if (process.argv.includes('--debt')) {
  console.log(`motion debt — ${debt.length} waived violations:\n`)
  for (const item of debt) {
    console.log(
      `  ${item.file}:${item.line}  ${item.text}   [${[...item.groups].join(', ')}]`,
    )
    console.log(`      ${item.reason}`)
  }
  process.exit(0)
}

for (const [index, r] of results.entries()) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`)
  if (!r.ok) {
    for (const detail of details.filter((d) => d.anchor === index))
      console.log(detail.text)
  }
}
if (debt.length) {
  console.log(`\nopen motion debt — ${debt.length} waived violations (see --debt):`)
  for (const item of debt) {
    console.log(`  ${item.file}:${item.line}  ${item.text}`)
  }
}
if (failed.length) {
  console.error(
    `\nverify:motion FAILED — ${failed.length}/${results.length} checks failed`,
  )
  console.error('The motion law was broken — see the list above.')
  process.exit(1)
}
console.log(`\nverify:motion OK — ${results.length} motion checks passed`)

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
 *     being quietly forgotten. A waiver that excuses nothing is reported as
 *     a warning: a promise that nothing keeps is a lie about the system.
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
const warnings = []

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

/**
 * The value of a declaration with every var() call blanked out — the fallback
 * included. A duration that hides inside a var() is a token with a safety
 * net; a duration written by hand is a decision of the component. The same
 * rule holds in a stylesheet and in a script: the two are read the same way.
 */
function blankVars(value) {
  let out = ''
  let i = 0
  while (i < value.length) {
    if (value.startsWith('var(', i)) {
      let depth = 0
      let j = i
      for (; j < value.length; j++) {
        if (value[j] === '(') depth++
        else if (value[j] === ')') {
          depth--
          if (depth === 0) {
            j++
            break
          }
        }
      }
      out += ' var() '
      i = j
      continue
    }
    out += value[i]
    i++
  }
  return out
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
// The reasons say WHO can pay the debt off. Every entry of the registry
// names the file, the shape of the violation and the way out of it — a
// waiver without a way out is not a waiver, it is a postponement.
// ---------------------------------------------------------------------------

const WAIVERS = {
  // The timing that was written by hand: a duration that is not a token, a
  // curve that is not a token, a keyword easing in place of a role.
  rawTiming: [],
  // A hover that grows the element: the element that is scaled is a tile of
  // the interface, not a sheet of paper.
  hoverScale: [],
  // The name of a keyframe must belong to one file only — but only when the
  // clash is real at runtime (see the keyframe check below).
  duplicateKeyframes: [],
  // A layer that is promoted for good and never demoted.
  eternalWillChange: [],
  // The palette is defined once, in main.css.
  localPalette: [],
  // A rhythm that is declared in two places is two truths about the same
  // tempo: the day one of them changes, the parts drift apart.
  rhythmDuplicates: [
    {
      file: 'src/components/EmptyState.vue',
      pattern: /^--state-(scan|rise|pulse)-cycle:/,
      reason:
        'the three states breathe in one shared rhythm under one name: the token must either move to the shared state language (motion.css) or be renamed per state — the files are out of the boundaries of M-T18b, so the choice is a human one',
    },
    {
      file: 'src/components/ErrorState.vue',
      pattern: /^--state-(scan|rise|pulse)-cycle:/,
      reason:
        'the three states breathe in one shared rhythm under one name: the token must either move to the shared state language (motion.css) or be renamed per state — the files are out of the boundaries of M-T18b, so the choice is a human one',
    },
    {
      file: 'src/components/LoadingState.vue',
      pattern: /^--state-(scan|rise|pulse)-cycle:/,
      reason:
        'the three states breathe in one shared rhythm under one name: the token must either move to the shared state language (motion.css) or be renamed per state — the files are out of the boundaries of M-T18b, so the choice is a human one',
    },
  ],
  // A rhythm that carries its own curve must NAME that curve: a keyword
  // written by hand is a decision of the component, not of the system.
  rawRhythmCurve: [
    {
      file: 'src/components/composer/ContextFiber.vue',
      pattern: /^--fiber-flow-rhythm:/,
      reason:
        'the flow of the fiber is linear and the word is written by hand; the fix is one line (var(--ease-linear)), but the composer layer is out of the boundaries of M-T18b',
    },
    {
      file: 'src/components/composer/DraftBeacon.vue',
      pattern: /^--beacon-blink-rhythm:/,
      reason:
        'the blink of the beacon is a soft curve and the word is written by hand; the fix is one line (var(--ease-soft)), but the composer layer is out of the boundaries of M-T18b',
    },
    {
      file: 'src/components/composer/TransmitControl.vue',
      pattern: /^--charge-spin-rhythm:/,
      reason:
        'the spin of the charge is linear and the word is written by hand; the fix is one line (var(--ease-linear)), but the composer layer is out of the boundaries of M-T18b',
    },
    {
      file: 'src/components/scan/ScanLens.vue',
      pattern: /^--scan-spin-rhythm:/,
      reason:
        'the spin of the instrument is linear and the word is written by hand; the fix is one line (var(--ease-linear)), but the file is out of the boundaries of M-T18b',
    },
    {
      file: 'src/components/ui/GlitchText.vue',
      pattern: /^--glitch-rhythm:/,
      reason:
        'the glitch is linear and the word is written by hand; the fix is one line (var(--ease-linear)), but the file is out of the boundaries of M-T18b',
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
 *  each with the offset of the block inside the file and whether the block is
 *  scoped: a scoped block lives in the namespace of its component, and Vue
 *  renames its keyframes with the id of that component. */
function styleBlocks(path, src) {
  if (path.endsWith('.css')) return [{ text: src, offset: 0, scoped: false }]
  const blocks = []
  for (const m of src.matchAll(/<style([^>]*)>/g)) {
    const start = m.index + m[0].length
    const end = src.indexOf('</style>', start)
    if (end === -1) continue
    blocks.push({
      text: src.slice(start, end),
      offset: start,
      scoped: /\bscoped\b/.test(m[1]),
    })
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
  return { path, src, rules, blocks }
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
  const hit = list.find((w) => w.file === item.file && w.pattern.test(item.text))
  if (hit) hit.used = true
  return !!hit
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

/** A finding that does not break the build, but must be seen. */
function warn(name, items) {
  for (const item of items) warnings.push({ name, ...item })
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
for (const curve of ['standard', 'emphasized', 'entrance', 'exit', 'linear', 'soft']) {
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
for (const rhythm of [
  'archive-orbit-slow',
  'archive-orbit-mid',
  'archive-orbit-fast',
  'archive-pulse',
  'idle-pulse',
]) {
  check(
    `motion rhythm: --motion-${rhythm} is declared`,
    new RegExp(`--motion-${rhythm}\\s*:`).test(motionCss),
  )
}
for (const token of ['--motion-tilt-duration', '--motion-tilt-ease']) {
  check(
    `motion role: ${token} is declared`,
    new RegExp(`${token}\\s*:`).test(motionCss),
  )
}
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
      const bare = blankVars(decl.value)
      if (isMotion && /\b\d+(\.\d+)?m?s\b/.test(bare)) {
        rawDuration.push(finding(style.path, style.src, offset, declarationText(decl)))
      }
      // a curve that hides inside a var() is a token; a curve written by hand
      // is a decision that belongs to the system, not the component
      if (bare.includes('cubic-bezier(')) {
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
    // the same rule as in a stylesheet: a var() is a token with a safety net
    const bare = blankVars(value)
    if (/(?:\$\{[^}]*\}|\b\d[\d.]*)\s*(?:ms|s)\b/.test(bare)) {
      rawScriptDuration.push(finding(path, src, m.index, text))
    }
    if (bare.includes('cubic-bezier(')) {
      rawScriptEasing.push(finding(path, src, m.index, text))
    } else {
      const timings = bare.replace(/steps\([^)]*\)/g, ' ')
      if (/\b(ease-in-out|ease-in|ease-out|ease|linear)(?![\w-])/.test(timings)) {
        rawScriptEasing.push(finding(path, src, m.index, text))
      }
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
// 4. the tokens of the system are declared once
//
// A rhythm that lives in two places is two truths about the same tempo: the
// day one component changes its own period, the parts drift apart and nobody
// notices. The reference of the system is motion.css; a component that
// redeclares a rhythm under the same name breaks that contract.
//
// A rhythm is a token whose NAME says so (`*-duration`, `*-rhythm`,
// `*-period`, `*-cycle`) or whose VALUE holds a time (`38s`).
// ---------------------------------------------------------------------------

/** Every custom property of the sources, with the place it was declared. */
const customProps = []
for (const style of styles) {
  for (const rule of style.rules) {
    for (const decl of rule.declarations) {
      if (!decl.prop.startsWith('--')) continue
      customProps.push({
        name: decl.prop,
        value: decl.value,
        file: style.path,
        line: lineAt(style.src, rule.bodyOffset + decl.offset),
      })
    }
  }
}

const RHYTHM_NAME = /-(duration|rhythm|period|cycle)$/
const TIME_VALUE = /\b\d+(\.\d+)?m?s\b/
/** A token that carries a rhythm. */
const isRhythm = (prop) => RHYTHM_NAME.test(prop.name) || TIME_VALUE.test(prop.value)
/** A token that carries a curve. */
const isCurve = (prop) => prop.name.startsWith('--ease-')

/** The places where a name is declared, grouped by the name. */
function declarationsOf(predicate) {
  const byName = new Map()
  for (const prop of customProps) {
    if (!predicate(prop)) continue
    if (!byName.has(prop.name)) byName.set(prop.name, [])
    byName.get(prop.name).push(prop)
  }
  return byName
}

/** The declarations that break the "one name — one place" rule. */
function duplicateFindings(byName) {
  const found = []
  for (const [, props] of byName) {
    if (props.length < 2) continue
    for (const prop of props) {
      found.push({
        file: prop.file,
        line: prop.line,
        text: `${prop.name}: ${prop.value}`,
      })
    }
  }
  return found
}

report(
  'rhythmDuplicates',
  'law: a rhythm is declared in one place only',
  duplicateFindings(declarationsOf(isRhythm)),
)
report(
  'curveDuplicates',
  'law: a curve is declared in one place only',
  duplicateFindings(declarationsOf(isCurve)),
)

// 4.2 a rhythm that carries its own curve must NAME that curve: a keyword
// written by hand is a decision of the component, not of the system. The one
// exception is a discrete curve (steps) — a blinking caret has no character.
const rawRhythmCurve = []
for (const prop of customProps) {
  if (!isRhythm(prop)) continue
  if (prop.file === 'src/assets/motion.css') continue // the reference file
  const bare = blankVars(prop.value)
  const timings = bare.replace(/steps\([^)]*\)/g, ' ')
  if (bare.includes('cubic-bezier(')) {
    rawRhythmCurve.push({
      file: prop.file,
      line: prop.line,
      text: `${prop.name}: ${prop.value}`,
    })
    continue
  }
  if (/\b(ease-in-out|ease-in|ease-out|ease|linear)(?![\w-])/.test(timings)) {
    rawRhythmCurve.push({
      file: prop.file,
      line: prop.line,
      text: `${prop.name}: ${prop.value}`,
    })
  }
}
report(
  'rawRhythmCurve',
  'law: a rhythm names its curve (var(--ease-*), not a keyword)',
  rawRhythmCurve,
)

// ---------------------------------------------------------------------------
// 5. the keyframes of the system
//
// A keyframe name is a global name — UNLESS the style block is scoped: Vue
// then renames it with the id of the component (`state-scan` becomes
// `state-scan-8bac6346`), so two components may hold the same name without
// meeting at runtime.
//
// The clash that is real:
//   - the same name twice in the global sheetsheets (the last one wins);
//   - the same name twice in ONE scoped block (one scope id, the last wins).
// Those are violations. A clash between two scoped blocks of two components
// is only a clash in the source: it is a warning, not a broken system.
// ---------------------------------------------------------------------------

const keyframes = new Map()
for (const style of styles) {
  for (const block of style.blocks) {
    for (const m of block.text.matchAll(/@keyframes\s+([\w-]+)/g)) {
      const name = m[1]
      if (!keyframes.has(name)) keyframes.set(name, [])
      keyframes.get(name).push({
        file: style.path,
        line: lineAt(style.src, block.offset + m.index),
        scoped: block.scoped,
        text: name,
      })
    }
  }
}
const duplicateKeyframes = []
const scopedKeyframeClashes = []
for (const [, found] of keyframes) {
  if (found.length < 2) continue
  const globals = found.filter((f) => !f.scoped)
  const scopedByFile = new Map()
  for (const f of found.filter((f) => f.scoped)) {
    scopedByFile.set(f.file, (scopedByFile.get(f.file) ?? 0) + 1)
  }
  const sameScope = [...scopedByFile.values()].some((n) => n >= 2)
  const clash = globals.length >= 2 || sameScope
  for (const f of found) {
    if (clash) duplicateKeyframes.push(f)
    else scopedKeyframeClashes.push(f)
  }
}
report('duplicateKeyframes', 'law: no keyframe name is used twice', duplicateKeyframes)
warn(
  'keyframe names that clash in the source only (Vue scopes them by data-v)',
  scopedKeyframeClashes,
)

// ---------------------------------------------------------------------------
// 6. the primitives of the motion system
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
// 7. the performance and the a11y of the motion
// ---------------------------------------------------------------------------

// 7.1 will-change forever — a promoted layer that is never demoted keeps the
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

// 7.2 the palette is defined once — a local copy of the colours is a second
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

// 7.3 reduced motion — everything that moves needs a static twin for the
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
// 8. the promises that nothing keeps
//
// A waiver that excuses no violation is a promise the system does not keep:
// the debt is paid, and the promise only hides that fact. It is reported as
// a warning — it does not break the build, but it must not stay silent.
// ---------------------------------------------------------------------------

for (const [group, list] of Object.entries(WAIVERS)) {
  for (const waiver of list) {
    if (waiver.used) continue
    warnings.push({
      name: `the waiver of ${group} excuses nothing — the debt is paid, remove it`,
      file: waiver.file,
      line: 0,
      text: waiver.pattern.source,
    })
  }
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

/**
 * What this revision of the guard changed. The report prints it, so a reader
 * of the output knows which rule now means what — a guard that silently
 * changes its mind is a guard nobody can trust.
 */
const RULE_CHANGES = [
  'ритм объявляется ровно один раз: токен с именем *-duration/-rhythm/-period/-cycle (или с временем в значении) не может быть объявлен в двух местах',
  'кривая объявляется ровно один раз: все --ease-* живут в motion.css',
  'ритм называет свою кривую: в токене ритма кривая — это var(--ease-*) (или дискретная steps()), а не литерал',
  '«linear» — токен --ease-linear: литерал в свойстве движения по-прежнему нарушение, но путь к исправлению теперь назван',
  'дубль @keyframes: нарушение — только настоящий конфликт (два глобальных имени или одно имя в одном скоупе); дубль двух скоуп-компонентов — предупреждение, потому что Vue переименовывает keyframes по data-v',
  'waiver, который ничего не извиняет, попадает в отчёт как предупреждение: обещание, которое никто не держит, — это ложь о системе',
]

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

const warned = new Map()
for (const w of warnings) {
  if (!warned.has(w.name)) warned.set(w.name, [])
  warned.get(w.name).push(w)
}
for (const [name, items] of warned) {
  console.log(`WARN  ${name}`)
  for (const item of items) {
    console.log(
      item.line
        ? `    ${item.file}:${item.line}  ${item.text}`
        : `    ${item.file}  ${item.text}`,
    )
  }
}

if (debt.length) {
  console.log(`\nopen motion debt — ${debt.length} waived violations (see --debt):`)
  for (const item of debt) {
    console.log(`  ${item.file}:${item.line}  ${item.text}`)
  }
}

console.log("\nправила, которые изменились в этой ревизии guard'а:")
for (const line of RULE_CHANGES) console.log(`  · ${line}`)

if (failed.length) {
  console.error(
    `\nverify:motion FAILED — ${failed.length}/${results.length} checks failed`,
  )
  console.error('The motion law was broken — see the list above.')
  process.exit(1)
}
console.log(`\nverify:motion OK — ${results.length} motion checks passed`)

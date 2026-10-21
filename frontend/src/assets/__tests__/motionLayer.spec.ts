import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * A11y-аудит слоя движения: `material.css` и `motion.css` — это единственное
 * место, где описано, как ведёт себя поверхность. Здесь проверяются правила,
 * которые человек с отключённым движением и человек на клавиатуре почувствуют
 * первыми:
 *
 * - у каждой анимируемой реакции есть ветка `prefers-reduced-motion: reduce`;
 * - контент никогда не прячется через `opacity: 0` (кроме декоративных слоёв);
 * - фокус виден: кольцо нарисовано и контрастно.
 *
 * Файл читается как текст — так же, как это делает `scripts/verify-motion.mjs`:
 * vitest не применяет CSS, поэтому «живую» проверку CSS здесь не построить.
 */

interface Rule {
  /** Селектор правила. */
  selector: string
  /** Тело правила. */
  body: string
  /** Внутри какой @media-ветки правило живёт (пустая строка — вне @media). */
  at: string
}

const REDUCE = 'reduce'
const NO_PREFERENCE = 'no-preference'

function readAsset(name: string): string {
  return readFileSync(resolve(process.cwd(), 'src/assets', name), 'utf8')
}

/**
 * Файл без комментариев: правило разбирается по коду, а не по словам —
 * иначе комментарий перед `@media` съел бы сам @media.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
}

/** Пара скобок: находит закрывающую по глубине. */
function matchBrace(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Правила файла вместе с их @media-контекстом.
 *
 * @keyframes разбираются как обычные правила с селектором `@keyframes …` —
 * для проверок это не важно: у них нет классов.
 */
function parseRules(css: string, at = ''): Rule[] {
  const rules: Rule[] = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open === -1) break
    const close = matchBrace(css, open)
    if (close === -1) break
    const prelude = css.slice(i, open).trim()
    const body = css.slice(open + 1, close)
    if (prelude.startsWith('@media')) {
      // «reduce» ищется точным запросом: строка «prefers-reduced-motion»
      // содержит «reduce» внутри себя, иначе no-preference сочли бы
      // веткой выключенного движения.
      const branch = /prefers-reduced-motion:\s*reduce\b/.test(prelude)
        ? REDUCE
        : /prefers-reduced-motion:\s*no-preference\b/.test(prelude)
          ? NO_PREFERENCE
          : ''
      rules.push(...parseRules(body, branch))
    } else {
      rules.push({ selector: prelude, body, at })
    }
    i = close + 1
  }
  return rules
}

/** Классы селектора: `.react-lift.react-press` → ['react-lift', 'react-press']. */
function classesOf(selector: string): string[] {
  return [...selector.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => match[1])
}

/** Правило объявляет движение: переход или анимацию. */
function moves(rule: Rule): boolean {
  return /(^|[\s;{])(transition|animation)(-[\w-]+)?\s*:/.test(rule.body)
}

const material = stripComments(readAsset('material.css'))
const motion = stripComments(readAsset('motion.css'))

const materialRules = parseRules(material)
const motionRules = parseRules(motion)

describe('material.css', () => {
  it('даёт каждой анимируемой реакции ветку reduced', () => {
    const reduced = new Set(
      materialRules
        .filter((rule) => rule.at === REDUCE)
        .flatMap((rule) => classesOf(rule.selector)),
    )

    const animated = materialRules.filter((rule) => rule.at !== REDUCE && moves(rule))
    expect(animated.length).toBeGreaterThan(0)

    for (const rule of animated) {
      for (const name of classesOf(rule.selector)) {
        expect(reduced.has(name), `${name} (${rule.selector})`).toBe(true)
      }
    }
  })

  it('не прячет контент: opacity: 0 живёт только в декоративном слое', () => {
    for (const rule of materialRules) {
      if (!/opacity:\s*0\b/.test(rule.body)) continue
      const decorative =
        rule.selector.includes('::before') || rule.selector.includes('::after')
      const underNoPreference = rule.at === NO_PREFERENCE
      expect(decorative || underNoPreference, rule.selector).toBe(true)
    }
  })

  it('рисует фокус: у каждой реакции есть кольцо', () => {
    const rings = materialRules.filter(
      (rule) => rule.selector.includes(':focus-visible') && /outline:/.test(rule.body),
    )
    expect(rings.length).toBeGreaterThan(0)

    for (const name of ['react-lift', 'react-press', 'react-edge', 'react-ink']) {
      const ring = rings.find(
        (rule) =>
          classesOf(rule.selector).includes(name) && rule.body.includes('outline'),
      )
      expect(ring, name).toBeTruthy()
    }
  })

  it('не подавляет фокус: outline не гасится без замены', () => {
    for (const rule of materialRules) {
      if (!rule.selector.includes(':focus-visible')) continue
      expect(rule.body, rule.selector).not.toMatch(/outline:\s*(none|0)\b/)
    }
  })

  it('двигает только композитор: ни scale, ни transition: all', () => {
    expect(material).not.toMatch(/transition:\s*all\b/)
    expect(material).not.toMatch(/transform:\s*scale\(/)
  })
})

describe('motion.css', () => {
  it('даёт каждой анимируемой реакции ветку reduced', () => {
    const reduced = new Set(
      motionRules
        .filter((rule) => rule.at === REDUCE)
        .flatMap((rule) => classesOf(rule.selector)),
    )

    const animated = motionRules.filter((rule) => rule.at !== REDUCE && moves(rule))
    expect(animated.length).toBeGreaterThan(0)

    for (const rule of animated) {
      for (const name of classesOf(rule.selector)) {
        expect(reduced.has(name), `${name} (${rule.selector})`).toBe(true)
      }
    }
  })

  it('не прячет контент: opacity: 0 живёт только под no-preference', () => {
    for (const rule of motionRules) {
      if (!/opacity:\s*0\b/.test(rule.body)) continue
      expect(rule.at, rule.selector).toBe(NO_PREFERENCE)
    }
  })

  it('не двигает лист при выключенном движении', () => {
    const reduced = motionRules.filter((rule) => rule.at === REDUCE)
    const press = reduced.find(
      (rule) =>
        classesOf(rule.selector).includes('motion-press') &&
        /transform:\s*none/.test(rule.body),
    )
    expect(press).toBeTruthy()
  })

  it('объявляет все роли движения и все четыре кривые', () => {
    for (const role of [
      'hover',
      'press',
      'reveal',
      'kinetic',
      'magnetic',
      'cinematic',
    ]) {
      expect(motion, role).toMatch(new RegExp(`--motion-${role}\\s*:`))
    }
    for (const curve of ['standard', 'emphasized', 'entrance', 'exit']) {
      expect(motion, curve).toMatch(new RegExp(`--ease-${curve}\\s*:`))
    }
  })
})

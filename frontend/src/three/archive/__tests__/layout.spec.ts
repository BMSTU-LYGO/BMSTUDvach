import { describe, expect, it } from 'vitest'

import {
  fragmentById,
  hashId,
  layoutSignature,
  placeFragments,
  ringsFor,
  type FragmentPlacement,
  type LayoutInputStory,
} from '@/three/archive/layout'

/**
 * The archive layout is pure maths — these tests lock the contract the scene
 * builder relies on: determinism, epoch rings, the fragment budget and the
 * absence of NaN/Infinity for hostile input.
 */

/** Mid-year timestamps: a timezone shift can never move them across a year. */
const DATE_2022 = '2022-06-15T12:00:00Z'
const DATE_2023 = '2023-06-15T12:00:00Z'
const DATE_2024 = '2024-06-15T12:00:00Z'

function story(
  id: number,
  overrides: Partial<LayoutInputStory> = {},
): LayoutInputStory {
  return { id, publishedAt: DATE_2024, ...overrides }
}

/** The very hash scheme `network.ts` uses — the layout must speak it too. */
function referenceHash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function shuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice()
  let state = seed
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2147483648
    const j = state % (i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

function isFinitePlacement(p: FragmentPlacement): boolean {
  return [p.angle, p.radius, p.x, p.y, p.z, p.tilt, p.scale, p.seed].every((v) =>
    Number.isFinite(v),
  )
}

describe('hashId', () => {
  it('matches the network hash scheme', () => {
    expect(hashId('abc')).toBe(referenceHash('abc'))
    expect(hashId('')).toBe(referenceHash(''))
  })

  it('treats numbers as their decimal string', () => {
    expect(hashId(42)).toBe(referenceHash('42'))
    expect(hashId(42)).toBe(hashId('42'))
  })

  it('is stable and non-negative', () => {
    expect(hashId('platinum')).toBe(hashId('platinum'))
    expect(hashId('platinum')).toBeGreaterThanOrEqual(0)
    expect(hashId('a')).not.toBe(hashId('b'))
  })
})

describe('ringsFor', () => {
  it('returns no rings for an empty archive', () => {
    expect(ringsFor([])).toEqual([])
  })

  it('builds a single ring for a single story', () => {
    const rings = ringsFor([story(1)])
    expect(rings).toHaveLength(1)
    expect(rings[0]).toEqual({ index: 0, radius: 3.0, stories: [1] })
  })

  it('groups stories of one year onto one ring', () => {
    const rings = ringsFor([
      story(1, { publishedAt: DATE_2022 }),
      story(2, { publishedAt: DATE_2023 }),
      story(3, { publishedAt: DATE_2023 }),
      story(4, { publishedAt: DATE_2024 }),
    ])
    expect(rings.map((r) => r.stories)).toEqual([[1], [2, 3], [4]])
  })

  it('sorts the rings by year and grows the radius outwards', () => {
    const rings = ringsFor([
      story(4, { publishedAt: DATE_2024 }),
      story(1, { publishedAt: DATE_2022 }),
      story(2, { publishedAt: DATE_2023 }),
    ])
    expect(rings.map((r) => r.index)).toEqual([0, 1, 2])
    expect(rings.map((r) => r.radius)).toEqual([3.0, 4.8, 6.6])
  })

  it('puts stories without a valid date on the innermost ring', () => {
    const rings = ringsFor([
      story(1, { publishedAt: null }),
      story(2, { publishedAt: '' }),
      story(3, { publishedAt: 'garbage' }),
      story(4, { publishedAt: DATE_2023 }),
    ])
    expect(rings).toHaveLength(2)
    expect(rings[0].index).toBe(0)
    expect(rings[0].radius).toBe(3.0)
    expect(rings[0].stories).toEqual([1, 2, 3])
    expect(rings[1].stories).toEqual([4])
  })

  it('falls back to the unpublished ring when every date is broken', () => {
    const rings = ringsFor([
      story(1, { publishedAt: 'garbage' }),
      story(2, { publishedAt: null }),
    ])
    expect(rings).toHaveLength(1)
    expect(rings[0].stories).toEqual([1, 2])
  })

  it('prefers an explicit year over the published date', () => {
    const rings = ringsFor([story(1, { publishedAt: DATE_2022, year: 2024 })])
    expect(rings).toHaveLength(1)
    expect(rings[0].stories).toEqual([1])
  })

  it('keeps the last story when an id repeats', () => {
    const rings = ringsFor([
      story(1, { publishedAt: DATE_2022 }),
      story(1, { publishedAt: DATE_2024 }),
    ])
    expect(rings).toHaveLength(1)
    expect(rings[0].stories).toEqual([1])
  })

  it('honours the shell radius and tier spacing options', () => {
    const rings = ringsFor(
      [story(1, { publishedAt: DATE_2022 }), story(2, { publishedAt: DATE_2023 })],
      { shellRadius: 5, tierSpacing: 2 },
    )
    expect(rings.map((r) => r.radius)).toEqual([5, 7])
  })

  it('honours an explicit list of ring radii', () => {
    const rings = ringsFor(
      [
        story(1, { publishedAt: DATE_2022 }),
        story(2, { publishedAt: DATE_2023 }),
        story(3, { publishedAt: DATE_2024 }),
      ],
      { rings: [1, 2, 3] },
    )
    expect(rings.map((r) => r.radius)).toEqual([1, 2, 3])
  })

  it('is independent of the order the stories arrive in', () => {
    const stories = [
      story(1, { publishedAt: DATE_2022 }),
      story(2, { publishedAt: DATE_2023 }),
      story(3, { publishedAt: null }),
    ]
    const forward = ringsFor(stories)
    const backward = ringsFor(stories.slice().reverse())
    expect(backward).toEqual(forward)
  })

  it('produces no NaN and no Infinity', () => {
    const rings = ringsFor([
      story(1, { publishedAt: '' }),
      story(2, { publishedAt: 'garbage' }),
      story(3, { publishedAt: null }),
    ])
    for (const ring of rings) {
      expect(Number.isFinite(ring.radius)).toBe(true)
      expect(ring.index).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('placeFragments', () => {
  it('places nothing for an empty archive', () => {
    expect(placeFragments([])).toEqual([])
  })

  it('places one fragment per story', () => {
    const placements = placeFragments([story(1), story(2), story(3)])
    expect(placements).toHaveLength(3)
    expect(placements.map((p) => p.id)).toEqual([1, 2, 3])
  })

  it('is deterministic for the same input', () => {
    const stories = [
      story(1, { publishedAt: DATE_2022 }),
      story(2, { publishedAt: DATE_2023 }),
      story(3, { sourceType: 'generated' }),
    ]
    expect(placeFragments(stories)).toEqual(placeFragments(stories))
  })

  it('does not depend on the order the stories arrive in', () => {
    const stories = [
      story(1, { publishedAt: DATE_2022 }),
      story(2, { publishedAt: DATE_2023 }),
      story(3, { sourceType: 'generated' }),
      story(4, { publishedAt: null }),
    ]
    const reference = placeFragments(stories)
    for (const seed of [1, 7, 42]) {
      const shuffled = placeFragments(shuffle(stories, seed))
      expect(shuffled).toEqual(reference)
      for (const p of reference) {
        const twin = shuffled.find((q) => q.id === p.id)
        expect(twin).toEqual(p)
      }
    }
  })

  it('caps the fragment count and keeps the lowest ids', () => {
    const stories = Array.from({ length: 70 }, (_, i) => story(i + 1))
    const placements = placeFragments(stories)
    expect(placements).toHaveLength(60)
    const ids = placements.map((p) => p.id)
    expect(ids).toEqual(Array.from({ length: 60 }, (_, i) => i + 1))
    expect(new Set(ids).size).toBe(60)
  })

  it('caps the fragment count regardless of the input order', () => {
    const stories = Array.from({ length: 70 }, (_, i) => story(i + 1))
    const shuffled = placeFragments(shuffle(stories, 3), { maxFragments: 12 })
    expect(shuffled.map((p) => p.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    )
  })

  it('returns nothing when the budget is exhausted', () => {
    expect(placeFragments([story(1)], { maxFragments: 0 })).toEqual([])
    expect(placeFragments([story(1)], { maxFragments: -5 })).toEqual([])
  })

  it('spreads the fragments of a ring along the golden angle', () => {
    const stories = Array.from({ length: 8 }, (_, i) => story(i + 1))
    const placements = placeFragments(stories)
    expect(placements).toHaveLength(8)
    const angles = placements.map((p) => p.angle)
    expect(new Set(angles.map((a) => a.toFixed(6))).size).toBe(8)
    for (const angle of angles) {
      expect(angle).toBeGreaterThanOrEqual(0)
      expect(angle).toBeLessThan(Math.PI * 2)
    }
  })

  it('places every fragment on the radius of its ring', () => {
    const placements = placeFragments([
      story(1, { publishedAt: DATE_2022 }),
      story(2, { publishedAt: DATE_2023 }),
      story(3, { publishedAt: DATE_2024 }),
    ])
    for (const p of placements) {
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(p.radius, 6)
      expect(p.radius).toBeCloseTo(3.0 + p.ringIndex * 1.8, 6)
    }
  })

  it('keeps the height inside the amplitude band', () => {
    const stories = Array.from({ length: 30 }, (_, i) => story(i + 1))
    for (const p of placeFragments(stories)) {
      expect(Math.abs(p.y)).toBeLessThanOrEqual(0.35 + 1e-9)
    }
  })

  it('keeps the scale inside the scale band', () => {
    const stories = Array.from({ length: 30 }, (_, i) => story(i + 1))
    for (const p of placeFragments(stories)) {
      expect(p.scale).toBeGreaterThanOrEqual(0.8)
      expect(p.scale).toBeLessThanOrEqual(1.35)
    }
  })

  it('tilts a known source type and leaves an unknown one upright', () => {
    const placements = placeFragments([
      story(1, { sourceType: 'generated' }),
      story(2, { sourceType: 'martian' }),
    ])
    const generated = fragmentById(placements, 1)
    const unknown = fragmentById(placements, 2)
    expect(generated?.tilt).not.toBe(0)
    expect(unknown?.tilt).toBe(0)
  })

  it('produces no NaN and no Infinity for broken input', () => {
    const placements = placeFragments([
      story(1, { publishedAt: '' }),
      story(2, { publishedAt: 'garbage' }),
      story(3, { publishedAt: null }),
      story(4, { sourceType: '' }),
    ])
    expect(placements).toHaveLength(4)
    for (const p of placements) {
      expect(isFinitePlacement(p)).toBe(true)
    }
  })

  it.each([
    [0, 0],
    [1, 1],
    [17, 17],
    [60, 60],
    [61, 60],
    [120, 60],
  ])('places %i stories as %i fragments', (count, expected) => {
    const stories = Array.from({ length: count }, (_, i) =>
      story(i + 1, { publishedAt: i % 3 === 0 ? DATE_2022 : DATE_2024 }),
    )
    const placements = placeFragments(stories)
    expect(placements).toHaveLength(expected)
    expect(new Set(placements.map((p) => p.id)).size).toBe(expected)
    for (const p of placements) {
      expect(isFinitePlacement(p)).toBe(true)
    }
  })
})

describe('fragmentById', () => {
  it('finds a fragment by its story id', () => {
    const placements = placeFragments([story(7), story(9)])
    expect(fragmentById(placements, 9)?.id).toBe(9)
  })

  it('returns undefined for an unknown id', () => {
    const placements = placeFragments([story(7)])
    expect(fragmentById(placements, 8)).toBeUndefined()
    expect(fragmentById([], 7)).toBeUndefined()
  })
})

describe('layoutSignature', () => {
  it('is empty for an empty set', () => {
    expect(layoutSignature([])).toBe('')
  })

  it('changes only when the set changes', () => {
    const stories = [story(1), story(2), story(3)]
    const same = [story(1), story(2), story(3)]
    const reordered = [story(3), story(1), story(2)]
    const changed = [story(1), story(2), story(4)]
    expect(layoutSignature(stories)).toBe(layoutSignature(same))
    expect(layoutSignature(stories)).toBe(layoutSignature(reordered))
    expect(layoutSignature(stories)).not.toBe(layoutSignature(changed))
  })

  it('ignores the metadata of a story', () => {
    expect(layoutSignature([story(1, { publishedAt: DATE_2022 })])).toBe(
      layoutSignature([story(1, { publishedAt: DATE_2024 })]),
    )
  })
})

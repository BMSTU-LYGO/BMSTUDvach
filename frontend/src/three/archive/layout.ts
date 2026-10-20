/**
 * Pure layout maths for the platinum Archive Space.
 *
 * The archive is organised by "epoch": the publication year of a story picks
 * the ring it lives on, everything else (angle, height, tilt, scale) is
 * derived from a stable hash of the story id. The module is deliberately free
 * of three.js and Vue — only numbers — so the whole placement is unit
 * testable without a WebGL context and stays reusable by the scene builder.
 *
 * Every function is deterministic: the same set of stories always produces
 * the same archive, and the order in which the stories arrive never changes
 * where a given story ends up.
 */

/** One epoch ring of the archive. */
export interface ArchiveRing {
  /** Tier index — 0 is the innermost ring, radii grow with the index. */
  index: number
  /** Distance from the archive core. */
  radius: number
  /** Story ids sitting on this ring, ascending. */
  stories: number[]
}

/** Where a single story fragment lives in the archive volume. */
export interface FragmentPlacement {
  /** API story id. */
  id: number
  /** Ring tier the fragment belongs to. */
  ringIndex: number
  /** Angle around the archive axis, radians, normalised to [0, 2π). */
  angle: number
  /** Radius of the ring the fragment sits on. */
  radius: number
  /** Local position of the fragment. */
  x: number
  y: number
  z: number
  /** Plate tilt around its own axis, radians. */
  tilt: number
  /** Plate scale factor. */
  scale: number
  /** Stable hash of the story id — the seed every variation derives from. */
  seed: number
}

/**
 * Minimal contract the layout needs from a story. Compatible with the API
 * `PlatinumStory` (snake_case) once the view maps the fields over.
 */
export interface LayoutInputStory {
  id: number
  /** Free-form origin tag ("generated", "dvach", "custom", …). */
  sourceType?: string
  /** ISO date of publication; null/garbage means "not published yet". */
  publishedAt?: string | null
  /** Explicit year — wins over `publishedAt` when it is a finite number. */
  year?: number | null
}

/** Tuning knobs for the archive layout. */
export interface LayoutOptions {
  /** Explicit ring radii; overrides `shellRadius` + `tierSpacing`. */
  rings?: number[]
  /** Hard cap on the number of fragments (default 60). */
  maxFragments?: number
  /** Radius of the innermost ring (default 3.0). */
  shellRadius?: number
  /** Radial distance between two neighbouring rings (default 1.8). */
  tierSpacing?: number
}

/** Radius of the innermost ring — matches the current archive shell. */
const DEFAULT_SHELL_RADIUS = 3.0
/** Radial distance between rings — matches the current [3.0, 4.8, 6.6]. */
const DEFAULT_TIER_SPACING = 1.8
/** Default fragment budget; the archive never renders more than this. */
const DEFAULT_MAX_FRAGMENTS = 60
/** Golden angle: the even distribution angle for a ring of fragments. */
const GOLDEN_ANGLE = 2.39996
/** Vertical spread of a fragment around the ring plane. */
const HEIGHT_AMPLITUDE = 0.35
/** Angular jitter per fragment — breaks up the "golden fan" look. */
const ANGLE_JITTER = 0.35
/** Scale range of a fragment plate. */
const SCALE_MIN = 0.8
const SCALE_MAX = 1.35
/** Two full turns, used to normalise angles. */
const TAU = Math.PI * 2

/**
 * Tilt per origin tag. `source_type` is a free-form tag, so unknown values
 * fall back to a flat, upright plate (tilt 0).
 */
const TILT_BY_SOURCE_TYPE: Record<string, number> = {
  generated: 0.22,
  dvach: -0.16,
  custom: 0.1,
  imported: -0.24,
  manual: 0.16,
}

/**
 * Stable hash of an id — the very same scheme the network scene uses for its
 * node placement, so both spaces speak the same "random but stable" language.
 */
export function hashId(input: string | number): number {
  const str = typeof input === 'number' ? String(input) : input
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** A story after normalisation: duplicates collapsed, year resolved. */
interface NormalizedStory {
  id: number
  sourceType: string
  year: number | null
  seed: number
}

interface ResolvedOptions {
  rings: number[]
  maxFragments: number
  shellRadius: number
  tierSpacing: number
}

/** Deterministic [0, 1) value derived from a seed and a salt. */
function unit(seed: number, salt: string): number {
  return (hashId(`${seed}:${salt}`) % 1000000) / 1000000
}

/** Tilt of a plate for a given origin tag (unknown tags stay upright). */
function tiltFor(sourceType: string): number {
  return TILT_BY_SOURCE_TYPE[sourceType] ?? 0
}

/**
 * Publication year of a story: an explicit `year` wins, otherwise the ISO
 * date is parsed. Missing or unparsable dates mean "not published yet" and
 * land on the innermost ring.
 */
function resolveYear(story: LayoutInputStory): number | null {
  if (typeof story.year === 'number' && Number.isFinite(story.year)) {
    return Math.trunc(story.year)
  }
  const raw = story.publishedAt
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const parsed = Date.parse(raw)
  if (!Number.isFinite(parsed)) return null
  const year = new Date(parsed).getFullYear()
  return Number.isFinite(year) ? year : null
}

/**
 * Collapse the input to one entry per id (the last one wins) and sort it by
 * id — the canonical order the whole layout derives from.
 */
function normalizeStories(
  stories: LayoutInputStory[] | null | undefined,
): NormalizedStory[] {
  const byId = new Map<number, NormalizedStory>()
  for (const story of stories ?? []) {
    if (!story || !Number.isFinite(story.id)) continue
    byId.set(story.id, {
      id: story.id,
      sourceType:
        typeof story.sourceType === 'string'
          ? story.sourceType.trim().toLowerCase()
          : '',
      year: resolveYear(story),
      seed: hashId(story.id),
    })
  }
  return Array.from(byId.values()).sort((a, b) => a.id - b.id)
}

/** Apply defaults and clamp the options to sane, finite values. */
function resolveOptions(opts: LayoutOptions = {}): ResolvedOptions {
  const rings = Array.isArray(opts.rings)
    ? opts.rings
        .filter((r) => typeof r === 'number' && Number.isFinite(r))
        .map((r) => Math.abs(r))
    : []
  const shellRadius =
    typeof opts.shellRadius === 'number' && Number.isFinite(opts.shellRadius)
      ? Math.max(0, opts.shellRadius)
      : DEFAULT_SHELL_RADIUS
  const tierSpacing =
    typeof opts.tierSpacing === 'number' && Number.isFinite(opts.tierSpacing)
      ? Math.max(0, opts.tierSpacing)
      : DEFAULT_TIER_SPACING
  const maxFragments =
    typeof opts.maxFragments === 'number' && Number.isFinite(opts.maxFragments)
      ? Math.floor(opts.maxFragments)
      : DEFAULT_MAX_FRAGMENTS
  return { rings, maxFragments, shellRadius, tierSpacing }
}

/** Radius of a ring tier. */
function radiusFor(index: number, opts: ResolvedOptions): number {
  if (opts.rings.length) {
    // More epochs than radii: they share the outermost ring.
    return opts.rings[Math.min(index, opts.rings.length - 1)]
  }
  return opts.shellRadius + index * opts.tierSpacing
}

/**
 * Group the stories into epoch rings: the unpublished ones innermost, the
 * published ones by ascending year.
 */
function buildRings(stories: NormalizedStory[], opts: ResolvedOptions): ArchiveRing[] {
  const byYear = new Map<number | null, number[]>()
  for (const story of stories) {
    const bucket = byYear.get(story.year)
    if (bucket) bucket.push(story.id)
    else byYear.set(story.year, [story.id])
  }
  const years = Array.from(byYear.keys())
    .filter((year): year is number => year !== null)
    .sort((a, b) => a - b)
  const order: (number | null)[] = []
  if (byYear.has(null)) order.push(null)
  order.push(...years)
  return order.map((year, index) => ({
    index,
    radius: radiusFor(index, opts),
    stories: (byYear.get(year) ?? []).slice().sort((a, b) => a - b),
  }))
}

/**
 * Epoch rings of the archive.
 *
 * Stories of the same publication year share a ring; stories without a valid
 * publication date fall back to the innermost "unpublished" ring. Rings are
 * ordered from the inside out: unpublished first, then years ascending.
 */
export function ringsFor(
  stories: LayoutInputStory[],
  opts: LayoutOptions = {},
): ArchiveRing[] {
  const normalized = normalizeStories(stories)
  if (!normalized.length) return []
  return buildRings(normalized, resolveOptions(opts))
}

/**
 * Place every story fragment in the archive volume.
 *
 * The angle follows the golden angle along the ring (plus a per-story jitter
 * so the ring never looks like a comb), the height, tilt and scale come from
 * the stable hash of the id. The result is capped to `maxFragments`; the cap
 * keeps the lowest ids, so the same set of stories always survives it.
 */
export function placeFragments(
  stories: LayoutInputStory[],
  opts: LayoutOptions = {},
): FragmentPlacement[] {
  const options = resolveOptions(opts)
  if (options.maxFragments <= 0) return []
  const normalized = normalizeStories(stories)
  if (!normalized.length) return []

  const rings = buildRings(normalized, options)
  const kept = new Set(normalized.slice(0, options.maxFragments).map((s) => s.id))
  const byId = new Map(normalized.map((s) => [s.id, s]))

  const placements: FragmentPlacement[] = []
  for (const ring of rings) {
    const ids = ring.stories.filter((id) => kept.has(id))
    ids.forEach((id, index) => {
      const story = byId.get(id)
      if (!story) return
      const seed = story.seed
      const jitter = (unit(seed, 'angle') - 0.5) * 2 * ANGLE_JITTER
      const angle = (((GOLDEN_ANGLE * index + jitter) % TAU) + TAU) % TAU
      const radius = ring.radius
      const height = (unit(seed, 'height') - 0.5) * 2 * HEIGHT_AMPLITUDE
      placements.push({
        id,
        ringIndex: ring.index,
        angle,
        radius,
        x: Math.cos(angle) * radius,
        y: height,
        z: Math.sin(angle) * radius,
        tilt: tiltFor(story.sourceType),
        scale: SCALE_MIN + unit(seed, 'scale') * (SCALE_MAX - SCALE_MIN),
        seed,
      })
    })
  }
  return placements
}

/** The placement of a single story, if it is part of the archive. */
export function fragmentById(
  placements: FragmentPlacement[],
  id: number,
): FragmentPlacement | undefined {
  return placements.find((p) => p.id === id)
}

/**
 * Cheap signature of a story set — the ids, joined. Vue watchers use it to
 * tell "the set really changed" from "the array was rebuilt".
 */
export function layoutSignature(stories: LayoutInputStory[]): string {
  const ids = new Set<number>()
  for (const story of stories ?? []) {
    if (story && Number.isFinite(story.id)) ids.add(story.id)
  }
  return Array.from(ids)
    .sort((a, b) => a - b)
    .join(',')
}

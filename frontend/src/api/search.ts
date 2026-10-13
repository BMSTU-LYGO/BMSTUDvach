import { request } from './client'
import type { ThreadSummary } from '@/types'

export interface SearchPostHit {
  id: number
  thread: number
  thread_title: string
  is_op: boolean
  snippet: string
}

export interface SearchResults {
  query: string
  threads: ThreadSummary[]
  posts: SearchPostHit[]
  board?: string | null
}

export interface SearchOptions {
  /** Slug of the board to narrow the scan to; empty or null scans everything. */
  board?: string | null
}

/** SCAN — search thread titles and post bodies across the network. */
export function searchNetwork(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResults> {
  const params = new URLSearchParams({ q: query.trim() })
  const board = options.board?.trim()
  if (board) params.set('board', board)
  return request<SearchResults>(`/search/?${params.toString()}`)
}

/** A half-open [start, end) slice of a string that should be highlighted. */
export type HighlightRange = [number, number]

/** `title:<слово>` — matches thread titles only. */
const TITLE_OPERATOR_PATTERN = /\btitle:(\S*)/g

/** `board:<slug>` — narrows the results, so it is never a match of its own. */
const BOARD_OPERATOR_PATTERN = /\bboard:\S*/g

/** Punctuation hugging a word («сесси,», «title:диффуры,») is not part of it. */
const WORD_EDGE_PATTERN = /^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_]+$/gu

/** One-character terms match half the network — never worth highlighting. */
const MIN_TERM_LENGTH = 2

/**
 * Terms a raw scan query narrows the results down to.
 *
 * The operator tokens themselves are never searched for: `board:<slug>` is a
 * scope and drops out entirely, while `title:<слово>` stays as a term — that
 * is the word the titles were matched against.
 */
function queryTerms(query: string): string[] {
  const words: string[] = []
  const residue = query
    .replace(TITLE_OPERATOR_PATTERN, (_match, value: string) => {
      words.push(value)
      return ' '
    })
    .replace(BOARD_OPERATOR_PATTERN, ' ')
  words.push(residue)

  return words
    .flatMap((chunk) => chunk.split(/\s+/))
    .map((word) => word.replace(WORD_EDGE_PATTERN, ''))
    .filter((word) => Array.from(word).length >= MIN_TERM_LENGTH)
}

/**
 * Highlight the hits of a raw scan query inside one string.
 *
 * Mirrors the backend query grammar: operators are stripped, the remaining
 * words are matched case-insensitively anywhere in the text, overlapping
 * matches are merged, and the returned half-open ranges are sorted so a
 * caller can walk `text` once, wrapping each range in a `<mark>`.
 */
export function highlightRanges(text: string, query: string): HighlightRange[] {
  if (!text) return []
  const terms = queryTerms(query)
  if (!terms.length) return []

  const haystack = text.toLowerCase()
  const hits: HighlightRange[] = []
  for (const term of terms) {
    const needle = term.toLowerCase()
    let from = haystack.indexOf(needle)
    while (from !== -1) {
      hits.push([from, from + needle.length])
      from = haystack.indexOf(needle, from + 1)
    }
  }

  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1])

  const merged: HighlightRange[] = []
  for (const [start, end] of hits) {
    const last = merged.at(-1)
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end)
      continue
    }
    merged.push([start, end])
  }
  return merged
}

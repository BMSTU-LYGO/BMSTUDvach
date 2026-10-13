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

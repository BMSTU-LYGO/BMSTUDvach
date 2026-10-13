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
}

/** SCAN — search thread titles and post bodies across the network. */
export function searchNetwork(query: string): Promise<SearchResults> {
  const q = encodeURIComponent(query.trim())
  return request<SearchResults>(`/search/?q=${q}`)
}

import { request } from './client'
import type { Paginated } from '@/types'

export interface PlatinumStory {
  id: number
  title: string
  body: string
  source_type: string
  status: string
  generation_metadata: Record<string, unknown>
  created_at: string
  published_at: string | null
}

export interface PlatinumStoryQuery {
  page?: number
  search?: string
}

export function listPlatinumStories(
  query: PlatinumStoryQuery = {},
): Promise<Paginated<PlatinumStory>> {
  const params = new URLSearchParams()
  if (query.page && query.page > 1) params.set('page', String(query.page))
  if (query.search?.trim()) params.set('search', query.search.trim())
  const qs = params.toString()
  return request<Paginated<PlatinumStory>>(`/platinum/${qs ? `?${qs}` : ''}`)
}

export function getPlatinumStory(id: number): Promise<PlatinumStory> {
  return request<PlatinumStory>(`/platinum/${id}/`)
}

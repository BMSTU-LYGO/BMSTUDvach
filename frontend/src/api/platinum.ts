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

export function listPlatinumStories(): Promise<Paginated<PlatinumStory>> {
  return request<Paginated<PlatinumStory>>('/platinum/')
}

export function getPlatinumStory(id: number): Promise<PlatinumStory> {
  return request<PlatinumStory>(`/platinum/${id}/`)
}

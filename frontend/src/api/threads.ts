import { request, toFormData } from './client'
import type {
  NewThreadInput,
  Paginated,
  ThreadDetail,
  ThreadSummary,
} from '@/types'

export type ThreadOrder = 'bump' | 'replies' | 'newest'

const THREAD_ORDERS: readonly ThreadOrder[] = ['bump', 'replies', 'newest']

export function listThreads(
  boardSlug: string,
  order: ThreadOrder = 'bump',
  page = 1,
): Promise<Paginated<ThreadSummary>> {
  const params = new URLSearchParams()
  if (THREAD_ORDERS.includes(order)) params.set('order', order)
  params.set('page', String(page))
  return request<Paginated<ThreadSummary>>(
    `/boards/${boardSlug}/threads/?${params.toString()}`,
  )
}

export function listRecentThreads(limit = 6): Promise<ThreadSummary[]> {
  return request<ThreadSummary[]>(`/threads/recent/?limit=${limit}`)
}

export function getThread(threadId: number): Promise<ThreadDetail> {
  return request<ThreadDetail>(`/threads/${threadId}/`)
}

export function createThread(
  boardSlug: string,
  input: NewThreadInput,
): Promise<ThreadDetail> {
  const name = input.name?.trim() ?? ''
  const body = toFormData({
    title: input.title,
    body: input.body,
    attachments: input.attachments ?? [],
    ...(name ? { name } : {}),
  })
  return request<ThreadDetail>(`/boards/${boardSlug}/threads/`, {
    method: 'POST',
    body,
  })
}
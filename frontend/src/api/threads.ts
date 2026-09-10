import { request, toFormData } from './client'
import type {
  NewThreadInput,
  Paginated,
  ThreadDetail,
  ThreadSummary,
} from '@/types'

export function listThreads(boardSlug: string): Promise<Paginated<ThreadSummary>> {
  return request<Paginated<ThreadSummary>>(`/boards/${boardSlug}/threads/`)
}

export function getThread(threadId: number): Promise<ThreadDetail> {
  return request<ThreadDetail>(`/threads/${threadId}/`)
}

export function createThread(
  boardSlug: string,
  input: NewThreadInput,
): Promise<ThreadDetail> {
  const body = toFormData({
    title: input.title,
    body: input.body,
    attachments: input.attachments ?? [],
  })
  return request<ThreadDetail>(`/boards/${boardSlug}/threads/`, {
    method: 'POST',
    body,
  })
}
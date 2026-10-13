import { request, toFormData } from './client'
import type { NewPostInput, NewReportInput, Post } from '@/types'

export function getPost(postId: number): Promise<Post> {
  return request<Post>(`/posts/${postId}/`)
}

export function createPost(
  threadId: number,
  input: NewPostInput,
): Promise<Post> {
  // toFormData keeps '' (it only drops undefined/null), and an empty name
  // would overwrite the «без имени» case server-side — drop it here.
  const name = input.name?.trim() ?? ''
  const body = toFormData({
    body: input.body,
    attachments: input.attachments ?? [],
    sage: input.sage ? 'true' : 'false',
    ...(name ? { name } : {}),
  })
  return request<Post>(`/threads/${threadId}/posts/`, {
    method: 'POST',
    body,
  })
}

export function createReport(
  postId: number,
  input: NewReportInput,
): Promise<{ detail: string; id: number }> {
  return request<{ detail: string; id: number }>(`/posts/${postId}/reports/`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
import { request } from './client'

export interface StaffSession {
  is_staff: boolean
  username?: string
}

export interface QueuedReport {
  id: number
  reason: string
  comment: string
  status: string
  created_at: string
  post: {
    id: number
    thread: number
    thread_title: string
    is_hidden: boolean
    body: string
    poster_fingerprint: string
  }
}

export interface FingerprintPost {
  id: number
  thread: number
  thread_title: string
  body: string
  is_hidden: boolean
  sage: boolean
  created_at: string
}

export interface FingerprintPosts {
  fingerprint: string
  count: number
  posts: FingerprintPost[]
}

export interface ThreadState {
  id: number
  is_hidden: boolean
  is_locked: boolean
  is_pinned: boolean
}

export interface ModerationLogEntry {
  id: number
  actor: string
  action: string
  target_type: string
  target_id: number
  note: string
  created_at: string
}

const BASE = '/moderation'

export function staffLogin(username: string, password: string): Promise<StaffSession> {
  return request<StaffSession>(`${BASE}/login/`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function staffMe(): Promise<StaffSession> {
  return request<StaffSession>(`${BASE}/me/`)
}

export function staffLogout(): Promise<unknown> {
  return request(`${BASE}/logout/`, { method: 'POST' })
}

export function fetchReportQueue(status = 'new'): Promise<{ reports: QueuedReport[] }> {
  return request<{ reports: QueuedReport[] }>(`${BASE}/reports/?status=${status}`)
}

export function fetchFingerprintPosts(fingerprint: string): Promise<FingerprintPosts> {
  return request<FingerprintPosts>(
    `${BASE}/fingerprints/${encodeURIComponent(fingerprint)}/posts/`,
  )
}

export function fetchModerationLog(): Promise<ModerationLogEntry[]> {
  return request<{ actions: ModerationLogEntry[] }>(`${BASE}/log/`).then(
    (data) => data.actions,
  )
}

export function resolveReport(
  id: number,
  action: 'dismiss' | 'action',
): Promise<{ id: number; status: string }> {
  return request<{ id: number; status: string }>(`${BASE}/reports/${id}/resolve/`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export function moderatePost(id: number, action: 'hide' | 'show'): Promise<unknown> {
  return request(`${BASE}/posts/${id}/${action}/`, { method: 'POST' })
}

export function moderateThread(
  id: number,
  action: 'hide' | 'show' | 'lock' | 'unlock',
): Promise<unknown> {
  return request(`${BASE}/threads/${id}/${action}/`, { method: 'POST' })
}

export function pinThread(id: number): Promise<ThreadState> {
  return request<ThreadState>(`${BASE}/threads/${id}/pin/`, { method: 'POST' })
}

export function unpinThread(id: number): Promise<ThreadState> {
  return request<ThreadState>(`${BASE}/threads/${id}/unpin/`, { method: 'POST' })
}

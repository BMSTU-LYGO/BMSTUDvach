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
  }
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

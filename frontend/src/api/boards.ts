import { request } from './client'
import type { Board } from '@/types'

export function listBoards(): Promise<Board[]> {
  return request<Board[]>('/boards/')
}

export function getBoard(slug: string): Promise<Board> {
  return request<Board>(`/boards/${slug}/`)
}
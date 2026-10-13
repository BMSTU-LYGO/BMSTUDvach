import { request } from './client'

export interface Announcement {
  id: number
  text: string
}

/**
 * Активные объявления (ANNOUNCE-01) — до трёх штук для баннера на любой
 * странице. Баннер вспомогательный: пустой список и ошибка сети не должны
 * ломать layout, поэтому тип допускает только публичные поля.
 */
export function fetchActiveAnnouncements(): Promise<Announcement[]> {
  return request<Announcement[]>('/announcements/')
}

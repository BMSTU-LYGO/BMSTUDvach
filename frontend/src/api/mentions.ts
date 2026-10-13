import { request } from './client'

export interface Mention {
  /** id поста-ответа. */
  post: number
  thread: number
  thread_title: string
  body: string
  created_at: string
  /** Фрагмент тела вокруг первой ссылки `>>N` на мой пост. */
  snippet: string
}

export interface Mentions {
  tripcode: string
  count: number
  mentions: Mention[]
}

/**
 * Ответы на посты моего трипкода (MENTION-01).
 *
 * Аккаунтов на форуме нет, поэтому «мои» посты узнаются только по
 * трипкоду `!xxxxxxxx` — секрет «Имя#секрет» сюда не передаётся.
 */
export function getMentions(tripcode: string): Promise<Mentions> {
  return request<Mentions>(
    `/posts/mentions/?trip=${encodeURIComponent(tripcode.trim())}`,
  )
}

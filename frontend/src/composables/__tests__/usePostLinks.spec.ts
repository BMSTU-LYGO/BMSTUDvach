import { describe, expect, it } from 'vitest'

import { collectBacklinks, parsePostLinks } from '@/composables/usePostLinks'
import type { Post } from '@/types'

function post(id: number, body: string): Post {
  return {
    id,
    thread: 1,
    body,
    is_op: id === 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    author: 'Аноним',
    attachments: [],
  }
}

describe('parsePostLinks', () => {
  it('splits plain text into a single token', () => {
    expect(parsePostLinks('привет всем')).toEqual([{ type: 'text', value: 'привет всем' }])
  })

  it('extracts >>id links around text', () => {
    expect(parsePostLinks('согласен с >>42 но не с >>7 совсем')).toEqual([
      { type: 'text', value: 'согласен с ' },
      { type: 'link', id: 42 },
      { type: 'text', value: ' но не с ' },
      { type: 'link', id: 7 },
      { type: 'text', value: ' совсем' },
    ])
  })

  it('handles a leading link and a trailing link', () => {
    expect(parsePostLinks('>>1 (OP) текст >>9')).toEqual([
      { type: 'link', id: 1 },
      { type: 'text', value: ' (OP) текст ' },
      { type: 'link', id: 9 },
    ])
  })

  it('keeps a lone >> without digits as text', () => {
    expect(parsePostLinks('>> и >>12')).toEqual([
      { type: 'text', value: '>> и ' },
      { type: 'link', id: 12 },
    ])
  })
})

describe('collectBacklinks', () => {
  it('maps target → sources, skipping self-links and duplicates', () => {
    const posts = [
      post(1, 'тред открыт'),
      post(2, '>>1 отвечаю'),
      post(3, '>>1 и снова >>1 плюс >>2'),
    ]
    const map = collectBacklinks(posts)
    expect(map.get(1)).toEqual([2, 3])
    expect(map.get(2)).toEqual([3])
  })

  it('returns links to unknown ids so the UI can mark them dead', () => {
    const map = collectBacklinks([post(1, 'ответ на >>404')])
    expect(map.get(404)).toEqual([1])
  })
})

import type { Post } from '@/types'

/**
 * Post links (`>>123`) for the thread reader.
 *
 * Pure functions only — parsing and backlink collection must be testable
 * without a DOM. Imageboard semantics: `>>123` links to post #123 in the
 * same thread; unknown ids render as dead links.
 */

export interface TextToken {
  type: 'text'
  value: string
}

export interface LinkToken {
  type: 'link'
  id: number
}

export type PostToken = TextToken | LinkToken

const LINK_RE = />>(\d+)/g

export function parsePostLinks(body: string): PostToken[] {
  const tokens: PostToken[] = []
  let last = 0
  let match: RegExpExecArray | null

  LINK_RE.lastIndex = 0
  while ((match = LINK_RE.exec(body)) !== null) {
    if (match.index > last) {
      tokens.push({ type: 'text', value: body.slice(last, match.index) })
    }
    tokens.push({ type: 'link', id: Number(match[1]) })
    last = match.index + match[0].length
  }
  if (last < body.length) {
    tokens.push({ type: 'text', value: body.slice(last) })
  }
  return tokens
}

/** post id → ids of posts that link to it (excluding self-links). */
export function collectBacklinks(posts: Post[]): Map<number, number[]> {
  const map = new Map<number, number[]>()
  for (const post of posts) {
    for (const token of parsePostLinks(post.body)) {
      if (token.type !== 'link') continue
      if (token.id === post.id) continue
      const list = map.get(token.id) ?? []
      if (!list.includes(post.id)) list.push(post.id)
      map.set(token.id, list)
    }
  }
  return map
}

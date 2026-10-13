import { describe, it, expect, beforeEach, vi } from 'vitest'

import { request } from '@/api/client'

describe('request — session/CSRF behaviour', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=test-token-123'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => '{"ok":true}',
      }),
    )
  })

  it('sends credentials and the CSRF header on writes', async () => {
    await request('/moderation/posts/1/hide/', { method: 'POST' })
    const fetchMock = vi.mocked(fetch)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.credentials).toBe('include')
    expect(new Headers(init.headers).get('X-CSRFToken')).toBe('test-token-123')
  })

  it('does not send the CSRF header on reads', async () => {
    await request('/moderation/me/')
    const fetchMock = vi.mocked(fetch)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('X-CSRFToken')).toBeNull()
    expect(init.credentials).toBe('include')
  })

  it('omits the header when no cookie is present', async () => {
    document.cookie = 'csrftoken=; Max-Age=0'
    await request('/platinum/1/', { method: 'POST' })
    const fetchMock = vi.mocked(fetch)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('X-CSRFToken')).toBeNull()
  })
})

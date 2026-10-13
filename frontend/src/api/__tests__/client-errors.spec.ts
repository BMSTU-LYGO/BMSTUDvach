import { describe, it, expect } from 'vitest'

import { ApiRequestError, apiErrorMessage } from '@/api/client'

describe('apiErrorMessage', () => {
  it('prefers field errors over the generic detail', () => {
    const err = new ApiRequestError(400, 'Validation error', {
      attachments: ['Attachment content does not match its declared type (image/png).'],
    })
    expect(apiErrorMessage(err, 'fallback')).toContain('does not match its declared type')
  })

  it('joins multiple field messages', () => {
    const err = new ApiRequestError(400, 'Validation error', {
      title: ['Too short'],
      body: ['Must not be empty'],
    })
    expect(apiErrorMessage(err, 'fallback')).toBe('Too short · Must not be empty')
  })

  it('uses a meaningful detail when there are no field errors', () => {
    const err = new ApiRequestError(404, 'Not found.')
    expect(apiErrorMessage(err, 'fallback')).toBe('Not found.')
  })

  it('ignores the generic validation detail', () => {
    const err = new ApiRequestError(400, 'Validation error')
    expect(apiErrorMessage(err, 'Не удалось создать тред.')).toBe('Не удалось создать тред.')
  })

  it('falls back for plain Errors and junk', () => {
    expect(apiErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
    expect(apiErrorMessage('nope', 'fallback')).toBe('fallback')
    expect(apiErrorMessage(null, 'fallback')).toBe('fallback')
  })
})

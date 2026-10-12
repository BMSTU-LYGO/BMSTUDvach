import { describe, it, expect } from 'vitest'

import { toFormData } from '@/api/client'

describe('toFormData', () => {
  it('serializes scalar fields', () => {
    const fd = toFormData({ title: 'Тред', body: 'Тело' })
    expect(fd.get('title')).toBe('Тред')
    expect(fd.get('body')).toBe('Тело')
  })

  it('appends file arrays as repeated fields', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const fd = toFormData({ attachments: [file] })
    expect(fd.getAll('attachments')).toHaveLength(1)
    expect((fd.get('attachments') as File).name).toBe('a.png')
  })

  it('skips null and undefined but keeps false/0', () => {
    const fd = toFormData({ a: null, b: undefined, c: false, d: 0 })
    expect(fd.has('a')).toBe(false)
    expect(fd.has('b')).toBe(false)
    expect(fd.get('c')).toBe('false')
    expect(fd.get('d')).toBe('0')
  })
})

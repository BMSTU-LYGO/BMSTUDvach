import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useDraftQuoteStore } from '@/stores/draftQuote'

describe('draftQuote store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has nothing pending until a quote is requested', () => {
    expect(useDraftQuoteStore().pendingQuote).toBe(null)
    expect(useDraftQuoteStore().consumeQuote(7)).toBe(null)
  })

  it('request → consume round trip', () => {
    const store = useDraftQuoteStore()
    store.requestQuote(7, 42)

    expect(store.pendingQuote).toEqual({ threadId: 7, postId: 42, token: 1 })
    expect(store.consumeQuote(7)).toEqual({ threadId: 7, postId: 42, token: 1 })
    expect(store.pendingQuote).toBe(null)
    // consumed twice — the second read finds nothing
    expect(store.consumeQuote(7)).toBe(null)
  })

  it('refuses to hand a quote to another thread', () => {
    const store = useDraftQuoteStore()
    store.requestQuote(7, 42)

    expect(store.consumeQuote(9)).toBe(null)
    expect(store.pendingQuote).toEqual({ threadId: 7, postId: 42, token: 1 })
  })

  it('gives every request a fresh token, repeats included', () => {
    const store = useDraftQuoteStore()
    store.requestQuote(7, 42)
    store.requestQuote(7, 42)
    store.requestQuote(7, 42)

    expect(store.pendingQuote).toEqual({ threadId: 7, postId: 42, token: 3 })
    expect(store.consumeQuote(7)?.token).toBe(3)
    expect(store.pendingQuote).toBe(null)
  })

  it('counts tokens across threads', () => {
    const store = useDraftQuoteStore()
    store.requestQuote(7, 42)
    store.requestQuote(9, 1)

    expect(store.pendingQuote?.token).toBe(2)
    expect(store.consumeQuote(7)).toBe(null)
    expect(store.pendingQuote).toEqual({ threadId: 9, postId: 1, token: 2 })
  })
})

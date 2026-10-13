import { defineStore } from 'pinia'

/**
 * QUOTE-01: the quote bus between a post body and the Signal Dock.
 *
 * PostBody never touches the dock directly — it requests a quote here and
 * the dock, subscribed to the same store, writes it into the draft. The
 * token makes every request unique, so quoting the same post twice still
 * reaches the dock.
 */
export interface PendingQuote {
  threadId: number
  postId: number
  /** monotonic counter — repeats of the same post stay distinct events */
  token: number
}

export const useDraftQuoteStore = defineStore('draftQuote', {
  state: () => ({
    pendingQuote: null as PendingQuote | null,
  }),

  actions: {
    requestQuote(threadId: number, postId: number) {
      this.pendingQuote = {
        threadId,
        postId,
        token: (this.pendingQuote?.token ?? 0) + 1,
      }
    },

    /** Takes the pending quote away when it belongs to this thread. */
    consumeQuote(threadId: number): PendingQuote | null {
      const pending = this.pendingQuote
      if (!pending || pending.threadId !== threadId) return null
      this.pendingQuote = null
      return pending
    },
  },
})

import { computed, inject, watch } from 'vue'
import { routeLocationKey } from 'vue-router'
import type { Ref } from 'vue'

import { useDraftQuoteStore } from '@/stores/draftQuote'

/**
 * QUOTE-01 — `>>id` in a post body becomes a quote in the Signal Dock.
 *
 * `insertQuoteText` is pure: it appends `>>id` as its own line at the end
 * of the draft and refuses to quote a post that is already quoted, so a
 * repeated click is a no-op instead of duplicated text.
 *
 * `watchQuotes` drains the draftQuote store into a draft ref, keeping the
 * post body and the dock decoupled.
 */
export function insertQuoteText(current: string, postId: number): string {
  if (new RegExp(`>>${postId}(?!\\d)`).test(current)) return current
  const head = current.length === 0 || current.endsWith('\n') ? current : `${current}\n`
  return `${head}>>${postId}\n`
}

/**
 * Thread id of the current reader page, or null outside a thread route.
 * Reading the route through `inject` with a default keeps mountable
 * components usable without a router instead of warning about a missing
 * injection.
 */
export function useQuoteThreadId(): Ref<number | null> {
  const route = inject(routeLocationKey, null)
  return computed(() => {
    const id = Number(route?.params?.threadId)
    return Number.isInteger(id) && id > 0 ? id : null
  })
}

export function useQuoteInsert() {
  const store = useDraftQuoteStore()

  /** Writes the pending quote of this thread into the draft. */
  function applyQuoteToDraft(draft: Ref<string>, threadId: number): boolean {
    const pending = store.consumeQuote(threadId)
    if (!pending) return false
    const next = insertQuoteText(draft.value, pending.postId)
    if (next === draft.value) return false
    draft.value = next
    return true
  }

  /** Applies every incoming quote into the draft as it arrives. */
  function watchQuotes(
    draft: Ref<string>,
    threadId: number,
    onApplied?: () => void,
  ): () => void {
    return watch(
      () => store.pendingQuote?.token,
      (token) => {
        if (token === undefined) return
        if (applyQuoteToDraft(draft, threadId)) onApplied?.()
      },
    )
  }

  return { applyQuoteToDraft, watchQuotes }
}

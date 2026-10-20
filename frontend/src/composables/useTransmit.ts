import { getCurrentInstance, onScopeDispose, readonly, ref, type Ref } from 'vue'

import { classifyError, type TransmitError } from '@/api/errors'

/**
 * ORCHESTRATION of one transmit (TRANSMIT-ENGINE-01).
 *
 * The forms (Signal Dock, Launch Bay, Report Probe) all repeat the same
 * dance right now: flip `submitting`, clear the error string, await the
 * API call, bump a success token or copy `apiErrorMessage(err)` into a
 * string ref. That dance is error-prone by construction — every consumer
 * invents its own error text and none of them can retry.
 *
 * `useTransmit` owns exactly that:
 *  - `submitting` / `error` / `successToken` — the state every surface
 *    already renders (TransmitControl takes `submitting`, `errorToken`
 *    and `successToken` as props);
 *  - `run(input, apiCall)` — one attempt; the failure is classified by
 *    `classifyError` (P1-T1) into a structured `TransmitError`;
 *  - `retry()` — repeats the last attempt with the last input, because
 *    the api call is kept as a closure of that very attempt;
 *  - if the network came back by itself (`online` event after an
 *    `offline` refusal), one automatic retry happens — the user does not
 *    have to press «повторить» after reconnecting;
 *  - a throttle (429) is deliberately *not* auto-retried: the limit is a
 *    limit. `TransmitNotice` counts the seconds down and offers a button.
 *
 * Nothing is logged except a `console.warn` for failures the taxonomy
 * could not classify — expected refusals are UI state, not bugs.
 *
 * Usage (from `setup()`):
 * ```ts
 * const tx = useTransmit<NewPostInput>()
 * const { submitting, error, successToken } = tx
 *
 * async function handlePost(input: NewPostInput) {
 *   const post = await tx.run(input, (i) => store.createPost(threadId, i))
 *   if (post === undefined) return          // refused — `error` explains
 *   await store.fetchThread(threadId)
 *   emitSceneEvent({ type: 'reply' })
 * }
 * ```
 * Destructure the refs: only top-level setup refs are unwrapped by the
 * template proxy, so `tx.submitting` in a template would hand the ref
 * itself to a child prop. `errorToken` for TransmitControl's broken-ring
 * feedback is derived by the consumer from `error` (a refusal that
 * changed):
 *
 *     watch(() => error, (e) => { if (e) transmitErrorToken.value++ })
 *
 *     <TransmitControl :submitting="submitting" :error-token="transmitErrorToken"
 *                       :success-token="successToken" @transmit="handlePost" />
 *     <TransmitNotice :error="error" @retry="tx.retry()" />
 */

/** Whatever the form hands over on transmit — post, thread, report payload. */
export type TransmitInput = unknown

/** The API call of one attempt: takes the stored input, resolves on success. */
export type TransmitApiCall<T extends TransmitInput, V> = (input: T) => Promise<V>

export interface UseTransmit<T extends TransmitInput = TransmitInput> {
  /** True while an attempt is in flight (pass to TransmitControl). */
  submitting: Readonly<Ref<boolean>>
  /** Structured failure of the last attempt, or null. */
  error: Ref<TransmitError | null>
  /** Bumped on every successful attempt (pass to TransmitControl). */
  successToken: Ref<number>
  /** Input of the last attempt — what `retry()` repeats. */
  lastInput: Ref<TransmitInput>

  run: <V = unknown>(input: T, apiCall: TransmitApiCall<T, V>) => Promise<V | undefined>
  retry: () => Promise<unknown>
  /** Forget the failure (and the retained attempt) — the form is clean. */
  reset: () => void
  /** Manual teardown; called automatically from `setup()` scopes. */
  destroy: () => void
}

export function useTransmit<T extends TransmitInput = TransmitInput>(): UseTransmit<T> {
  const submitting = ref(false)
  const error = ref<TransmitError | null>(null)
  const successToken = ref(0)
  const lastInput = ref<TransmitInput>(null)

  // The last attempt as a closure: `retry()` must repeat the very same
  // call with the very same input, without the caller rebuilding either.
  let lastCall: ((input: unknown) => Promise<unknown>) | null = null
  let onlineHandler: (() => void) | null = null

  function detachOnline(): void {
    if (!onlineHandler) return
    window.removeEventListener('online', onlineHandler)
    onlineHandler = null
  }

  function attachOnline(): void {
    if (onlineHandler) return
    onlineHandler = () => {
      // One automatic retry per reconnect; the listener is gone the
      // moment it fires, so a broken link can never spin us in a loop.
      detachOnline()
      if (error.value?.kind !== 'offline') return
      void retry()
    }
    window.addEventListener('online', onlineHandler)
  }

  async function run<V = unknown>(
    input: T,
    apiCall: TransmitApiCall<T, V>,
  ): Promise<V | undefined> {
    // A second transmit while one is in flight would race the surfaces;
    // the in-flight attempt wins.
    if (submitting.value) return undefined

    lastInput.value = input
    lastCall = apiCall as unknown as (input: unknown) => Promise<unknown>
    // A fresh attempt supersedes any pending offline auto-retry.
    detachOnline()

    submitting.value = true
    error.value = null

    try {
      const result = await apiCall(input)
      // The success token must bump even if a previous failure is still
      // rendered for a tick — consumers watch it, not `error`.
      successToken.value += 1
      error.value = null
      return result
    } catch (err) {
      const classified = classifyError(err)
      error.value = classified

      // Expected refusals (429/400/offline/…) are states the surface
      // renders. Only a failure the taxonomy cannot explain is a bug.
      if (classified.kind === 'unknown') {
        console.warn('[useTransmit] unclassified transmit failure:', err)
      }

      if (classified.kind === 'offline') attachOnline()
      return undefined
    } finally {
      submitting.value = false
    }
  }

  async function retry(): Promise<unknown> {
    const call = lastCall
    if (!call) return undefined
    // Through `run`, so submitting/error/successToken stay consistent with
    // a fresh attempt instead of a side channel.
    return run(lastInput.value as T, call as TransmitApiCall<T, unknown>)
  }

  function reset(): void {
    detachOnline()
    error.value = null
    submitting.value = false
    lastInput.value = null
    lastCall = null
  }

  function destroy(): void {
    detachOnline()
  }

  // Composables belong to `setup()`. When there is an instance we hook
  // its scope; standalone calls (tests, plain scripts) get `destroy()`
  // instead of a lifecycle warning.
  if (getCurrentInstance()) {
    onScopeDispose(destroy)
  }

  return {
    submitting: readonly(submitting),
    error,
    successToken,
    lastInput,
    run,
    retry,
    reset,
    destroy,
  }
}

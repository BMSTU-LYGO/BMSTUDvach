import { ref, onMounted } from 'vue'

export interface Draft {
  title?: string
  body: string
  files?: File[]
  timestamp: number
}

export type DraftStatus = 'idle' | 'writing' | 'saved' | 'error'

/**
 * A read-only projection of one persisted draft, for surfaces that list
 * unfinished signals across threads (the home DraftsPanel, DRAFTS-01).
 * `key` is the raw localStorage key (`draft:signal-7`) so callers can
 * discard exactly the entry they listed.
 */
export interface DraftSummary {
  key: string
  threadId: number
  body: string
  filesCount: number
  savedAt: number
}

const DRAFT_PREFIX = 'draft:'
// Signal Dock keys are `draft:signal-<threadId>`; anything else is ignored.
const SIGNAL_DRAFT_KEY = /^signal-(\d+)$/

/**
 * Scan localStorage for persisted Signal Dock drafts.
 *
 * Returns one summary per `draft:signal-<threadId>` entry that carries a
 * non-empty body or at least one attachment. Malformed JSON, foreign keys
 * and empty buffers are silently skipped. Newest first (`savedAt` desc).
 */
export function listDrafts(): DraftSummary[] {
  const summaries: DraftSummary[] = []

  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key !== null) keys.push(key)
    }
  } catch {
    return summaries
  }

  for (const key of keys) {
    if (!key.startsWith(DRAFT_PREFIX)) continue

    const match = key.slice(DRAFT_PREFIX.length).match(SIGNAL_DRAFT_KEY)
    if (!match) continue
    const threadId = Number(match[1])
    if (!Number.isInteger(threadId) || threadId <= 0) continue

    let parsed: unknown
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) continue
      parsed = JSON.parse(raw)
    } catch {
      continue
    }

    if (typeof parsed !== 'object' || parsed === null) continue
    const record = parsed as Record<string, unknown>
    const body = typeof record.body === 'string' ? record.body : ''
    const filesCount = Array.isArray(record.files) ? record.files.length : 0
    const savedAt = typeof record.timestamp === 'number' ? record.timestamp : 0

    // A buffer with neither text nor attachments is not a draft.
    if (body.trim().length === 0 && filesCount === 0) continue

    summaries.push({ key, threadId, body, filesCount, savedAt })
  }

  return summaries.sort((a, b) => b.savedAt - a.savedAt)
}

/** Remove a single draft by its raw localStorage key. */
export function discardDraft(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // storage blocked — the entry simply stays; nothing else we can do
  }
}

/**
 * localStorage-backed draft buffer with an honest status signal for the
 * Buffer Beacon (SIGNAL-12): idle → writing (debounce pending) → saved,
 * or error when persistence itself fails.
 */
export function useDraft(key: string) {
  const draft = ref<Draft | null>(null)
  const hasDraft = ref(false)
  const status = ref<DraftStatus>('idle')
  const savedAt = ref<number | null>(null)

  // Load draft from localStorage on mount
  onMounted(() => {
    try {
      const stored = localStorage.getItem(`draft:${key}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Don't restore files (they can't be serialized)
        draft.value = {
          title: parsed.title || '',
          body: parsed.body || '',
          files: [],
          timestamp: parsed.timestamp || Date.now(),
        }
        hasDraft.value = true
        status.value = 'saved'
        savedAt.value = draft.value.timestamp
      }
    } catch (error) {
      console.warn('Failed to load draft:', error)
      status.value = 'error'
    }
  })

  // Save draft to localStorage with debounce
  let saveTimeout: number | null = null
  function saveDraft(data: string | { title?: string; body: string }) {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }

    status.value = 'writing'
    saveTimeout = window.setTimeout(() => {
      try {
        const draftData: Draft =
          typeof data === 'string'
            ? { body: data, files: [], timestamp: Date.now() }
            : { title: data.title || '', body: data.body, files: [], timestamp: Date.now() }

        localStorage.setItem(`draft:${key}`, JSON.stringify(draftData))
        hasDraft.value = true
        savedAt.value = draftData.timestamp
        status.value = 'saved'
      } catch (error) {
        console.warn('Failed to save draft:', error)
        status.value = 'error'
      }
    }, 500) // 500ms debounce
  }

  // Clear draft
  function clearDraft() {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }
    try {
      localStorage.removeItem(`draft:${key}`)
      draft.value = null
      hasDraft.value = false
      status.value = 'idle'
      savedAt.value = null
    } catch (error) {
      console.warn('Failed to clear draft:', error)
      status.value = 'error'
    }
  }

  // Restore draft
  function restoreDraft(): Draft | null {
    const current = draft.value
    if (current) {
      clearDraft()
    }
    return current
  }

  return {
    draft,
    hasDraft,
    status,
    savedAt,
    saveDraft,
    clearDraft,
    restoreDraft,
  }
}

import { ref, onMounted } from 'vue'

export interface Draft {
  title?: string
  body: string
  files?: File[]
  timestamp: number
}

export type DraftStatus = 'idle' | 'writing' | 'saved' | 'error'

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

import { ref, onMounted } from 'vue'

export interface Draft {
  title?: string
  body: string
  files?: File[]
  timestamp: number
}

export function useDraft(key: string) {
  const draft = ref<Draft | null>(null)
  const hasDraft = ref(false)

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
          timestamp: parsed.timestamp || Date.now()
        }
        hasDraft.value = true
      }
    } catch (error) {
      console.warn('Failed to load draft:', error)
    }
  })

  // Save draft to localStorage with debounce
  let saveTimeout: number | null = null
  function saveDraft(data: string | { title?: string; body: string }) {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
    
    saveTimeout = window.setTimeout(() => {
      try {
        const draftData: Draft = typeof data === 'string' 
          ? { body: data, files: [], timestamp: Date.now() }
          : { title: data.title || '', body: data.body, files: [], timestamp: Date.now() }
        
        localStorage.setItem(`draft:${key}`, JSON.stringify(draftData))
        hasDraft.value = true
      } catch (error) {
        console.warn('Failed to save draft:', error)
      }
    }, 500) // 500ms debounce
  }

  // Clear draft
  function clearDraft() {
    try {
      localStorage.removeItem(`draft:${key}`)
      draft.value = null
      hasDraft.value = false
    } catch (error) {
      console.warn('Failed to clear draft:', error)
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
    saveDraft,
    clearDraft,
    restoreDraft
  }
}

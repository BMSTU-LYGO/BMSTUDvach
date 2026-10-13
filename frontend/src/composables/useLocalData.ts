/**
 * Device-local data export and reset (USERDATA-01).
 *
 * The forum has no accounts: watchlist, identities, drafts, read positions
 * and «seen» markers all live in this browser. The composable takes an
 * honest snapshot of what the app itself stored — and only that — so the
 * data can be downloaded as JSON or wiped on request.
 */

/** Keys the app owns, matched by prefix. Anything else in localStorage is not ours. */
const OWNED_PREFIXES = ['bmstud-', 'bmstudvach-', 'board-', 'draft:'] as const

export interface LocalDataDump {
  exported_at: string
  keys: Record<string, unknown>
}

export function isAppStorageKey(key: string): boolean {
  return OWNED_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/** Sorted list of our own keys currently present in localStorage. */
export function collectLocalDataKeys(): string[] {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && isAppStorageKey(key)) keys.push(key)
    }
    return keys.sort()
  } catch {
    return []
  }
}

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

export function collectLocalData(): LocalDataDump {
  const keys: Record<string, unknown> = {}
  for (const key of collectLocalDataKeys()) {
    try {
      keys[key] = parseValue(localStorage.getItem(key) ?? '')
    } catch {
      keys[key] = null
    }
  }
  return { exported_at: new Date().toISOString(), keys }
}

export function downloadLocalData(): void {
  const dump = collectLocalData()
  let url: string | null = null
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
    url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bmstudvach-local-data.json'
    link.style.display = 'none'
    link.click()
  } catch {
    // download blocked — nothing else to do on a device-local page
  } finally {
    if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url)
    }
  }
}

export function resetLocalData(): number {
  let removed = 0
  for (const key of collectLocalDataKeys()) {
    try {
      localStorage.removeItem(key)
      removed += 1
    } catch {
      // storage blocked — the key simply stays
    }
  }
  return removed
}

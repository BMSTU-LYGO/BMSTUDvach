import { onMounted, onUnmounted, ref } from 'vue'

/**
 * Serializable attachment metadata.
 *
 * A real `File` cannot be persisted (no structured clone in localStorage, no
 * bytes to keep), so a draft only remembers the *shape* of its attachments:
 * name and size. Enough for an honest «вложения нужно приложить заново»
 * notice on restore and for the drafts list to count them.
 */
export interface MetaFile {
  name: string
  size: number
}

export interface Draft {
  title?: string
  body: string
  /** Metadata only — never `File` instances (DRAFT-01: honest restore). */
  files?: MetaFile[]
  timestamp: number
}

export type DraftStatus = 'idle' | 'writing' | 'saved' | 'error'

/** What `saveDraft` accepts: a bare body (Signal Dock) or title + body (+
 *  attachments) for the Launch Bay. File-like inputs are reduced to
 *  `MetaFile` metadata on the way in. */
export type DraftInput =
  | string
  | { title?: string; body: string; files?: Array<MetaFile | File> }

/**
 * Which composer owns a persisted buffer (P2-T3). Three forms write drafts,
 * and each writes its own key shape:
 *  - `signal`  — a Signal Dock reply,   `draft:signal-<threadId>`
 *  - `launch`  — a Launch Bay thread,   `draft:launch-<boardSlug>`
 *  - `report`  — a Report Probe report, `draft:report-<postId>`
 * `listDrafts` reads all three, so nothing unfinished is invisible.
 */
export type DraftKind = 'signal' | 'launch' | 'report'

/**
 * A read-only projection of one persisted draft, for surfaces that list
 * unfinished work across the app (the home DraftsPanel, DRAFTS-01).
 * `key` is the raw localStorage key (`draft:signal-7`) so callers can
 * discard exactly the entry they listed.
 *
 * `kind` is always there; the id fields only for the kind that proves them.
 * A report key knows the post but not its thread, so no thread id is
 * invented for it — the panel shows the row without a resume link instead.
 */
export interface DraftSummary {
  key: string
  kind: DraftKind
  body: string
  filesCount: number
  savedAt: number
  /** `signal`: the thread this reply belongs to. */
  threadId?: number
  /** `launch`: the board this thread would be launched into. */
  boardSlug?: string
  /** `report`: the post being reported. */
  postId?: number
  /** `launch`: the buffered title. `report`: the chosen reason. */
  title?: string
}

const DRAFT_PREFIX = 'draft:'
// One dispatcher for the three key shapes instead of a signal-only regex.
// Board slugs keep the backend character set (lowercase letters, digits,
// hyphens, underscores, starting with a letter or digit) but not its
// minimum length: a composer may buffer on a short slug, and a stricter
// read than the write would hide a real draft.
const SIGNAL_KEY = /^signal-(\d+)$/
const LAUNCH_KEY = /^launch-([a-z0-9][a-z0-9_-]*)$/
const REPORT_KEY = /^report-(\d+)$/
// Typing → writing → saved. Long enough to keep localStorage calm while a
// reply is being typed, short enough to feel instant.
const DEBOUNCE_MS = 500

/** What a key proves about its draft — the subject, never a guess. */
interface DraftKeyMatch {
  kind: DraftKind
  subject: Pick<DraftSummary, 'threadId' | 'boardSlug' | 'postId'>
}

/**
 * Read the subject out of a `draft:`-less key through the three shapes the
 * composers write. Anything else is not a draft: `null` skips it.
 */
function parseDraftKey(key: string): DraftKeyMatch | null {
  const rest = key.slice(DRAFT_PREFIX.length)

  const signal = SIGNAL_KEY.exec(rest)
  if (signal) {
    const threadId = Number(signal[1])
    return threadId > 0 ? { kind: 'signal', subject: { threadId } } : null
  }

  const launch = LAUNCH_KEY.exec(rest)
  if (launch) return { kind: 'launch', subject: { boardSlug: launch[1] } }

  const report = REPORT_KEY.exec(rest)
  if (report) {
    const postId = Number(report[1])
    return postId > 0 ? { kind: 'report', subject: { postId } } : null
  }

  return null
}

/** Persisted payload, normalized: metadata only, always serializable. */
interface DraftPayload {
  title?: string
  body: string
  files: MetaFile[]
}

/** Reduce whatever the caller attached to storage-safe metadata. */
function toMetaFiles(value: unknown): MetaFile[] {
  if (!Array.isArray(value)) return []
  const files: MetaFile[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    files.push({
      name: typeof record.name === 'string' ? record.name : '',
      size: typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : 0,
    })
  }
  return files
}

/** Count persisted attachment metadata without trusting its shape. */
function countMetaFiles(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function toPayload(data: DraftInput): DraftPayload {
  if (typeof data === 'string') return { body: data, files: [] }
  return {
    ...(data.title !== undefined ? { title: data.title } : {}),
    body: data.body,
    files: toMetaFiles(data.files),
  }
}

/**
 * Scan localStorage for persisted drafts of every composer (P2-T3).
 *
 * Returns one summary per `draft:signal-<threadId>`, `draft:launch-<slug>`
 * or `draft:report-<postId>` entry that carries something to finish: text,
 * a title (an unlaunched thread title, a chosen report reason) or at least
 * one attachment. Malformed JSON, foreign keys and empty buffers are
 * silently skipped. Newest first (`savedAt` desc).
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
    const match = parseDraftKey(key)
    if (!match) continue

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
    // Attachments survive as `[{name, size}]` metadata — that is the count
    // the drafts panel shows, the one thing left of a lost file.
    const filesCount = countMetaFiles(record.files)
    const savedAt = typeof record.timestamp === 'number' ? record.timestamp : 0
    // The title slot carries the thread title / report reason. Both are
    // worth resuming on their own, so they count as content.
    const title = typeof record.title === 'string' ? record.title.trim() : ''

    // A buffer with neither text nor subject nor attachments is not a draft.
    if (body.trim().length === 0 && title.length === 0 && filesCount === 0) continue

    const summary: DraftSummary = {
      key,
      kind: match.kind,
      body,
      filesCount,
      savedAt,
      ...match.subject,
    }
    if (title.length > 0) summary.title = title
    summaries.push(summary)
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
 *
 * DRAFT-01, two guarantees on top of the debounce:
 *  - a pending write is flushed immediately on `pagehide` / tab hiding, so
 *    closing the tab inside the debounce window no longer eats the text;
 *  - attachments persist as metadata, and `hasRestoredFiles` tells the
 *    surface whether the restored draft came with attachments the user
 *    has to attach again.
 */
export function useDraft(key: string) {
  const storageKey = `${DRAFT_PREFIX}${key}`
  const draft = ref<Draft | null>(null)
  const hasDraft = ref(false)
  const status = ref<DraftStatus>('idle')
  const savedAt = ref<number | null>(null)
  // Restored draft whose saved attachments are metadata now — the surface
  // must say so out loud instead of silently dropping them.
  const hasRestoredFiles = ref(false)

  // The payload waiting for its debounce slot, so a flush can write the
  // very same bytes without waiting for the timer.
  let pending: DraftPayload | null = null
  let saveTimeout: number | null = null

  function persist(payload: DraftPayload): void {
    try {
      const draftData: Draft = {
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        body: payload.body,
        files: payload.files,
        timestamp: Date.now(),
      }
      localStorage.setItem(storageKey, JSON.stringify(draftData))
      hasDraft.value = true
      savedAt.value = draftData.timestamp
      status.value = 'saved'
    } catch (error) {
      // Quota / security errors are a status, never a throw: a draft is a
      // convenience, the form must keep working without it.
      console.warn('Failed to save draft:', error)
      status.value = 'error'
    }
  }

  function cancelPending(): void {
    if (saveTimeout !== null) {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }
    pending = null
  }

  /** Write the debounced payload now (idempotent, never throws). */
  function flush(): void {
    const payload = pending
    cancelPending()
    if (!payload) return
    persist(payload)
  }

  // Load draft from localStorage on mount
  function loadDraft(): void {
    try {
      const stored = localStorage.getItem(storageKey)
      if (!stored) return
      const parsed: unknown = JSON.parse(stored)
      if (typeof parsed !== 'object' || parsed === null) return
      const record = parsed as Record<string, unknown>
      // Attachments come back as metadata (DRAFT-01), not as phantom files.
      const files = toMetaFiles(record.files)
      draft.value = {
        title: typeof record.title === 'string' ? record.title : '',
        body: typeof record.body === 'string' ? record.body : '',
        files,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : Date.now(),
      }
      hasDraft.value = true
      hasRestoredFiles.value = files.length > 0
      status.value = 'saved'
      savedAt.value = draft.value.timestamp
    } catch (error) {
      console.warn('Failed to load draft:', error)
      status.value = 'error'
    }
  }

  // Save draft to localStorage with debounce
  function saveDraft(data: DraftInput) {
    if (saveTimeout !== null) {
      clearTimeout(saveTimeout)
    }
    pending = toPayload(data)
    status.value = 'writing'
    saveTimeout = window.setTimeout(() => {
      const payload = pending
      cancelPending()
      if (payload) persist(payload)
    }, DEBOUNCE_MS)
  }

  // Write whatever is pending right now — the tab is going away.
  function onPageHide(): void {
    flush()
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') flush()
  }

  onMounted(() => {
    loadDraft()
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    // Unmounting the surface (route change, dock teardown) loses text just
    // as easily as closing the tab — so flush here too.
    flush()
  })

  // Clear draft
  function clearDraft() {
    cancelPending()
    try {
      localStorage.removeItem(storageKey)
      draft.value = null
      hasDraft.value = false
      hasRestoredFiles.value = false
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
    hasRestoredFiles,
    saveDraft,
    clearDraft,
    restoreDraft,
  }
}

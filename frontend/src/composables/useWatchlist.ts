import { computed, ref } from 'vue'

/**
 * Tracked nodes (WATCHLIST, NEXT-08).
 *
 * The forum is anonymous — there are no accounts — so "watching" is a
 * device-local bookmark with an honest unread count: how many replies
 * appeared since you last read the thread. Reading a thread snapshots
 * the count; boards stay quiet until a new signal arrives.
 */

const STORAGE_KEY = 'bmstudvach-watchlist'

export interface WatchEntry {
  threadId: number
  title: string
  seenReplies: number
  updatedAt: number
}

function load(): WatchEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e: unknown): e is WatchEntry =>
        !!e && typeof (e as WatchEntry).threadId === 'number',
    )
  } catch {
    return []
  }
}

const entries = ref<WatchEntry[]>(load())

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value))
  } catch {
    // storage full/blocked — watching degrades to session-only
  }
}

export function useWatchlist() {
  function isTracked(threadId: number): boolean {
    return entries.value.some((e) => e.threadId === threadId)
  }

  function track(threadId: number, title: string, currentReplies: number) {
    const existing = entries.value.find((e) => e.threadId === threadId)
    if (existing) return
    entries.value.unshift({
      threadId,
      title,
      seenReplies: currentReplies,
      updatedAt: Date.now(),
    })
    persist()
  }

  function untrack(threadId: number) {
    entries.value = entries.value.filter((e) => e.threadId !== threadId)
    persist()
  }

  function toggle(threadId: number, title: string, currentReplies: number) {
    if (isTracked(threadId)) untrack(threadId)
    else track(threadId, title, currentReplies)
  }

  /** snapshot: the thread was just read up to `currentReplies` */
  function markSeen(threadId: number, currentReplies: number) {
    const entry = entries.value.find((e) => e.threadId === threadId)
    if (!entry) return
    entry.seenReplies = currentReplies
    entry.updatedAt = Date.now()
    persist()
  }

  function unread(threadId: number, currentReplies: number): number {
    const entry = entries.value.find((e) => e.threadId === threadId)
    if (!entry) return 0
    return Math.max(0, currentReplies - entry.seenReplies)
  }

  const trackedIds = computed(() => entries.value.map((e) => e.threadId))

  /** total unread across the watchlist given current reply counts */
  function totalUnread(counts: Record<number, number>): number {
    return entries.value.reduce(
      (sum, e) => sum + (counts[e.threadId] ? unread(e.threadId, counts[e.threadId]) : 0),
      0,
    )
  }

  return {
    entries,
    trackedIds,
    isTracked,
    track,
    untrack,
    toggle,
    markSeen,
    unread,
    totalUnread,
  }
}

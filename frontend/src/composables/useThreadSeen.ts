import { onScopeDispose, ref } from 'vue'
import type { Post } from '@/types'

/**
 * Маркер новых постов в треде (SEEN-01).
 *
 * Форум анонимный — аккаунтов нет — поэтому «уже читал» живёт на устройстве:
 * localStorage хранит для каждого треда максимальный увиденный post-id. При
 * повторном открытии треда посты старше этой границы считаются прочитанными,
 * между прочитанным и новым рисуется разделитель.
 */

const STORAGE_KEY = 'bmstud-thread-seen'

type SeenMap = Record<string, number>

function readStorage(): SeenMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: SeenMap = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue
      map[key] = Math.floor(value)
    }
    return map
  } catch {
    return {}
  }
}

function writeStorage(map: SeenMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // storage заблокирован или переполнен — маркер живёт до перезагрузки
  }
}

export function useThreadSeen() {
  const seen = ref<SeenMap>(readStorage())

  function sync() {
    seen.value = readStorage()
  }

  function onStorage(event: StorageEvent) {
    if (event.key === null || event.key === STORAGE_KEY) sync()
  }

  window.addEventListener('storage', onStorage)
  onScopeDispose(() => window.removeEventListener('storage', onStorage), true)

  /** Максимальный post-id, увиденный в этом треде ранее; 0 — первого визита не было. */
  function lastSeenPostId(threadId: number): number {
    return seen.value[String(threadId)] ?? 0
  }

  /** Идемпотентно: меньший или равный id границу не откатывает. */
  function markSeen(threadId: number, maxPostId: number) {
    if (!Number.isFinite(maxPostId) || maxPostId <= 0) return
    const key = String(threadId)
    if (maxPostId <= (seen.value[key] ?? 0)) return
    const next = { ...seen.value, [key]: Math.floor(maxPostId) }
    seen.value = next
    writeStorage(next)
  }

  /** Посты треда с id выше границы. Без записи (граница 0) считает все посты. */
  function newPostsCount(threadId: number, posts: Post[]): number {
    const boundary = lastSeenPostId(threadId)
    if (!posts.length) return 0
    return posts.reduce((count, post) => (post.id > boundary ? count + 1 : count), 0)
  }

  return { seen, lastSeenPostId, markSeen, newPostsCount }
}

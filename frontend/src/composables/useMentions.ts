import { computed, ref } from 'vue'

import { getMentions } from '@/api/mentions'
import type { Mention } from '@/api/mentions'

/**
 * Ответы мне (MENTION-01) — слежение за своими трипкодами.
 *
 * Аккаунтов нет, поэтому «мои» посты узнаёт только трипкод `!xxxxxxxx`:
 * сервер собирает ответы (`>>N`) на посты с этим кодом. В localStorage
 * попадают исключительно коды — секрет «Имя#секрет» остаётся в композере
 * и на устройство не пишется.
 *
 * Состояние создаётся на каждый вызов и читается из localStorage:
 * устройство — источник правды, поэтому список кодов и прочитанное
 * переживают перезагрузку страницы.
 */

const IDENTITIES_KEY = 'bmstud-identities'
const SEEN_KEY = 'bmstud-mentions-seen'
export const TRIPCODE_MAX = 16
const MENTION_LIMIT = 30

const CONTROL_CODES = /[\u0000-\u001f\u007f-\u009f]/g

/**
 * Обрезает управляющие символы, тримит, берёт первое слово и режет до
 * TRIPCODE_MAX. Всё, что не начинается с `!`, отбрасывается: сырой
 * «Имя#секрет» трипкодом не является и в localStorage попасть не должен.
 */
export function normalizeTripcode(raw: string): string {
  const cleaned = (raw ?? '').replace(CONTROL_CODES, '').trim()
  const token = cleaned.split(/\s+/)[0] ?? ''
  if (!token.startsWith('!') || token.length < 2) return ''
  return token.slice(0, TRIPCODE_MAX)
}

function loadTripcodes(): string[] {
  try {
    const raw = localStorage.getItem(IDENTITIES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const codes = parsed
      .filter((v): v is string => typeof v === 'string')
      .map(normalizeTripcode)
      .filter(Boolean)
    return [...new Set(codes)]
  } catch {
    // storage заблокирован или JSON битый — слежение выключено
    return []
  }
}

function loadSeen(): number[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is number => typeof v === 'number' && v > 0)
  } catch {
    return []
  }
}

function persist(tripcodes: string[], seen: number[]): void {
  try {
    localStorage.setItem(IDENTITIES_KEY, JSON.stringify(tripcodes))
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    // storage переполнен/заблокирован — слежение живёт только в сессии
  }
}

/** code → ответы (null, если запрос за этим кодом не удался). */
async function fetchAll(
  tripcodes: string[],
): Promise<Record<string, Mention[] | null>> {
  const results = await Promise.all(
    tripcodes.map(async (code) => {
      try {
        const data = await getMentions(code)
        return [code, Array.isArray(data.mentions) ? data.mentions : []] as const
      } catch {
        // сеть/400 не должны ломать UI — этот код просто молчит
        return [code, null] as const
      }
    }),
  )
  return Object.fromEntries(results)
}

export function useMentions() {
  const tripcodes = ref<string[]>(loadTripcodes())
  const seen = ref<number[]>(loadSeen())
  const byTripcode = ref<Record<string, Mention[]>>({})
  const loading = ref(false)
  const failed = ref(false)

  const mentions = computed<Mention[]>(() => {
    const unique = new Map<number, Mention>()
    for (const list of Object.values(byTripcode.value)) {
      for (const mention of list) {
        if (!unique.has(mention.post)) unique.set(mention.post, mention)
      }
    }
    return [...unique.values()]
      .sort((a, b) => {
        // свежие сверху; равные метки времени разводим по id поста
        if (a.created_at === b.created_at) return b.post - a.post
        return a.created_at < b.created_at ? 1 : -1
      })
      .slice(0, MENTION_LIMIT)
  })

  const unread = computed<Mention[]>(() =>
    mentions.value.filter((m) => !seen.value.includes(m.post)),
  )

  const unreadCount = computed(() => unread.value.length)

  function addTripcode(raw: string): boolean {
    const code = normalizeTripcode(raw)
    if (!code || tripcodes.value.includes(code)) return false
    tripcodes.value = [...tripcodes.value, code]
    persist(tripcodes.value, seen.value)
    return true
  }

  function removeTripcode(code: string): void {
    tripcodes.value = tripcodes.value.filter((t) => t !== code)
    const rest: Record<string, Mention[]> = {}
    for (const [key, value] of Object.entries(byTripcode.value)) {
      if (key !== code) rest[key] = value
    }
    byTripcode.value = rest
    persist(tripcodes.value, seen.value)
  }

  function markSeen(postId: number): void {
    if (seen.value.includes(postId)) return
    seen.value = [...seen.value, postId]
    persist(tripcodes.value, seen.value)
  }

  async function refresh(): Promise<void> {
    if (!tripcodes.value.length) {
      byTripcode.value = {}
      failed.value = false
      loading.value = false
      return
    }
    loading.value = true
    try {
      const next = await fetchAll(tripcodes.value)
      byTripcode.value = Object.fromEntries(
        Object.entries(next).map(([code, list]) => [code, list ?? []]),
      )
      failed.value = tripcodes.value.every((code) => next[code] === null)
    } catch {
      // недостижимо: fetchAll гасит ошибки сам, но UI всё равно не падает
      byTripcode.value = {}
      failed.value = true
    } finally {
      loading.value = false
    }
  }

  return {
    tripcodes,
    seen,
    mentions,
    unread,
    unreadCount,
    loading,
    failed,
    addTripcode,
    removeTripcode,
    markSeen,
    refresh,
  }
}

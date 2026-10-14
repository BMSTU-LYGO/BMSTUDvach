import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'

import type { Post } from '@/types'

/**
 * FINDPOST-01 — поиск внутри открытого треда и навигация `j`/`k`.
 *
 * Чистые функции (`matchPostIds`, `splitHighlight`) живут отдельно от
 * реактивности: подсветку и список совпадений можно проверить без DOM.
 * Композабл добавляет только состояние поиска (открыть/закрыть, счётчик,
 * переход по совпадениям) и «курсор» постов для `j`/`k`. Клавиатурные
 * слушатели навешивает вьюха — здесь только логика и guard.
 */

export interface HighlightSegment {
  text: string
  hit: boolean
}

const MODAL_SELECTOR = '[role="dialog"], [aria-modal="true"]'
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]'

/**
 * Строка ввода, любое поле формы или contenteditable перехватывают клавиши:
 * `f`/`j`/`k` там должны печататься, а не управлять читалкой.
 */
export function isEditableTarget(target: EventTarget | Element | null): boolean {
  if (!target) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  const element = target instanceof Element ? target : null
  return !!element?.closest?.(EDITABLE_SELECTOR)
}

/** Открыта ли модалка/лайтбокс — там читалка молчит. */
export function isModalOpen(doc: Document = document): boolean {
  return !!doc.querySelector(MODAL_SELECTOR)
}

/**
 * id постов, чьё тело содержит запрос (регистронезависимо, по trim).
 * Запрос короче двух символов совпадений не даёт — искать «а» бессмысленно.
 */
export function matchPostIds(posts: Post[], query: string): number[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []
  const ids: number[] = []
  for (const post of posts) {
    if (post.body.toLowerCase().includes(needle)) ids.push(post.id)
  }
  return ids
}

/**
 * Режет текст на сегменты подсветки. Последовательный поиск без учёта
 * перекрытий: `ааа` с запросом `аа` даёт `[аа][а]`, а не `[а][а][а]`.
 * Возвращает исходный регистр текста; пустой запрос — один не-hit сегмент.
 */
export function splitHighlight(text: string, query: string): HighlightSegment[] {
  const needle = query.trim()
  if (!needle || !text) return [{ text, hit: false }]

  const haystack = text.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  const segments: HighlightSegment[] = []
  let last = 0
  let index = haystack.indexOf(lowerNeedle)

  while (index !== -1) {
    if (index > last) segments.push({ text: text.slice(last, index), hit: false })
    segments.push({ text: text.slice(index, index + needle.length), hit: true })
    last = index + needle.length
    index = haystack.indexOf(lowerNeedle, last)
  }

  if (last < text.length) segments.push({ text: text.slice(last), hit: false })
  return segments
}

export interface UseThreadSearch {
  /** Запрос строки поиска. */
  query: Ref<string>
  /** Открыта ли строка поиска. */
  open: Ref<boolean>
  /** id постов с совпадением, в порядке следования. */
  matches: Ref<number[]>
  /** Индекс активного совпадения в `matches`; -1 — совпадений нет. */
  activeIndex: Ref<number>
  /** id активного поста или null. */
  activePostId: Ref<number | null>
  /** «N / M» для счётчика; пусто, пока нет запроса. */
  label: Ref<string>
  openSearch: () => void
  close: () => void
  next: () => void
  prev: () => void
  /** Курсор постов для j/k (индекс в полном списке постов). */
  cursorIndex: Ref<number>
  cursorNext: () => void
  cursorPrev: () => void
}

export function useThreadSearch(posts: Ref<Post[]>): UseThreadSearch {
  const query = ref('')
  const open = ref(false)
  const matches = computed(() => matchPostIds(posts.value, query.value))
  const activeIndex = ref(-1)

  // Новый запрос всегда стартует с первого совпадения. Синхронный flush,
  // чтобы счётчик и цель скролла были верными уже в том же кадре.
  watch(
    query,
    () => {
      activeIndex.value = matches.value.length ? 0 : -1
    },
    { flush: 'sync' },
  )

  const activePostId = computed<number | null>(() => {
    if (activeIndex.value < 0) return null
    return matches.value[activeIndex.value] ?? null
  })

  const label = computed(() => {
    if (!open.value) return ''
    if (!matches.value.length) return query.value.trim().length >= 2 ? '0 / 0' : ''
    const position = activeIndex.value >= 0 ? activeIndex.value + 1 : 1
    return `${position} / ${matches.value.length}`
  })

  function openSearch(): void {
    open.value = true
  }

  function close(): void {
    open.value = false
    query.value = ''
    activeIndex.value = -1
  }

  function next(): void {
    const total = matches.value.length
    if (!total) return
    activeIndex.value = activeIndex.value < 0 ? 0 : (activeIndex.value + 1) % total
  }

  function prev(): void {
    const total = matches.value.length
    if (!total) return
    activeIndex.value = activeIndex.value <= 0 ? total - 1 : activeIndex.value - 1
  }

  const cursorIndex = ref(-1)

  function cursorNext(): void {
    const total = posts.value.length
    if (!total) {
      cursorIndex.value = -1
      return
    }
    cursorIndex.value =
      cursorIndex.value < 0 ? 0 : Math.min(cursorIndex.value + 1, total - 1)
  }

  function cursorPrev(): void {
    const total = posts.value.length
    if (!total) {
      cursorIndex.value = -1
      return
    }
    cursorIndex.value =
      cursorIndex.value < 0 ? total - 1 : Math.max(cursorIndex.value - 1, 0)
  }

  return {
    query,
    open,
    matches,
    activeIndex,
    activePostId,
    label,
    openSearch,
    close,
    next,
    prev,
    cursorIndex,
    cursorNext,
    cursorPrev,
  }
}

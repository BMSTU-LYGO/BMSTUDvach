import { computed, ref } from 'vue'

/**
 * Локально скрытые треды (HIDE-01).
 *
 * Форум анонимный — аккаунтов нет — поэтому «скрыть неинтересный тред»
 * живёт на устройстве: localStorage хранит список id тредов. Скрытые
 * строки не показываются, пока не включён режим «показать скрытые»
 * (флаг reveal). Хранение — массив чисел, чтение — защищённое, запись
 * синхронная, обновления подхватываются из других вкладок через
 * `storage`-событие.
 */

const STORAGE_KEY = 'bmstud-hidden-threads'
const REVEAL_KEY = 'bmstud-hidden-reveal'

function readHidden(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    const ids = new Set<number>()
    for (const value of parsed) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) continue
      ids.add(value)
    }
    return ids
  } catch {
    return new Set()
  }
}

function readReveal(): boolean {
  try {
    return localStorage.getItem(REVEAL_KEY) === '1'
  } catch {
    return false
  }
}

function writeHidden(ids: Set<number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // storage заблокирован или переполнен — скрытие живёт до перезагрузки
  }
}

function writeReveal(value: boolean) {
  try {
    localStorage.setItem(REVEAL_KEY, value ? '1' : '0')
  } catch {
    // storage заблокирован — режим показа живёт до перезагрузки
  }
}

// Единое состояние на всё приложение: строка треда и счётчик-индикатор
// должны видеть одни и те же данные и реагировать на изменения.
const hiddenIds = ref<Set<number>>(readHidden())
const revealHidden = ref<boolean>(readReveal())

function reload() {
  hiddenIds.value = readHidden()
  revealHidden.value = readReveal()
}

function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === STORAGE_KEY) hiddenIds.value = readHidden()
  if (event.key === null || event.key === REVEAL_KEY) revealHidden.value = readReveal()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', onStorage)
}

export function useHiddenThreads() {
  const ids = computed(() => hiddenIds.value)
  const count = computed(() => hiddenIds.value.size)

  function isHidden(threadId: number): boolean {
    return hiddenIds.value.has(threadId)
  }

  function hide(threadId: number) {
    if (!Number.isInteger(threadId) || threadId <= 0) return
    if (hiddenIds.value.has(threadId)) return
    const next = new Set(hiddenIds.value)
    next.add(threadId)
    hiddenIds.value = next
    writeHidden(next)
  }

  function unhide(threadId: number) {
    if (!hiddenIds.value.has(threadId)) return
    const next = new Set(hiddenIds.value)
    next.delete(threadId)
    hiddenIds.value = next
    writeHidden(next)
  }

  function toggle(threadId: number) {
    if (isHidden(threadId)) unhide(threadId)
    else hide(threadId)
  }

  function toggleReveal() {
    const next = !revealHidden.value
    revealHidden.value = next
    writeReveal(next)
    return next
  }

  return {
    hiddenIds: ids,
    hiddenCount: count,
    revealHidden,
    isHidden,
    hide,
    unhide,
    toggle,
    toggleReveal,
  }
}

/** Только для тестов: перечитать состояние из localStorage. */
export function __reloadHiddenThreads() {
  reload()
}

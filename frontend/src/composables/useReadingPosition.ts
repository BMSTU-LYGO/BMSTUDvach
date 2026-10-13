import { onScopeDispose } from 'vue'

/**
 * Позиция чтения треда (POSITION-01).
 *
 * Аккаунтов нет — «где я остановился» живёт на устройстве: localStorage хранит
 * для каждого треда последний window.scrollY. Уходишь из треда — позиция
 * фиксируется; возвращаешься — страница встаёт на то же место после рендера
 * постов. Честно и буквально: если тред оброс новыми постами, позиция
 * восстанавливается по пикселю как есть.
 *
 * localStorage может быть заблокирован или забит — composable обязан молча
 * деградировать, а не ронять чтение.
 */

const STORAGE_KEY = 'bmstud-thread-position'
/** Скролл меняется каждый кадр — писать чаще 200 мс незачем. */
const WRITE_INTERVAL = 200

type PositionMap = Record<string, number>

function readStorage(): PositionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: PositionMap = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue
      map[key] = Math.floor(value)
    }
    return map
  } catch {
    return {}
  }
}

function writeStorage(map: PositionMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // storage заблокирован или переполнен — позиция живёт до перезагрузки
  }
}

/**
 * Верхняя граница прокрутки. Документ без раскладки (или тестовая среда)
 * сообщает 0 — тогда не ограничиваем, иначе восстановление всегда дало бы 0.
 */
function scrollLimit(): number {
  const height = document.documentElement.scrollHeight
  return height > 0 ? height : Number.POSITIVE_INFINITY
}

function clampPosition(y: number): number {
  if (!Number.isFinite(y)) return 0
  return Math.min(Math.max(0, Math.floor(y)), scrollLimit())
}

export function useReadingPosition() {
  /** Восстанавливает сохранённую позицию треда. false — своей позиции нет. */
  function restore(threadId: number): boolean {
    const saved = readStorage()[String(threadId)]
    if (typeof saved !== 'number' || saved <= 0) return false
    const y = clampPosition(saved)
    if (y <= 0) return false
    window.scrollTo(0, y)
    return true
  }

  /** Фиксирует текущую позицию треда (мусор и отрицательные значения отбрасываются). */
  function remember(threadId: number, y: number) {
    const map = readStorage()
    map[String(threadId)] = clampPosition(y)
    writeStorage(map)
  }

  /**
   * Держит позицию треда актуальной: скролл (passive, rAF + троттлинг 200 мс),
   * уход со вкладки и выгрузка страницы. Возвращает stop().
   */
  function watchPosition(threadId: number): () => void {
    let frame: number | null = null
    let lastWrite = 0
    let stopped = false

    const cancelFrame = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
    }

    // уходя со страницы, пишем сразу: отложенный кадр уже не хватит
    const flush = () => {
      cancelFrame()
      lastWrite = Date.now()
      remember(threadId, window.scrollY)
    }

    const onFrame = () => {
      frame = null
      const now = Date.now()
      if (stopped || now - lastWrite < WRITE_INTERVAL) return
      lastWrite = now
      remember(threadId, window.scrollY)
    }

    const onScroll = () => {
      if (stopped || frame !== null) return
      frame = requestAnimationFrame(onFrame)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)

    const stop = () => {
      if (stopped) return
      stopped = true
      cancelFrame()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }

    onScopeDispose(stop, true)

    return stop
  }

  return { restore, remember, watchPosition }
}

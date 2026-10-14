import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * NAV-01 — vim-like keyboard navigation.
 *
 * Sequential `g` + key shortcuts plus a standalone `/` for the network
 * scanner. Pure sequence matching lives in `matchNavSequence` so the table
 * is testable without a DOM; the composable only adds the router, the
 * prefix window and the guards that keep typing and modals untouched.
 *
 * SHORTCUTS-01 — `?` toggles the shortcut cheat-sheet. The dialog itself is
 * owned by the host (App.vue) and bound to the `shortcutsOpen` ref this
 * composable exposes: pressing `?` flips it to `true`, the host renders the
 * dialog. The same guards apply — `?` never fires from a field or while a
 * modal layer is already in the DOM.
 */

export type NavAction =
  { kind: 'route'; to: string } | { kind: 'last-thread' } | { kind: 'scroll-top' }

export interface NavShortcutsOptions {
  /** Opens the global scanner (SCAN LENS) for the `/` shortcut. */
  onOpenSearch?: () => void
}

export const NAV_PREFIX_KEY = 'g'
export const NAV_PREFIX_TIMEOUT = 1500

export const SCAN_OPEN_EVENT = 'bmstudvach:open-scan'
const SCAN_BUTTON_SELECTOR = 'button[aria-label^="Поиск по сети"]'

const MODAL_SELECTOR = '[role="dialog"], [aria-modal="true"]'
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]'

const THREAD_PATH_RE = /^\/threads\/\d+/

const SEQUENCES: Record<string, NavAction> = {
  h: { kind: 'route', to: '/' },
  b: { kind: 'route', to: '/' },
  m: { kind: 'route', to: '/moderation' },
  t: { kind: 'last-thread' },
}

/** `g` + key → action. Case-insensitive; unknown or foreign pairs are null. */
export function matchNavSequence(first: string, second: string): NavAction | null {
  if (first.toLowerCase() !== NAV_PREFIX_KEY) return null
  return SEQUENCES[second.toLowerCase()] ?? null
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLElement && el.isContentEditable) return true
  return !!el.closest?.(EDITABLE_SELECTOR)
}

/**
 * Typing and modal layers must never be hijacked: a field, a contenteditable
 * or anything inside a dialog (the scanner, the lightbox, the report probe)
 * swallows every shortcut.
 */
function isBlockedContext(event: KeyboardEvent): boolean {
  if (event.target instanceof Element && isEditableElement(event.target)) return true
  const active = document.activeElement
  if (isEditableElement(active)) return true
  if (active?.closest?.(MODAL_SELECTOR)) return true
  return !!document.querySelector(MODAL_SELECTOR)
}

export function useNavShortcuts(options: NavShortcutsOptions = {}) {
  const router = useRouter()
  const route = useRoute()

  /** SHORTCUTS-01 — host-owned cheat-sheet visibility, flipped by `?`. */
  const shortcutsOpen = ref(false)

  let lastThreadPath: string | null = null
  watch(
    () => route.path,
    (path) => {
      if (THREAD_PATH_RE.test(path)) lastThreadPath = path
    },
    { immediate: true },
  )

  let prefixArmed = false
  let prefixTimer: ReturnType<typeof setTimeout> | null = null

  function clearPrefix(): void {
    prefixArmed = false
    if (prefixTimer !== null) {
      clearTimeout(prefixTimer)
      prefixTimer = null
    }
  }

  function armPrefix(): void {
    clearPrefix()
    prefixArmed = true
    prefixTimer = setTimeout(clearPrefix, NAV_PREFIX_TIMEOUT)
  }

  function scrollTop(): void {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  function runAction(action: NavAction): void {
    if (action.kind === 'route') {
      void router.push(action.to)
      return
    }
    if (action.kind === 'last-thread' && lastThreadPath) {
      void router.push(lastThreadPath)
      return
    }
    scrollTop()
  }

  function openSearch(): void {
    if (options.onOpenSearch) {
      options.onOpenSearch()
      return
    }
    const handled = !window.dispatchEvent(
      new CustomEvent(SCAN_OPEN_EVENT, { cancelable: true }),
    )
    if (!handled)
      document.querySelector<HTMLButtonElement>(SCAN_BUTTON_SELECTOR)?.click()
  }

  function isNavKey(key: string): boolean {
    if (prefixArmed) return true
    return key === '/' || key === '?' || key.toLowerCase() === NAV_PREFIX_KEY
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
    if (!isNavKey(event.key)) return
    if (isBlockedContext(event)) return

    if (prefixArmed) {
      const action = matchNavSequence(NAV_PREFIX_KEY, event.key)
      clearPrefix()
      if (!action) return
      event.preventDefault()
      runAction(action)
      return
    }

    if (event.key === '/') {
      event.preventDefault()
      openSearch()
      return
    }

    if (event.key === '?') {
      event.preventDefault()
      shortcutsOpen.value = true
      return
    }

    event.preventDefault()
    armPrefix()
  }

  function start(): void {
    window.addEventListener('keydown', onKeydown)
  }

  function stop(): void {
    window.removeEventListener('keydown', onKeydown)
    clearPrefix()
  }

  onMounted(start)
  onBeforeUnmount(stop)

  return { start, stop, shortcutsOpen }
}

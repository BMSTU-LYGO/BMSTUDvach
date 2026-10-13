import { ref } from 'vue'

/**
 * Identity (TRIP-01) — the optional «Имя#секрет» kept on the device.
 *
 * The forum has no accounts: the name is a convenience, the secret is a
 * local-only string that the server turns into a tripcode. Nothing here
 * computes or stores tripcodes — that is a server-side one-way function.
 */

const STORAGE_KEY = 'bmstud-identity'
export const IDENTITY_NAME_MAX = 64

const CONTROL_CODES = /[\u0000-\u001f\u007f-\u009f]/g

/** Trim, strip control characters, cap at 64 — mirrors backend display_name. */
export function normalizeIdentityName(raw: string): string {
  return (raw ?? '').replace(CONTROL_CODES, '').trim().slice(0, IDENTITY_NAME_MAX)
}

function load(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return ''
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'string') return normalizeIdentityName(parsed)
    const value = (parsed as { name?: unknown } | null)?.name
    return typeof value === 'string' ? normalizeIdentityName(value) : ''
  } catch {
    // storage blocked or corrupt JSON — identity degrades to anonymous
    return ''
  }
}

function persist(name: string): void {
  try {
    if (name) localStorage.setItem(STORAGE_KEY, JSON.stringify({ name }))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage full/blocked — identity stays session-only
  }
}

export function useIdentity() {
  const name = ref(load())

  function setName(raw: string): void {
    name.value = normalizeIdentityName(raw)
    persist(name.value)
  }

  function clear(): void {
    name.value = ''
    persist('')
  }

  return { name, setName, clear }
}

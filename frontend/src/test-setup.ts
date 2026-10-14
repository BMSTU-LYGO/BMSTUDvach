/**
 * Global test setup.
 *
 * jsdom implements neither matchMedia nor scrollIntoView; without stubs
 * every component that transitively pulls GSAP (ScrollTrigger) fails at
 * import time. One place beats per-spec mocks.
 */
import { vi } from 'vitest'

/**
 * Node 22 ships an experimental `localStorage` shim (empty unless the
 * process is started with `--localstorage-file`) that shadows jsdom's
 * Storage and lacks methods like `clear()`. Install a real in-memory
 * Storage so composables that persist device-local state behave the same
 * as in the browser.
 */
function installLocalStorage() {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: storage,
  })
}

if (typeof localStorage === 'undefined' || typeof localStorage.clear !== 'function') {
  installLocalStorage()
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

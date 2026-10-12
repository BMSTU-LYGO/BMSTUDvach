/**
 * Global test setup.
 *
 * jsdom implements neither matchMedia nor scrollIntoView; without stubs
 * every component that transitively pulls GSAP (ScrollTrigger) fails at
 * import time. One place beats per-spec mocks.
 */
import { vi } from 'vitest'

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

import { describe, it, expect, beforeEach, vi } from 'vitest'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

const audioInstances: MockAudioContext[] = []

class MockAudioContext {
  state: AudioContextState = 'running'
  currentTime = 0
  destination = {}

  constructor() {
    audioInstances.push(this)
  }

  createOscillator() {
    return {
      type: 'sine' as OscillatorType,
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
  }

  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }
  }

  resume() {}
}

vi.stubGlobal('AudioContext', MockAudioContext)

/** Re-import the module (and vue) fresh so the module-level singleton re-reads storage. */
async function load() {
  const vue = await import('vue')
  const mod = await import('@/composables/useSound')
  return { useSound: mod.useSound, nextTick: vue.nextTick }
}

describe('useSound', () => {
  beforeEach(() => {
    localStorageMock.clear()
    audioInstances.length = 0
    vi.resetModules()
  })

  it('is disabled by default', async () => {
    const { useSound } = await load()
    const { soundEnabled } = useSound()
    expect(soundEnabled.value).toBe(false)
    expect(localStorageMock.getItem('bmstudvach-sound')).toBeNull()
  })

  it('restores the persisted value on init', async () => {
    localStorageMock.setItem('bmstudvach-sound', 'true')
    const { useSound } = await load()
    expect(useSound().soundEnabled.value).toBe(true)
  })

  it('toggle flips the state and persists it', async () => {
    const { useSound, nextTick } = await load()
    const s = useSound()

    s.toggle()
    expect(s.soundEnabled.value).toBe(true)
    await nextTick()
    expect(localStorageMock.getItem('bmstudvach-sound')).toBe('true')

    s.toggle()
    expect(s.soundEnabled.value).toBe(false)
    await nextTick()
    expect(localStorageMock.getItem('bmstudvach-sound')).toBe('false')
  })

  it('setEnabled writes the explicit value', async () => {
    const { useSound, nextTick } = await load()
    const s = useSound()

    s.setEnabled(true)
    await nextTick()
    expect(localStorageMock.getItem('bmstudvach-sound')).toBe('true')

    s.setEnabled(false)
    await nextTick()
    expect(localStorageMock.getItem('bmstudvach-sound')).toBe('false')
  })

  it('shares one state between consumers', async () => {
    const { useSound } = await load()
    const a = useSound()
    const b = useSound()

    a.toggle()
    expect(b.soundEnabled.value).toBe(true)
  })

  it('does not touch the audio API while disabled', async () => {
    const { useSound } = await load()
    const s = useSound()

    s.sounds.hover()
    s.sounds.click()
    s.sounds.submit()
    s.sounds.error()

    expect(audioInstances).toHaveLength(0)
  })

  it('creates the audio context once enabled', async () => {
    const { useSound } = await load()
    const s = useSound()

    s.setEnabled(true)
    s.sounds.click()

    expect(audioInstances).toHaveLength(1)
  })
})

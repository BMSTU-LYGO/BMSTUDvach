import { ref, watch } from 'vue'

/**
 * Minimal ambient UI sounds via Web Audio API (no audio assets).
 * Disabled by default; the user can toggle it in the header.
 *
 * `soundEnabled` is a module-level singleton so the header switch and the
 * consumers in views/3D cards all share one reactive state. Persisted to
 * localStorage under `bmstudvach-sound`.
 */

const STORAGE_KEY = 'bmstudvach-sound'

function readStored(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function persist(value: boolean) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(value))
    }
  } catch {
    /* private mode etc. */
  }
}

const soundEnabled = ref(readStored())

watch(soundEnabled, persist)

let audioCtx: AudioContext | null = null

function ensureContext(): AudioContext | null {
  if (!soundEnabled.value) return null
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext()
    } catch {
      return null
    }
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  return audioCtx
}

function playTone(
  freq: number,
  { duration = 0.08, volume = 0.04, type = 'sine' as OscillatorType, sweep = 0 } = {},
) {
  if (!soundEnabled.value) return
  const ctx = ensureContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ctx.currentTime)
  if (sweep) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, freq + sweep),
      ctx.currentTime + duration,
    )
  }
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
}

export function useSound() {
  function setEnabled(value: boolean) {
    soundEnabled.value = value
  }

  function toggle() {
    soundEnabled.value = !soundEnabled.value
  }

  return {
    soundEnabled,
    setEnabled,
    toggle,
    /** Backwards-compatible alias kept for existing callers. */
    toggleSound: toggle,
    sounds: {
      hover: () => playTone(2200, { duration: 0.03, volume: 0.015 }),
      click: () => playTone(880, { duration: 0.05, volume: 0.03 }),
      submit: () =>
        playTone(520, { duration: 0.15, volume: 0.04, sweep: 260, type: 'triangle' }),
      error: () => playTone(220, { duration: 0.2, volume: 0.05, type: 'sawtooth', sweep: -80 }),
    },
  }
}

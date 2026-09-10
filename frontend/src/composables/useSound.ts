import { ref, watch } from 'vue'

/**
 * Minimal ambient UI sounds via Web Audio API (no audio assets).
 * Disabled by default; the user can toggle it in the header.
 */

const STORAGE_KEY = 'bmstudvach-sound'
const soundEnabled = ref(false)
let audioCtx: AudioContext | null = null

function ensureContext(): AudioContext | null {
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
  if (typeof localStorage !== 'undefined') {
    soundEnabled.value = localStorage.getItem(STORAGE_KEY) === 'true'
  }

  watch(soundEnabled, (val) => {
    localStorage.setItem(STORAGE_KEY, String(val))
  })

  return {
    soundEnabled,
    toggleSound: () => (soundEnabled.value = !soundEnabled.value),
    sounds: {
      hover: () => playTone(2200, { duration: 0.03, volume: 0.015 }),
      click: () => playTone(880, { duration: 0.05, volume: 0.03 }),
      submit: () =>
        playTone(520, { duration: 0.15, volume: 0.04, sweep: 260, type: 'triangle' }),
      error: () => playTone(220, { duration: 0.2, volume: 0.05, type: 'sawtooth', sweep: -80 }),
    },
  }
}

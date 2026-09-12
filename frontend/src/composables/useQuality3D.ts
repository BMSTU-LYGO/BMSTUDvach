import { computed, ref, watch } from 'vue'

/**
 * Central 3D quality manager — single source of truth for every WebGL scene.
 *
 * Setting (user choice, persisted): auto | high | low | off
 * Resolved (effective tier): high | low | off
 */

export type QualitySetting = 'auto' | 'high' | 'low' | 'off'
export type QualityResolved = 'high' | 'low' | 'off'

const STORAGE_KEY = 'bmstudvach-3d'
const ORDER: QualitySetting[] = ['auto', 'high', 'low', 'off']

function initialSetting(): QualitySetting {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as QualitySetting | null
    if (stored && ORDER.includes(stored)) return stored
  } catch {
    /* private mode etc. */
  }
  return 'auto'
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function detectTier(): QualityResolved {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  return coarse || cores <= 4 ? 'low' : 'high'
}

const setting = ref<QualitySetting>(initialSetting())
// One-way runtime degradation driven by the FPS monitor (reset on user change).
const override = ref<QualityResolved | null>(null)

const resolved = computed<QualityResolved>(() => {
  if (override.value) return override.value
  const s = setting.value
  if (s === 'off') return 'off'
  if (s === 'auto' && reducedMotion()) return 'off'
  if (s === 'high' || s === 'low') return s
  return detectTier()
})

watch(setting, (val) => {
  override.value = null
  try {
    localStorage.setItem(STORAGE_KEY, val)
  } catch {
    /* ignore */
  }
})

function cycleSetting() {
  const i = ORDER.indexOf(setting.value)
  setting.value = ORDER[(i + 1) % ORDER.length]
}

/** Called by useThreeScene when sustained FPS is too low: high→low→off. */
function degrade() {
  if (resolved.value === 'high') override.value = 'low'
  else if (resolved.value === 'low') override.value = 'off'
}

export function useQuality3D() {
  return { setting, resolved, cycleSetting, degrade }
}

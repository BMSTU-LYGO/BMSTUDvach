import { ref, watch, onMounted } from 'vue'

const STORAGE_KEY = 'bmstudvach-crt'

// Respect user motion preferences: CRT effects are on by default, but off
// for users who request reduced motion (unless they toggled it themselves).
function defaultCrt(): boolean {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  if (stored !== null) return stored === 'true'
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false
  }
  return true
}

const crtEnabled = ref(defaultCrt())
const vignetteEnabled = ref(true)
const flickerEnabled = ref(false) // subtle, off by default

export function useCRT() {
  onMounted(() => {
    applyCRT()
  })

  watch(crtEnabled, (val) => {
    localStorage.setItem(STORAGE_KEY, String(val))
    applyCRT()
  })

  function applyCRT() {
    document.documentElement.classList.toggle('crt-enabled', crtEnabled.value)
    document.documentElement.classList.toggle('crt-vignette', crtEnabled.value && vignetteEnabled.value)
    document.documentElement.classList.toggle('crt-flicker', crtEnabled.value && flickerEnabled.value)
  }

  function toggleCRT() {
    crtEnabled.value = !crtEnabled.value
  }

  return {
    crtEnabled,
    vignetteEnabled,
    flickerEnabled,
    toggleCRT,
  }
}

import { ref, watch, onMounted } from 'vue'

const STORAGE_KEY = 'bmstudvach-crt'

const crtEnabled = ref(true)
const vignetteEnabled = ref(true)
const flickerEnabled = ref(false) // subtle, off by default

export function useCRT() {
  onMounted(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      crtEnabled.value = stored === 'true'
    }
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

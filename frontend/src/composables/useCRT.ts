import { ref, watch, onMounted } from 'vue'

const STORAGE_KEY = 'bmstudvach-crt'

// The committed style is "engineering network", not "hacker terminal":
// CRT scanlines/vignette are an opt-in extra, off unless the user turned
// them on themselves.
function defaultCrt(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const crtEnabled = ref(defaultCrt())
const vignetteEnabled = ref(true)
const flickerEnabled = ref(false) // subtle, off by default

export function useCRT() {
  onMounted(() => {
    applyCRT()
  })

  watch(crtEnabled, (val) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(val))
    } catch {
      /* private mode */
    }
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

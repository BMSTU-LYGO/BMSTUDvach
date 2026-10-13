import { computed, onUnmounted, ref } from 'vue'

/**
 * PWA-оболочка (PWA-01).
 *
 * Регистрирует service worker только в production-сборке — в dev-режиме
 * Vite должен оставаться обычным dev-сервером. Состояние сети трекается
 * честно: navigator.onLine плюс online/offline события, без кэша API.
 */

export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return (
    'prompt' in event &&
    typeof (event as InstallPromptEvent).prompt === 'function' &&
    'userChoice' in event &&
    typeof (event as InstallPromptEvent).userChoice === 'object'
  )
}

let registrationStarted = false

export function usePwa() {
  const online = ref(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  )
  const installPrompt = ref<InstallPromptEvent | null>(null)
  const installable = computed(() => installPrompt.value !== null)

  function syncOnline() {
    online.value = navigator.onLine !== false
  }

  function onBeforeInstallPrompt(event: Event) {
    if (!isInstallPromptEvent(event)) return
    event.preventDefault()
    installPrompt.value = event
  }

  function onAppInstalled() {
    installPrompt.value = null
  }

  async function register() {
    if (!import.meta.env.PROD) return
    if (registrationStarted) return
    registrationStarted = true

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    try {
      if (navigator.serviceWorker.controller) return
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    } catch (error) {
      registrationStarted = false
      if (import.meta.env.DEV) {
        console.warn('[pwa] регистрация service worker не удалась', error)
      }
    }
  }

  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = installPrompt.value
    if (!event) return 'unavailable'
    try {
      await event.prompt()
      const choice = await event.userChoice
      return choice.outcome
    } catch {
      return 'unavailable'
    } finally {
      installPrompt.value = null
    }
  }

  window.addEventListener('online', syncOnline)
  window.addEventListener('offline', syncOnline)
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)

  function stop() {
    window.removeEventListener('online', syncOnline)
    window.removeEventListener('offline', syncOnline)
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.removeEventListener('appinstalled', onAppInstalled)
  }

  onUnmounted(stop)

  return { online, installable, installPrompt, register, promptInstall, stop }
}

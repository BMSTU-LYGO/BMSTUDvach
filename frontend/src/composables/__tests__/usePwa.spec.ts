import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

import { usePwa } from '@/composables/usePwa'

let registerMock: ReturnType<typeof vi.fn>

function mountPwa() {
  let api!: ReturnType<typeof usePwa>
  const Host = defineComponent({
    setup() {
      api = usePwa()
      return () => null
    },
  })
  const wrapper = mount(Host)
  return { wrapper, api }
}

function setBrowserOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

function dispatchWindow(type: string) {
  window.dispatchEvent(new Event(type))
}

function makeInstallPromptEvent() {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  event.prompt = () => Promise.resolve()
  event.userChoice = Promise.resolve({ outcome: 'accepted' })
  return event
}

describe('usePwa', () => {
  beforeEach(() => {
    registerMock = vi.fn().mockResolvedValue({})
    setBrowserOnline(true)
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: null, register: registerMock },
      configurable: true,
    })
  })

  afterEach(() => {
    setBrowserOnline(true)
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
    })
  })

  it('never registers the service worker outside of production builds', async () => {
    expect(import.meta.env.PROD).toBe(false)

    const { wrapper, api } = mountPwa()
    await api.register()

    expect(registerMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('mirrors navigator.onLine and switches on offline/online events', () => {
    const { wrapper, api } = mountPwa()
    expect(api.online.value).toBe(true)

    setBrowserOnline(false)
    dispatchWindow('offline')
    expect(api.online.value).toBe(false)

    setBrowserOnline(true)
    dispatchWindow('online')
    expect(api.online.value).toBe(true)

    wrapper.unmount()
  })

  it('captures a valid beforeinstallprompt event only', () => {
    const { wrapper, api } = mountPwa()
    expect(api.installable.value).toBe(false)

    dispatchWindow('beforeinstallprompt')
    expect(api.installable.value).toBe(false)

    window.dispatchEvent(makeInstallPromptEvent())
    expect(api.installable.value).toBe(true)
    expect(api.installPrompt.value).not.toBeNull()

    wrapper.unmount()
  })

  it('promptInstall resolves even without a captured prompt', async () => {
    const { wrapper, api } = mountPwa()

    expect(await api.promptInstall()).toBe('unavailable')

    window.dispatchEvent(makeInstallPromptEvent())
    expect(await api.promptInstall()).toBe('accepted')
    expect(api.installable.value).toBe(false)

    wrapper.unmount()
  })

  it('stops tracking the network once the scope is disposed', () => {
    const { wrapper, api } = mountPwa()
    wrapper.unmount()

    setBrowserOnline(false)
    dispatchWindow('offline')
    expect(api.online.value).toBe(true)
  })
})

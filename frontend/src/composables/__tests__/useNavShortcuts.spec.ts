import { defineComponent, h, type PropType } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NAV_PREFIX_TIMEOUT,
  matchNavSequence,
  useNavShortcuts,
} from '@/composables/useNavShortcuts'

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init }),
  )
}

const NavProbe = defineComponent({
  props: {
    onOpenSearch: {
      type: Function as PropType<() => void>,
      default: undefined,
    },
  },
  setup(props) {
    useNavShortcuts({ onOpenSearch: props.onOpenSearch })
    return () =>
      h('div', [
        h('input', { 'data-testid': 'field' }),
        h('textarea', { 'data-testid': 'area' }),
      ])
  },
})

const Stub = defineComponent({ render: () => null })

async function mountNav(path = '/', onOpenSearch?: () => void) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/moderation', component: Stub },
      { path: '/threads/:threadId', component: Stub },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(NavProbe, {
    attachTo: document.body,
    global: { plugins: [router] },
    props: { onOpenSearch },
  })
  return { router, wrapper }
}

function currentPath(router: Router) {
  return router.currentRoute.value.path
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('matchNavSequence', () => {
  it('maps every g-sequence to its action', () => {
    expect(matchNavSequence('g', 'h')).toEqual({ kind: 'route', to: '/' })
    expect(matchNavSequence('g', 'b')).toEqual({ kind: 'route', to: '/' })
    expect(matchNavSequence('g', 'm')).toEqual({ kind: 'route', to: '/moderation' })
    expect(matchNavSequence('g', 't')).toEqual({ kind: 'last-thread' })
  })

  it('is case-insensitive', () => {
    expect(matchNavSequence('G', 'H')).toEqual({ kind: 'route', to: '/' })
    expect(matchNavSequence('g', 'M')).toEqual({ kind: 'route', to: '/moderation' })
  })

  it('rejects junk pairs', () => {
    expect(matchNavSequence('x', 'h')).toBeNull()
    expect(matchNavSequence('g', 'z')).toBeNull()
    expect(matchNavSequence('g', '')).toBeNull()
    expect(matchNavSequence('', 'h')).toBeNull()
    expect(matchNavSequence('g', '1')).toBeNull()
    expect(matchNavSequence('g', ' ')).toBeNull()
    expect(matchNavSequence('h', 'h')).toBeNull()
  })
})

describe('useNavShortcuts navigation', () => {
  it('g then h returns home', async () => {
    const { router, wrapper } = await mountNav('/moderation')
    press('g')
    press('h')
    await vi.waitFor(() => expect(currentPath(router)).toBe('/'))
    wrapper.unmount()
  })

  it('g then b returns home', async () => {
    const { router, wrapper } = await mountNav('/moderation')
    press('g')
    press('b')
    await vi.waitFor(() => expect(currentPath(router)).toBe('/'))
    wrapper.unmount()
  })

  it('g then m opens moderation', async () => {
    const { router, wrapper } = await mountNav('/')
    press('g')
    press('m')
    await vi.waitFor(() => expect(currentPath(router)).toBe('/moderation'))
    wrapper.unmount()
  })

  it('g then t returns to the last visited thread', async () => {
    const { router, wrapper } = await mountNav('/threads/7')
    await router.push('/')
    press('g')
    press('t')
    await vi.waitFor(() => expect(currentPath(router)).toBe('/threads/7'))
    wrapper.unmount()
  })

  it('g then t scrolls to the top without a thread in history', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { router, wrapper } = await mountNav('/moderation')
    press('g')
    press('t')
    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
    expect(currentPath(router)).toBe('/moderation')
    wrapper.unmount()
  })

  it('does not navigate for an unknown second key', async () => {
    const { router, wrapper } = await mountNav('/moderation')
    press('g')
    press('z')
    await Promise.resolve()
    expect(currentPath(router)).toBe('/moderation')
    wrapper.unmount()
  })

  it('stops listening after unmount', async () => {
    const { router, wrapper } = await mountNav('/moderation')
    wrapper.unmount()
    const before = currentPath(router)
    press('g')
    press('h')
    await Promise.resolve()
    expect(currentPath(router)).toBe(before)
  })
})

describe('useNavShortcuts guards', () => {
  it('ignores keys typed into an input', async () => {
    const { router, wrapper } = await mountNav('/moderation')
    const field = wrapper.find<HTMLInputElement>('[data-testid="field"]')
    field.element.focus()
    expect(document.activeElement).toBe(field.element)

    press('g')
    press('h')
    await Promise.resolve()
    expect(currentPath(router)).toBe('/moderation')

    wrapper.find<HTMLTextAreaElement>('[data-testid="area"]').element.focus()
    press('g')
    press('m')
    await Promise.resolve()
    expect(currentPath(router)).toBe('/moderation')
    wrapper.unmount()
  })

  it('ignores keys typed into a contenteditable', async () => {
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    document.body.appendChild(editable)
    editable.focus()

    const { router, wrapper } = await mountNav('/moderation')
    press('g')
    press('h')
    await Promise.resolve()
    expect(currentPath(router)).toBe('/moderation')
    wrapper.unmount()
  })

  it('ignores shortcuts while a modal dialog is open', async () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)

    const { router, wrapper } = await mountNav('/moderation')
    press('g')
    press('h')
    press('/')
    await Promise.resolve()
    expect(currentPath(router)).toBe('/moderation')
    wrapper.unmount()
  })

  it('ignores modified shortcuts', async () => {
    const { router, wrapper } = await mountNav('/moderation')
    press('g', { ctrlKey: true })
    press('h')
    press('g', { metaKey: true })
    press('h')
    press('g', { altKey: true })
    press('h')
    press('h', { ctrlKey: true })
    await Promise.resolve()
    expect(currentPath(router)).toBe('/moderation')
    wrapper.unmount()
  })
})

describe('useNavShortcuts prefix window', () => {
  it('navigates while the prefix window is open', async () => {
    vi.useFakeTimers()
    const { router, wrapper } = await mountNav('/moderation')
    press('g')
    vi.advanceTimersByTime(NAV_PREFIX_TIMEOUT - 100)
    press('h')
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(currentPath(router)).toBe('/'))
    wrapper.unmount()
  })

  it('ignores the second key once the prefix window expired', async () => {
    vi.useFakeTimers()
    const { router, wrapper } = await mountNav('/moderation')
    press('g')
    vi.advanceTimersByTime(NAV_PREFIX_TIMEOUT + 1)
    press('h')
    await vi.advanceTimersByTimeAsync(0)
    expect(currentPath(router)).toBe('/moderation')

    vi.advanceTimersByTime(NAV_PREFIX_TIMEOUT + 1)
    press('g')
    press('h')
    await vi.advanceTimersByTimeAsync(0)
    expect(currentPath(router)).toBe('/')
    wrapper.unmount()
  })
})

describe('useNavShortcuts scan shortcut', () => {
  it('calls the injected search opener on /', async () => {
    const onOpenSearch = vi.fn()
    const { wrapper } = await mountNav('/moderation', onOpenSearch)
    press('/')
    await Promise.resolve()
    expect(onOpenSearch).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('falls back to the header SCAN button without an injected opener', async () => {
    const openScan = vi.fn()
    const button = document.createElement('button')
    button.setAttribute('aria-label', 'Поиск по сети (Cmd/Ctrl+K)')
    button.addEventListener('click', openScan)
    document.body.appendChild(button)

    const { wrapper } = await mountNav('/moderation')
    press('/')
    await Promise.resolve()
    expect(openScan).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('lets a cancelable scan event win over the fallback', async () => {
    const listener = vi.fn((event: Event) => event.preventDefault())
    window.addEventListener('bmstudvach:open-scan', listener)

    const openScan = vi.fn()
    const button = document.createElement('button')
    button.setAttribute('aria-label', 'Поиск по сети (Cmd/Ctrl+K)')
    button.addEventListener('click', openScan)
    document.body.appendChild(button)

    const { wrapper } = await mountNav('/moderation')
    press('/')
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(openScan).not.toHaveBeenCalled()
    window.removeEventListener('bmstudvach:open-scan', listener)
    wrapper.unmount()
  })
})

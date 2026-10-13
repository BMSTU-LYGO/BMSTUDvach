import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import IdentityCapsule from '../IdentityCapsule.vue'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

function mountCapsule(name = '') {
  return mount(IdentityCapsule, { props: { modelValue: name } })
}

describe('IdentityCapsule', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('emits the typed name for the owner to persist', async () => {
    const wrapper = mountCapsule()
    const input = wrapper.find('[data-testid="identity-input"]')
    await input.setValue('Пустота#sekret')

    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['Пустота#sekret'])
  })

  it('keeps a normalized owner value visible', async () => {
    const wrapper = mountCapsule('Пустота#sekret')
    const input = wrapper.find('[data-testid="identity-input"]')
    expect((input.element as HTMLInputElement).value).toBe('Пустота#sekret')

    await wrapper.setProps({ modelValue: 'Пустота' })
    expect((input.element as HTMLInputElement).value).toBe('Пустота')
  })

  it('clears the field and emits an empty name on reset', async () => {
    const wrapper = mountCapsule('Пустота#sekret')
    await wrapper.find('[data-testid="identity-reset"]').trigger('click')

    expect((wrapper.find('[data-testid="identity-input"]').element as HTMLInputElement).value).toBe(
      '',
    )
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([''])
    expect(wrapper.emitted('change')!.at(-1)).toEqual([''])
  })

  it('shows the tripcode hint and describes the input with it', () => {
    const wrapper = mountCapsule()
    const hint = wrapper.find('#identity-capsule-hint')
    expect(hint.text()).toContain('#секрет')
    expect(hint.text()).toContain('трипкод')

    const input = wrapper.find('[data-testid="identity-input"]')
    expect(input.attributes('aria-describedby')).toBe('identity-capsule-hint')
    expect(input.attributes('placeholder')).toContain('Имя#секрет')
    expect(input.attributes('maxlength')).toBe('64')
  })

  it('labels the reset button for assistive tech', () => {
    const wrapper = mountCapsule()
    expect(wrapper.find('[data-testid="identity-reset"]').attributes('aria-label')).toBeTruthy()
  })
})

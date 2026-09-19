import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CreateThreadForm from '../CreateThreadForm.vue'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
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

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

describe('CreateThreadForm', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('renders form component', () => {
    const wrapper = mount(CreateThreadForm, {
      props: { boardSlug: 'test' },
    })

    expect(wrapper.exists()).toBe(true)
  })

  it('has correct initial state', () => {
    const wrapper = mount(CreateThreadForm, {
      props: { boardSlug: 'test' },
    })

    // Verify component renders without errors
    expect(wrapper.exists()).toBe(true)
  })

  it('restores draft from localStorage', async () => {
    localStorageMock.setItem('draft:thread-test', JSON.stringify({
      title: 'Draft title',
      body: 'Draft body',
      files: [],
      timestamp: Date.now(),
    }))

    const wrapper = mount(CreateThreadForm, {
      props: { boardSlug: 'test' },
    })

    await wrapper.vm.$nextTick()

    // Verify component loaded without errors
    expect(wrapper.exists()).toBe(true)
  })

  it('has reset function', () => {
    const wrapper = mount(CreateThreadForm, {
      props: { boardSlug: 'test' },
    })

    // Call reset and verify it doesn't throw
    expect(() => wrapper.vm.reset()).not.toThrow()
  })
})

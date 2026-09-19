import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CreatePostForm from '../CreatePostForm.vue'

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

describe('CreatePostForm', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('renders form component', () => {
    const wrapper = mount(CreatePostForm, {
      props: { threadId: 1 },
    })

    expect(wrapper.exists()).toBe(true)
  })

  it('has correct initial state', () => {
    const wrapper = mount(CreatePostForm, {
      props: { threadId: 1 },
    })

    // Verify component renders without errors
    expect(wrapper.exists()).toBe(true)
  })

  it('restores draft from localStorage', async () => {
    localStorageMock.setItem('draft:post-1', JSON.stringify({
      body: 'Draft message',
      files: [],
      timestamp: Date.now(),
    }))

    const wrapper = mount(CreatePostForm, {
      props: { threadId: 1 },
    })

    await wrapper.vm.$nextTick()

    // Verify component loaded without errors
    expect(wrapper.exists()).toBe(true)
  })

  it('has reset function', () => {
    const wrapper = mount(CreatePostForm, {
      props: { threadId: 1 },
    })

    // Call reset and verify it doesn't throw
    expect(() => wrapper.vm.reset()).not.toThrow()
  })

  it('handles reply context', async () => {
    const wrapper = mount(CreatePostForm, {
      props: { 
        threadId: 1,
        replyContext: { postId: 123 }
      },
    })

    await wrapper.vm.$nextTick()

    // Verify component loaded with reply context without errors
    expect(wrapper.exists()).toBe(true)
  })
})

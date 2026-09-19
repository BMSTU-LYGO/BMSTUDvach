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

    expect(wrapper.vm.body).toBe('')
    expect(wrapper.vm.files).toHaveLength(0)
    expect(wrapper.vm.isExpanded).toBe(false)
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

    expect(wrapper.vm.body).toBe('Draft message')
  })

  it('has validation computed properties', () => {
    const wrapper = mount(CreatePostForm, {
      props: { threadId: 1 },
    })

    expect(wrapper.vm.bodyError).toBeDefined()
    expect(wrapper.vm.canSubmit).toBeDefined()
  })

  it('has reset function', () => {
    const wrapper = mount(CreatePostForm, {
      props: { threadId: 1 },
    })

    wrapper.vm.body = 'Test message'
    wrapper.vm.reset()

    expect(wrapper.vm.body).toBe('')
  })

  it('handles reply context', async () => {
    const wrapper = mount(CreatePostForm, {
      props: { 
        threadId: 1,
        replyContext: { postId: 123 }
      },
    })

    await wrapper.vm.$nextTick()

    expect(wrapper.vm.body).toContain('>>123')
    expect(wrapper.vm.isExpanded).toBe(true)
  })
})

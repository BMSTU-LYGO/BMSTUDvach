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

    expect(wrapper.vm.title).toBe('')
    expect(wrapper.vm.body).toBe('')
    expect(wrapper.vm.files).toHaveLength(0)
    expect(wrapper.vm.isExpanded).toBe(false)
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

    expect(wrapper.vm.title).toBe('Draft title')
    expect(wrapper.vm.body).toBe('Draft body')
  })

  it('has validation computed properties', () => {
    const wrapper = mount(CreateThreadForm, {
      props: { boardSlug: 'test' },
    })

    expect(wrapper.vm.titleError).toBeDefined()
    expect(wrapper.vm.bodyError).toBeDefined()
    expect(wrapper.vm.canSubmit).toBeDefined()
  })

  it('has reset function', () => {
    const wrapper = mount(CreateThreadForm, {
      props: { boardSlug: 'test' },
    })

    wrapper.vm.title = 'Test'
    wrapper.vm.body = 'Test body'
    wrapper.vm.reset()

    expect(wrapper.vm.title).toBe('')
    expect(wrapper.vm.body).toBe('')
  })
})

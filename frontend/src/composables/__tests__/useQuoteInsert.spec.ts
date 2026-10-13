import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { RouterView } from 'vue-router'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

import {
  insertQuoteText,
  useQuoteInsert,
  useQuoteThreadId,
} from '@/composables/useQuoteInsert'
import { useDraftQuoteStore } from '@/stores/draftQuote'

describe('insertQuoteText', () => {
  it('quotes into an empty draft', () => {
    expect(insertQuoteText('', 42)).toBe('>>42\n')
  })

  it('starts a new line under existing text', () => {
    expect(insertQuoteText('согласен', 42)).toBe('согласен\n>>42\n')
  })

  it('does not double the newline after a trailing line break', () => {
    expect(insertQuoteText('первый\n', 42)).toBe('первый\n>>42\n')
  })

  it('appends several quotes, one per line', () => {
    const once = insertQuoteText('', 1)
    expect(insertQuoteText(once, 2)).toBe('>>1\n>>2\n')
  })

  it('never duplicates a quote that is already in the draft', () => {
    expect(insertQuoteText('согласен с >>42\n', 42)).toBe('согласен с >>42\n')
    expect(insertQuoteText('>>1\n>>2\n', 1)).toBe('>>1\n>>2\n')
  })

  it('treats >>123 as not a quote of post 12', () => {
    expect(insertQuoteText('>>123\n', 12)).toBe('>>123\n>>12\n')
  })

  it('ignores whitespace-only prefix', () => {
    expect(insertQuoteText('   ', 7)).toBe('   \n>>7\n')
  })
})

describe('useQuoteThreadId', () => {
  const Probe = defineComponent({
    setup: () => {
      const id = useQuoteThreadId()
      return () => h('span', String(id.value ?? 'none'))
    },
  })
  const View = defineComponent({ setup: () => () => h(RouterView) })

  async function mountAt(path: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/threads/:threadId', component: Probe }],
    })
    await router.push(path)
    await router.isReady()
    return mount(View, { global: { plugins: [router] } })
  }

  it('reads the thread id of the reader route', async () => {
    const wrapper = await mountAt('/threads/7')
    expect(wrapper.find('span').text()).toBe('7')
    wrapper.unmount()
  })

  it('returns null outside a thread route', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/boards/:boardSlug', component: Probe }],
    })
    await router.push('/boards/b')
    await router.isReady()
    const wrapper = mount(View, { global: { plugins: [router] } })
    expect(wrapper.find('span').text()).toBe('none')
    wrapper.unmount()
  })

  it('returns null when no router is installed', () => {
    const wrapper = mount(Probe)
    expect(wrapper.find('span').text()).toBe('none')
    wrapper.unmount()
  })
})

describe('useQuoteInsert', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('applies a pending quote of its own thread to the draft', () => {
    const store = useDraftQuoteStore()
    const draft = ref('начал думать')
    const { applyQuoteToDraft } = useQuoteInsert()

    expect(applyQuoteToDraft(draft, 7)).toBe(false)

    store.requestQuote(7, 42)
    expect(applyQuoteToDraft(draft, 7)).toBe(true)
    expect(draft.value).toBe('начал думать\n>>42\n')
    expect(store.pendingQuote).toBe(null)
  })

  it('leaves drafts of another thread alone', () => {
    const store = useDraftQuoteStore()
    const draft = ref('')
    const { applyQuoteToDraft } = useQuoteInsert()

    store.requestQuote(9, 42)
    expect(applyQuoteToDraft(draft, 7)).toBe(false)
    expect(draft.value).toBe('')
    // the quote stays available for its own dock
    expect(applyQuoteToDraft(draft, 9)).toBe(true)
    expect(draft.value).toBe('>>42\n')
  })

  it('does not reapply what the draft already contains', () => {
    const store = useDraftQuoteStore()
    const draft = ref('>>42\n')
    const { applyQuoteToDraft } = useQuoteInsert()

    store.requestQuote(7, 42)
    expect(applyQuoteToDraft(draft, 7)).toBe(false)
    expect(draft.value).toBe('>>42\n')
  })

  it('watches quotes into the draft until stopped', async () => {
    const store = useDraftQuoteStore()
    const draft = ref('')
    const applied: number[] = []
    const { watchQuotes } = useQuoteInsert()

    const stop = watchQuotes(draft, 7, () => applied.push(draft.value.length))
    store.requestQuote(7, 1)
    await nextTick()
    expect(draft.value).toBe('>>1\n')

    // repeated quote of the same post changes nothing, callback stays quiet
    store.requestQuote(7, 1)
    await nextTick()
    expect(draft.value).toBe('>>1\n')

    store.requestQuote(7, 2)
    await nextTick()
    expect(draft.value).toBe('>>1\n>>2\n')
    expect(applied).toEqual([4, 8])

    stop()
    store.requestQuote(7, 3)
    await nextTick()
    expect(draft.value).toBe('>>1\n>>2\n')
    expect(store.pendingQuote?.postId).toBe(3)
  })

  it('ignores quotes requested for a different thread', async () => {
    const store = useDraftQuoteStore()
    const draft = ref('')
    const { watchQuotes } = useQuoteInsert()

    watchQuotes(draft, 7)
    store.requestQuote(8, 42)
    await nextTick()
    expect(draft.value).toBe('')
  })
})

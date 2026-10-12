import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

import AboutView from '@/views/AboutView.vue'

describe('AboutView', () => {
  it('describes the shipped product honestly', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    const wrapper = mount(AboutView, { global: { plugins: [router] } })
    const text = wrapper.text()

    // the archive exists — it must not be promised as future
    expect(text).toContain('Платины')
    expect(text).not.toContain('В будущем появится')
    expect(wrapper.find('a[href="/platinum"]').exists()).toBe(true)

    // the anonymity model is explained, not implied
    expect(text).toContain('Аноним')
    expect(text).toContain('троттлинг')
  })
})

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import OfflineBadge from '@/components/ui/OfflineBadge.vue'

describe('OfflineBadge', () => {
  it('renders the badge when the connection drops', () => {
    const wrapper = mount(OfflineBadge, { props: { online: false } })

    const badge = wrapper.find('[data-testid="offline-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('НЕТ СВЯЗИ')
    expect(badge.attributes('role')).toBe('status')
    expect(badge.attributes('aria-live')).toBe('polite')
  })

  it('stays hidden while online', () => {
    const wrapper = mount(OfflineBadge, { props: { online: true } })

    expect(wrapper.find('[data-testid="offline-badge"]').exists()).toBe(false)
  })

  it('disappears as soon as the connection is back', async () => {
    const wrapper = mount(OfflineBadge, { props: { online: false } })
    expect(wrapper.find('[data-testid="offline-badge"]').exists()).toBe(true)

    await wrapper.setProps({ online: true })
    expect(wrapper.find('[data-testid="offline-badge"]').exists()).toBe(false)
  })
})

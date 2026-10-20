import { describe, expect, it } from 'vitest'

import { mount } from '@vue/test-utils'

import OfflineBadge from '@/components/ui/OfflineBadge.vue'
import OfflineBadgeSource from '@/components/ui/OfflineBadge.vue?raw'

describe('OfflineBadge — язык метки', () => {
  it('говорит тем же языком, что и состояния', () => {
    expect(OfflineBadgeSource).toMatch(/font-family:\s*var\(--font-mono\)/)
    expect(OfflineBadgeSource).toMatch(/text-transform:\s*uppercase/)
    expect(OfflineBadgeSource).toMatch(/border:\s*1px solid var\(--rule\)/)
    expect(OfflineBadgeSource).toMatch(/background:\s*var\(--bg-surface\)/)
    expect(OfflineBadgeSource).toMatch(/color:\s*var\(--ink-secondary\)/)
  })

  it('не мигает: потеря связи — факт, а не тревога', () => {
    expect(OfflineBadgeSource).not.toContain('@keyframes')
    expect(OfflineBadgeSource).not.toMatch(/animation:/)
  })

  it('не кричит неоном и не держит стекло', () => {
    expect(OfflineBadgeSource).not.toContain('glow')
    expect(OfflineBadgeSource).not.toContain('backdrop-filter')
    expect(OfflineBadgeSource).not.toContain('var(--danger)')
  })

  it('остаётся живым сообщением для читателя', () => {
    const wrapper = mount(OfflineBadge, { props: { online: false } })

    const badge = wrapper.find('[data-testid="offline-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.attributes('role')).toBe('status')
    expect(badge.attributes('aria-live')).toBe('polite')
    expect(badge.text()).toContain('НЕТ СВЯЗИ')
  })
})

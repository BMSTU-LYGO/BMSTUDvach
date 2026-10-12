import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import ReportProbe from '../ReportProbe.vue'

function mountProbe(props: Record<string, unknown> = {}) {
  return mount(ReportProbe, {
    props: { postId: 42, ...props },
    attachTo: document.body,
  })
}

describe('ReportProbe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers five real reasons as a radio group — no select, no card grid', () => {
    const wrapper = mountProbe()
    const group = wrapper.find('[role="radiogroup"]')
    expect(group.exists()).toBe(true)

    const nodes = wrapper.findAll('[role="radio"]')
    expect(nodes).toHaveLength(5)
    expect(nodes.map((n) => n.attributes('data-testid'))).toEqual([
      'reason-spam',
      'reason-abuse',
      'reason-illegal',
      'reason-offtopic',
      'reason-other',
    ])
  })

  it('supports arrow-key navigation between reason nodes', async () => {
    const wrapper = mountProbe()
    const nodes = wrapper.findAll('[role="radio"]')
    ;(nodes[0].element as HTMLElement).focus()

    await nodes[0].trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(nodes[1].element)

    await nodes[0].trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(nodes[4].element)
  })

  it('moves to the comment stage after picking a reason', async () => {
    const wrapper = mountProbe()
    await wrapper.find('[data-testid="reason-abuse"]').trigger('click')

    const stage2 = wrapper.find('[data-testid="probe-stage-2"]')
    expect(stage2.exists()).toBe(true)
    expect(stage2.text()).toContain('Оскорбления')
    expect(wrapper.find('textarea[aria-label="Комментарий к жалобе"]').exists()).toBe(true)
  })

  it('emits the report without closing itself — parent owns the API', async () => {
    const wrapper = mountProbe()
    await wrapper.find('[data-testid="reason-spam"]').trigger('click')
    await wrapper.find('textarea').setValue('флуд ссылками')

    await wrapper.find('.transmit').trigger('click')
    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')![0][0]).toEqual({
      reason: 'spam',
      comment: 'флуд ссылками',
    })
    // probe must survive until parent confirms success
    expect(wrapper.find('[data-testid="probe-stage-2"]').exists()).toBe(true)
  })

  it('closes only after parent-confirmed success', async () => {
    const wrapper = mountProbe()
    await wrapper.find('[data-testid="reason-spam"]').trigger('click')

    await wrapper.setProps({ successToken: 1 })
    await nextTick()
    expect(wrapper.emitted('reported')).toHaveLength(1)
  })

  it('keeps reason and comment on API failure', async () => {
    const wrapper = mountProbe()
    await wrapper.find('[data-testid="reason-illegal"]').trigger('click')
    await wrapper.find('textarea').setValue('документы')

    await wrapper.setProps({ submitError: 'Сеть недоступна' })
    await nextTick()

    expect(wrapper.find('[data-testid="probe-error"]').text()).toContain('Сеть недоступна')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('документы')
    expect(wrapper.emitted('reported')).toBeFalsy()
  })

  it('returns to the constellation on Escape in stage 1, closes from stage 2', async () => {
    const wrapper = mountProbe()

    await wrapper.find('[data-testid="reason-other"]').trigger('click')
    expect(wrapper.find('[data-testid="probe-stage-2"]').exists()).toBe(true)

    // Escape without a comment steps back to the constellation
    await wrapper.find('[data-testid="probe-stage-2"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="probe-stage-2"]').exists()).toBe(false)

    await wrapper.find('[data-testid="reason-other"]').trigger('click')
    await wrapper.find('textarea').setValue('текст')
    await wrapper.find('[data-testid="probe-stage-2"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

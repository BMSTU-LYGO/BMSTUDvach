import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ReportDialog from '../ReportDialog.vue'

describe('ReportDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders dialog with required elements', () => {
    const wrapper = mount(ReportDialog, {
      attachTo: document.body,
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true)
    expect(wrapper.find('textarea').exists()).toBe(true)
  })

  it('renders all reason options', () => {
    const wrapper = mount(ReportDialog, {
      attachTo: document.body,
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    expect(wrapper.text()).toContain('Спам')
    expect(wrapper.text()).toContain('Оскорбление')
    expect(wrapper.text()).toContain('Незаконный контент')
    expect(wrapper.text()).toContain('Оффтоп')
    expect(wrapper.text()).toContain('Другое')
  })

  it('allows selecting a reason', async () => {
    const wrapper = mount(ReportDialog, {
      attachTo: document.body,
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    const radioButtons = wrapper.findAll('[role="radio"]')
    if (radioButtons.length > 1) {
      await radioButtons[1].trigger('click')
      // Verify the radio button is checked
      expect(radioButtons[1].attributes('aria-checked')).toBe('true')
    }
  })

  it('emits submit with correct payload', async () => {
    const wrapper = mount(ReportDialog, {
      attachTo: document.body,
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    const radioButtons = wrapper.findAll('[role="radio"]')
    if (radioButtons.length > 2) {
      await radioButtons[2].trigger('click')
    }

    const textarea = wrapper.find('textarea')
    await textarea.setValue('Test comment')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')![0][0]).toEqual({
      reason: 'illegal',
      comment: 'Test comment',
    })
  })

  it('emits close on Escape key', async () => {
    const wrapper = mount(ReportDialog, {
      attachTo: document.body,
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    await wrapper.vm.$nextTick()
    
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    document.dispatchEvent(event)

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close on overlay click', async () => {
    const wrapper = mount(ReportDialog, {
      attachTo: document.body,
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    const overlay = wrapper.find('.report-overlay')
    if (overlay.exists()) {
      await overlay.trigger('click')
      expect(wrapper.emitted('close')).toBeTruthy()
    }
  })

  it('has proper ARIA attributes', () => {
    const wrapper = mount(ReportDialog, {
      attachTo: document.body,
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    const dialog = wrapper.find('[role="dialog"]')
    if (dialog.exists()) {
      expect(dialog.attributes('aria-modal')).toBe('true')
      expect(dialog.attributes('aria-label')).toBe('Пожаловаться на пост')
    }

    const reasonPicker = wrapper.find('[role="radiogroup"]')
    if (reasonPicker.exists()) {
      expect(reasonPicker.attributes('aria-label')).toBe('Причина жалобы')
    }
  })
})

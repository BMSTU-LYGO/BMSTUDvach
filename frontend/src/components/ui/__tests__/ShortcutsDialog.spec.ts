import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ShortcutsDialog from '@/components/ui/ShortcutsDialog.vue'

async function openDialog() {
  const onUpdate = vi.fn()
  const wrapper = mount(ShortcutsDialog, {
    attachTo: document.body,
    props: { modelValue: false, 'onUpdate:modelValue': onUpdate },
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  await nextTick()
  return { wrapper, onUpdate }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ShortcutsDialog', () => {
  it('renders the shortcut rows with their keys and sections', async () => {
    const { wrapper } = await openDialog()

    const dialog = wrapper.find('[data-testid="shortcuts-dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('role')).toBe('dialog')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-label')).toBe('Горячие клавиши')

    const keys = wrapper.findAll('.shortcuts__key').map((key) => key.text())
    expect(keys).toEqual(
      expect.arrayContaining(['?', '/', 'g', 'h', '⌘/Ctrl', 'K', 'Enter', 'V', '>>id']),
    )

    expect(wrapper.findAll('[data-testid="shortcut-row"]').length).toBeGreaterThanOrEqual(11)
    expect(dialog.text()).toContain('ГЛОБАЛЬНО')
    expect(dialog.text()).toContain('SIGNAL DOCK')
    expect(dialog.text()).toContain('главная')
    expect(dialog.text()).toContain('командная линза')
    expect(dialog.text()).toContain('эта справка')

    wrapper.unmount()
  })

  it('asks the host to close on Escape', async () => {
    const { wrapper, onUpdate } = await openDialog()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await flushPromises()

    expect(onUpdate).toHaveBeenCalledWith(false)
    wrapper.unmount()
  })

  it('closes on a backdrop click but not on a click inside the dialog', async () => {
    const { wrapper, onUpdate } = await openDialog()

    await wrapper.find('[data-testid="shortcuts-dialog"]').trigger('click')
    expect(onUpdate).not.toHaveBeenCalled()

    await wrapper.find('.shortcuts-backdrop').trigger('click')
    expect(onUpdate).toHaveBeenCalledWith(false)
    wrapper.unmount()
  })

  it('moves focus into the dialog when it opens', async () => {
    const { wrapper } = await openDialog()

    const dialog = wrapper.find('[data-testid="shortcuts-dialog"]')
    expect(document.activeElement).not.toBe(document.body)
    expect(dialog.element.contains(document.activeElement)).toBe(true)
    wrapper.unmount()
  })

  it('restores focus to the element that opened it', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'открыть справку'
    document.body.appendChild(opener)
    opener.focus()

    const onUpdate = vi.fn()
    const wrapper = mount(ShortcutsDialog, {
      attachTo: document.body,
      props: { modelValue: false, 'onUpdate:modelValue': onUpdate },
    })

    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(document.activeElement).not.toBe(opener)

    await wrapper.setProps({ modelValue: false })
    await flushPromises()

    expect(document.activeElement).toBe(opener)
    wrapper.unmount()
  })
})

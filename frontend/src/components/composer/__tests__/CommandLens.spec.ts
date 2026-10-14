import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import CommandLens, { type LensCommand } from '../CommandLens.vue'

const commands: LensCommand[] = [
  { id: 'attach', label: 'Прикрепить файл', hint: 'открыть выбор файлов', shortcut: '/attach', run: vi.fn() },
  { id: 'reply', label: 'К чему отвечаю', hint: 'показать исходный пост', shortcut: '/reply', run: vi.fn() },
  { id: 'clear', label: 'Очистить сигнал', hint: 'убрать текст и вложения', shortcut: '/clear', run: vi.fn() },
  { id: 'send', label: 'Передать', hint: 'отправить сообщение', shortcut: '/send', run: vi.fn() },
]

function mountLens(props: Partial<{ open: boolean; filter: string }> = {}) {
  return mount(CommandLens, {
    props: { open: true, filter: '', commands, ...props },
  })
}

function items(wrapper: ReturnType<typeof mountLens>) {
  return wrapper.findAll('[role="option"]')
}

// The lens leaves through a CSS transition; let Vue finish removing it.
async function settle() {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('CommandLens', () => {
  beforeEach(() => {
    commands.forEach((c) => vi.mocked(c.run).mockReset())
  })

  it('renders nothing while closed', () => {
    const wrapper = mountLens({ open: false })
    expect(wrapper.find('[data-testid="command-lens"]').exists()).toBe(false)
    expect(items(wrapper)).toHaveLength(0)
  })

  it('lists every command with the first one active', () => {
    const wrapper = mountLens()
    const lens = wrapper.find('[data-testid="command-lens"]')

    expect(lens.exists()).toBe(true)
    expect(lens.attributes('role')).toBe('listbox')
    expect(lens.attributes('aria-label')).toBe('Команды')
    expect(items(wrapper)).toHaveLength(4)
    expect(items(wrapper)[0].attributes('aria-selected')).toBe('true')
    expect(
      items(wrapper).slice(1).every((i) => i.attributes('aria-selected') === 'false'),
    ).toBe(true)
  })

  it('keeps the passed commands, hints and shortcuts on the rows', () => {
    const wrapper = mountLens()
    const first = items(wrapper)[0]

    expect(first.text()).toContain('Прикрепить файл')
    expect(first.text()).toContain('открыть выбор файлов')
    expect(first.text()).toContain('/attach')
    expect(first.attributes('data-command')).toBe('attach')
  })

  it('filters the rows by label and by id', async () => {
    const wrapper = mountLens({ filter: 'очист' })
    expect(items(wrapper)).toHaveLength(1)
    expect(items(wrapper)[0].text()).toContain('Очистить сигнал')

    await wrapper.setProps({ filter: 'send' })
    expect(items(wrapper)).toHaveLength(1)
    expect(items(wrapper)[0].text()).toContain('Передать')

    await wrapper.setProps({ filter: 'ре' })
    const labels = items(wrapper).map((i) => i.text())
    expect(labels).toHaveLength(2)
  })

  it('shows the empty notice when nothing matches', () => {
    const wrapper = mountLens({ filter: 'неизвестно' })
    expect(items(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toContain('нет совпадений')
  })

  it('counts the matches in the right Russian plural', () => {
    expect(mountLens().text()).toContain('4 команды')
    expect(mountLens({ filter: 'att' }).text()).toContain('1 команда')
  })

  it('runs the picked command and closes on click', async () => {
    const wrapper = mountLens()
    await items(wrapper)[2].trigger('click')

    expect(commands[2].run).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('moves the active row with the arrow keys and wraps around', async () => {
    const wrapper = mountLens()

    await wrapper.find('[data-testid="command-lens"]').trigger('keydown', { key: 'ArrowDown' })
    expect(items(wrapper)[1].attributes('aria-selected')).toBe('true')

    await wrapper.find('[data-testid="command-lens"]').trigger('keydown', { key: 'ArrowUp' })
    await wrapper.find('[data-testid="command-lens"]').trigger('keydown', { key: 'ArrowUp' })
    expect(items(wrapper)[3].attributes('aria-selected')).toBe('true')
  })

  it('runs the active command on Enter', async () => {
    const wrapper = mountLens()

    await wrapper.find('[data-testid="command-lens"]').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.find('[data-testid="command-lens"]').trigger('keydown', { key: 'Enter' })

    expect(commands[1].run).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('ignores Enter while the filter matches nothing', async () => {
    const wrapper = mountLens({ filter: 'нет такой' })
    await wrapper.find('[data-testid="command-lens"]').trigger('keydown', { key: 'Enter' })

    expect(commands.every((c) => !vi.mocked(c.run).mock.calls.length)).toBe(true)
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('closes on Escape', async () => {
    const wrapper = mountLens()
    await wrapper.find('[data-testid="command-lens"]').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('leaves the tree once the parent drops the open prop', async () => {
    const wrapper = mountLens()
    expect(wrapper.find('[data-testid="command-lens"]').exists()).toBe(true)

    await wrapper.setProps({ open: false })
    await settle()
    expect(wrapper.find('[data-testid="command-lens"]').exists()).toBe(false)
  })

  it('resets the active row when the lens reopens', async () => {
    const wrapper = mountLens()
    await wrapper.find('[data-testid="command-lens"]').trigger('keydown', { key: 'ArrowDown' })
    expect(items(wrapper)[1].attributes('aria-selected')).toBe('true')

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    expect(items(wrapper)[0].attributes('aria-selected')).toBe('true')
  })
})

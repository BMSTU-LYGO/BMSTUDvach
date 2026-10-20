import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { mount } from '@vue/test-utils'

import NotFoundState from '@/components/NotFoundState.vue'
import NotFoundStateSource from '@/components/NotFoundState.vue?raw'

/** Палитра читается с диска: vitest CSS не обрабатывает, токены иначе пустые. */
const MainCssSource = readFileSync(
  resolve(process.cwd(), 'src/assets/main.css'),
  'utf8',
)

/** Токен палитры прямо из main.css — контраст считаем по-настоящему. */
const token = (name: string): string =>
  MainCssSource.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? ''

const luminance = (hex: string): number => {
  const value = parseInt(hex.slice(1), 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(
    (channel) => {
      const srgb = channel / 255
      return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
    },
  )
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('NotFoundState', () => {
  it('показывает прибор: подпись, сообщение и оба маркера', () => {
    const wrapper = mount(NotFoundState)

    expect(wrapper.find('[data-testid="not-found"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="state-not-found"]').exists()).toBe(true)
    expect(wrapper.find('.state__label').text()).toContain('FRAGMENT LOST')
    expect(wrapper.find('.state__message').text()).toContain('Фрагмента')
  })

  it('живёт в polite-статусе', () => {
    const wrapper = mount(NotFoundState)
    const root = wrapper.find('[data-testid="not-found"]')

    expect(root.attributes('role')).toBe('status')
    expect(root.attributes('aria-live')).toBe('polite')
  })

  it('принимает свои подпись и сообщение', () => {
    const wrapper = mount(NotFoundState, {
      props: {
        title: 'ACCESS SEALED',
        message: 'Доступ закрыт.',
      },
    })

    expect(wrapper.find('.state__label').text()).toBe('ACCESS SEALED')
    expect(wrapper.find('.state__message').text()).toBe('Доступ закрыт.')
  })

  it('рисует действие только когда есть обработчик', () => {
    const withoutAction = mount(NotFoundState)
    expect(withoutAction.find('button').exists()).toBe(false)

    const withAction = mount(NotFoundState, { props: { onAction: () => {} } })
    expect(withAction.find('button').exists()).toBe(true)
  })

  it('зовёт обработчик и подписывает кнопку', async () => {
    const onAction = vi.fn()
    const wrapper = mount(NotFoundState, {
      props: { onAction, actionLabel: 'вернуться в сеть' },
    })

    const button = wrapper.find('button')
    expect(button.text()).toContain('вернуться в сеть')
    expect(button.attributes('type')).toBe('button')

    await button.trigger('click')

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('без обработчика оставляет подсказку, а не пустоту', () => {
    const wrapper = mount(NotFoundState)

    const hint = wrapper.find('.state__hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text().length).toBeGreaterThan(0)
  })

  it('слот действия заменяет встроенную кнопку', () => {
    const wrapper = mount(NotFoundState, {
      props: { onAction: () => {} },
      slots: { default: '<button type="button" class="caller-action">Свой</button>' },
    })

    expect(wrapper.find('.caller-action').exists()).toBe(true)
    expect(wrapper.find('.state__button').exists()).toBe(false)
  })

  it('закрывает кнопку, пока действие недоступно', () => {
    const wrapper = mount(NotFoundState, {
      props: { onAction: () => {}, actionDisabled: true },
    })

    const button = wrapper.find('button')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.classes()).toContain('state__button')
  })

  it('у каждой графики своя картинка', () => {
    const lost = mount(NotFoundState, { props: { variant: 'lost' } })
    expect(lost.find('[data-testid="not-found-cut"]').exists()).toBe(true)
    expect(lost.find('.state__cut-hole').exists()).toBe(true)
    expect(lost.find('.state__cut-tear').exists()).toBe(true)
    expect(lost.find('[data-testid="not-found-axis"]').exists()).toBe(false)

    const quiet = mount(NotFoundState, { props: { variant: 'quiet' } })
    expect(quiet.find('[data-testid="not-found-axis"]').exists()).toBe(true)
    expect(quiet.find('.state__axis').exists()).toBe(true)
    expect(quiet.find('[data-testid="not-found-cut"]').exists()).toBe(false)

    const sealed = mount(NotFoundState, { props: { variant: 'sealed' } })
    expect(sealed.find('[data-testid="not-found-seal"]').exists()).toBe(true)
    expect(sealed.find('.state__seal').exists()).toBe(true)
    expect(sealed.find('[data-testid="not-found-axis"]').exists()).toBe(false)
  })

  it('помечает вариант, чтобы страница знала, какой прибор нарисован', () => {
    const wrapper = mount(NotFoundState, { props: { variant: 'sealed' } })

    expect(wrapper.find('[data-testid="not-found"]').attributes('data-variant')).toBe(
      'sealed',
    )
    expect(
      wrapper.find('[data-testid="state-not-found"]').attributes('data-variant'),
    ).toBe('sealed')
  })

  it('статичный кадр: ни одной анимации', () => {
    expect(NotFoundStateSource).not.toContain('@keyframes')
    expect(NotFoundStateSource).not.toMatch(/animation:/)
    expect(NotFoundStateSource).not.toContain('transition: all')
  })

  it('высота прибора зарезервирована — контент не прыгает', () => {
    expect(NotFoundStateSource).toMatch(/\.state__frame\s*\{[^}]*min-height:\s*232px/)
    expect(NotFoundStateSource).toMatch(/\.state__action\s*\{[^}]*min-height:\s*44px/)
    expect(NotFoundStateSource).toMatch(/\.state__message\s*\{[^}]*min-height:/)
    // Графика — фиксированной высоты: смена варианта не двигает страницу.
    expect(NotFoundStateSource).toMatch(/\.state__graphic\s*\{[^}]*height:\s*44px/)
  })

  it('говорит тем же языком, что и остальные состояния', () => {
    const wrapper = mount(NotFoundState)

    expect(wrapper.find('.state').exists()).toBe(true)
    expect(wrapper.find('.state__frame').exists()).toBe(true)
    expect(wrapper.findAll('.state__corner')).toHaveLength(4)
    expect(wrapper.find('.state__label').exists()).toBe(true)
    expect(wrapper.find('.state__message').exists()).toBe(true)

    expect(NotFoundStateSource).toMatch(
      /\.state__label\s*\{[^}]*font-family:\s*var\(--font-mono\)/,
    )
    expect(NotFoundStateSource).toMatch(
      /\.state__message\s*\{[^}]*font-family:\s*var\(--font-body\)/,
    )
    expect(NotFoundStateSource).toMatch(
      /\.state__message\s*\{[^}]*color:\s*var\(--ink-secondary\)/,
    )
  })

  it('берёт время и кривую из семантических motion-токенов', () => {
    expect(NotFoundStateSource).toContain('var(--motion-hover)')
    expect(NotFoundStateSource).toContain('var(--motion-press)')
    expect(NotFoundStateSource).not.toMatch(/cubic-bezier\(/)
    expect(NotFoundStateSource).not.toContain('var(--duration-fast)')
  })

  it('не красит неоном и не масштабирует', () => {
    expect(NotFoundStateSource).not.toContain('glow')
    expect(NotFoundStateSource).not.toMatch(/transform:\s*scale\(/)
  })

  it('даёт каждому варианту один акцент и никакой «красной стены»', () => {
    expect(NotFoundStateSource).toMatch(
      /\.state-lost \.state__frame\s*\{[^}]*--state-accent:\s*var\(--accent\)/,
    )
    expect(NotFoundStateSource).toMatch(
      /\.state-quiet \.state__frame\s*\{[^}]*--state-accent:\s*color-mix/,
    )
    expect(NotFoundStateSource).toMatch(
      /\.state-sealed \.state__frame\s*\{[^}]*--state-accent:\s*var\(--ink-secondary\)/,
    )
    expect(NotFoundStateSource).not.toContain('var(--danger)')
  })

  it('держит текст читаемым: контраст не ниже 4.5:1', () => {
    const paper = token('paper-raised')

    expect(contrast(token('ink-secondary'), paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('accent'), paper)).toBeGreaterThanOrEqual(4.5)
  })
})

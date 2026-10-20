import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { mount } from '@vue/test-utils'

import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import LoadingState from '@/components/LoadingState.vue'
import EmptyStateSource from '@/components/EmptyState.vue?raw'
import ErrorStateSource from '@/components/ErrorState.vue?raw'
import LoadingStateSource from '@/components/LoadingState.vue?raw'

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

/** Все классы прибора, которыми пользуется состояние. */
const grammar = (source: string): string[] =>
  [
    ...new Set(
      [...source.matchAll(/\.(state(?:__|--)[a-z0-9-]+)/g)].map((match) => match[1]),
    ),
  ].sort()

/** Высота рамки прибора: одинаковая во всех состояниях — контент не прыгает. */
const frameHeight = (source: string): string =>
  source.match(/\.state__frame\s*\{[^}]*min-height:\s*([^;]+);/)?.[1]?.trim() ?? ''

describe('LoadingState', () => {
  it('renders default label', () => {
    const wrapper = mount(LoadingState)
    expect(wrapper.text()).toContain('Загрузка')
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true)
  })

  it('renders custom label', () => {
    const wrapper = mount(LoadingState, { props: { label: 'Подождите' } })
    expect(wrapper.text()).toContain('Подождите')
  })

  it('exposes the signal-scan frame and a live status region', () => {
    const wrapper = mount(LoadingState)

    const root = wrapper.find('[data-testid="loading"]')
    const frame = wrapper.find('[data-testid="state-loading"]')

    expect(frame.exists()).toBe(true)
    expect(root.attributes('role')).toBe('status')
    expect(root.attributes('aria-live')).toBe('polite')
    expect(root.text()).toContain('SCANNING')
  })

  it('marks itself busy while the signal is being searched', () => {
    const wrapper = mount(LoadingState)
    expect(wrapper.find('[data-testid="loading"]').attributes('aria-busy')).toBe('true')
  })

  it('shows the same instrument frame as the other states', () => {
    const wrapper = mount(LoadingState)

    expect(wrapper.find('.state').exists()).toBe(true)
    expect(wrapper.find('.state__frame').exists()).toBe(true)
    expect(wrapper.findAll('.state__corner')).toHaveLength(4)
    expect(wrapper.find('.state__track').exists()).toBe(true)
    expect(wrapper.find('.state__label').exists()).toBe(true)
    expect(wrapper.find('.state__message').exists()).toBe(true)
  })

  it('draws the signal as nine cells of one track', () => {
    const wrapper = mount(LoadingState)

    const cells = wrapper.findAll('.state__cell')
    expect(cells).toHaveLength(9)
    expect(wrapper.findAll('.state__bar')).toHaveLength(9)
  })

  it('sweeps the beam over the signal instead of showing grey text', () => {
    const wrapper = mount(LoadingState)

    expect(wrapper.find('.state__beam').exists()).toBe(true)
    expect(LoadingStateSource).toContain('@keyframes state-scan')
    expect(LoadingStateSource).toMatch(
      /@keyframes state-scan\s*\{[^}]*transform:\s*translateX/,
    )
  })

  it('animates the signal with transform and opacity only', () => {
    const keyframes =
      LoadingStateSource.match(/@keyframes state-rise\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''

    expect(keyframes).toContain('transform: scaleY(')
    expect(keyframes).not.toMatch(/\b(width|height|top|left|right):/)
  })
})

describe('ErrorState', () => {
  it('renders default message', () => {
    const wrapper = mount(ErrorState)
    expect(wrapper.text()).toContain('Ошибка')
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true)
  })

  it('renders custom message', () => {
    const wrapper = mount(ErrorState, { props: { message: 'Сеть недоступна' } })
    expect(wrapper.text()).toContain('Сеть недоступна')
  })

  it('shows retry button when onRetry provided', () => {
    const wrapper = mount(ErrorState, { props: { onRetry: () => {} } })
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('is an alert region with the lost-node frame', () => {
    const wrapper = mount(ErrorState)

    const root = wrapper.find('[data-testid="error"]')
    const frame = wrapper.find('[data-testid="state-error"]')

    expect(frame.exists()).toBe(true)
    expect(root.attributes('role')).toBe('alert')
    expect(root.text()).toContain('ERROR')
  })

  it('calls onRetry when the retry button is pressed', async () => {
    const onRetry = vi.fn()
    const wrapper = mount(ErrorState, { props: { onRetry } })

    const button = wrapper.find('button')
    expect(button.attributes('type')).toBe('button')

    await button.trigger('click')

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('keeps no retry control when onRetry is absent', () => {
    const wrapper = mount(ErrorState)
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('shows the same instrument frame as the other states', () => {
    const wrapper = mount(ErrorState)

    expect(wrapper.find('.state').exists()).toBe(true)
    expect(wrapper.find('.state__frame').exists()).toBe(true)
    expect(wrapper.findAll('.state__corner')).toHaveLength(4)
    expect(wrapper.find('.state__track').exists()).toBe(true)
    expect(wrapper.find('.state__label').exists()).toBe(true)
    expect(wrapper.find('.state__message').exists()).toBe(true)
  })

  it('breaks the signal line where the connection failed', () => {
    const wrapper = mount(ErrorState)

    expect(wrapper.find('.state__break').exists()).toBe(true)
    // Обрыв — дырка в линии: в середине трека ячейка без столбца.
    expect(wrapper.findAll('.state__bar')).toHaveLength(8)
  })

  it('gives the retry a real target, a visible focus and a press reaction', () => {
    const wrapper = mount(ErrorState, { props: { onRetry: () => {} } })

    expect(wrapper.find('button').classes()).toContain('state__button')
    expect(ErrorStateSource).toMatch(/\.state__button\s*\{[^}]*min-height:\s*44px/)
    expect(ErrorStateSource).toContain('.state__button:focus-visible')
    expect(ErrorStateSource).toMatch(
      /\.state__button:active\s*\{[^}]*translateY\(1px\)/,
    )
  })
})

describe('EmptyState', () => {
  it('renders default message', () => {
    const wrapper = mount(EmptyState)
    expect(wrapper.text()).toContain('пусто')
    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true)
  })

  it('renders custom message', () => {
    const wrapper = mount(EmptyState, { props: { message: 'В сети пока тихо.' } })
    expect(wrapper.text()).toContain('В сети пока тихо.')
  })

  it('exposes the empty-node frame as a live status region', () => {
    const wrapper = mount(EmptyState)

    const root = wrapper.find('[data-testid="empty"]')
    const frame = wrapper.find('[data-testid="state-empty"]')

    expect(frame.exists()).toBe(true)
    expect(root.attributes('role')).toBe('status')
    expect(root.attributes('aria-live')).toBe('polite')
    expect(root.text()).toContain('EMPTY NODE')
  })

  it('shows the same instrument frame as the other states', () => {
    const wrapper = mount(EmptyState)

    expect(wrapper.find('.state').exists()).toBe(true)
    expect(wrapper.find('.state__frame').exists()).toBe(true)
    expect(wrapper.findAll('.state__corner')).toHaveLength(4)
    expect(wrapper.find('.state__track').exists()).toBe(true)
    expect(wrapper.find('.state__label').exists()).toBe(true)
    expect(wrapper.find('.state__message').exists()).toBe(true)
  })

  it('keeps the line flat — no signal at all', () => {
    const wrapper = mount(EmptyState)

    const bars = wrapper.findAll('.state__bar')
    expect(bars).toHaveLength(9)
    for (const bar of bars) {
      expect(bar.attributes('style')).toContain('--h: 0%')
    }
  })

  it('offers a slot for the action the caller has', () => {
    const wrapper = mount(EmptyState, {
      slots: {
        default: '<button type="button" class="caller-action">Создать</button>',
      },
    })

    expect(wrapper.find('.caller-action').exists()).toBe(true)
    expect(wrapper.find('.caller-action').text()).toBe('Создать')
  })

  it('suggests what to do when the caller has no action', () => {
    const wrapper = mount(EmptyState)
    expect(wrapper.find('.state__hint').exists()).toBe(true)
    expect(wrapper.find('.state__hint').text().length).toBeGreaterThan(0)
  })
})

describe('Единый язык состояний', () => {
  const sources = {
    loading: LoadingStateSource,
    error: ErrorStateSource,
    empty: EmptyStateSource,
  }

  it('собирает все три состояния из одного словаря прибора', () => {
    const reference = grammar(sources.loading)

    expect(reference.length).toBeGreaterThan(0)
    expect(grammar(sources.error)).toEqual(reference)
    expect(grammar(sources.empty)).toEqual(reference)
  })

  it('делит буквально один и тот же блок стилей прибора', () => {
    const shared = (source: string): string =>
      source.slice(
        source.indexOf('/* === Общий язык состояний'),
        source.indexOf('/* === Состояние:'),
      )

    const reference = shared(sources.loading)

    expect(reference.length).toBeGreaterThan(0)
    expect(shared(sources.error)).toBe(reference)
    expect(shared(sources.empty)).toBe(reference)
  })

  it('берёт время и кривую из семантических motion-токенов', () => {
    for (const source of Object.values(sources)) {
      expect(source).toContain('var(--motion-hover)')
      expect(source).toContain('var(--motion-press)')
      expect(source).not.toMatch(/cubic-bezier\(/)
      expect(source).not.toContain('var(--duration-fast)')
    }
  })

  it('держит одинаковую высоту — контент не прыгает при смене состояния', () => {
    const heights = Object.values(sources).map(frameHeight)

    expect(heights[0]).toBeTruthy()
    expect(new Set(heights).size).toBe(1)

    for (const source of Object.values(sources)) {
      expect(source).toMatch(/\.state__action\s*\{[^}]*min-height:\s*44px/)
      expect(source).toMatch(/\.state__message\s*\{[^}]*min-height:/)
    }
  })

  it('даёт каждому состоянию один акцент: accent, danger, приглушённый accent', () => {
    expect(sources.loading).toMatch(/--state-accent:\s*var\(--accent\)/)
    expect(sources.error).toMatch(/--state-accent:\s*var\(--danger\)/)
    expect(sources.empty).toMatch(
      /--state-accent:\s*color-mix\(in oklab, var\(--accent\) 72%, var\(--ink-secondary\)\)/,
    )
  })

  it('не красит всё красным и не добавляет неона', () => {
    for (const source of Object.values(sources)) {
      expect(source).not.toContain('glow')
      expect(source).not.toMatch(/transform:\s*scale\(/)
      expect(source).not.toMatch(/transition:\s*all/)
    }
  })

  it('говорит подписью моно, а сообщением — гарнитурой корпуса', () => {
    for (const source of Object.values(sources)) {
      expect(source).toMatch(
        /\.state__label\s*\{[^}]*font-family:\s*var\(--font-mono\)/,
      )
      expect(source).toMatch(
        /\.state__message\s*\{[^}]*font-family:\s*var\(--font-body\)/,
      )
    }
  })

  it('останавливает прибор, если читатель просил меньше движения', () => {
    for (const source of Object.values(sources)) {
      expect(source).toMatch(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^@]*?\.state__bar[^{]*\{[^}]*animation:\s*none/,
      )
      expect(source).toMatch(/\.state__beam\s*\{[^}]*display:\s*none/)
    }
  })

  it('не прячет контент до запуска анимации', () => {
    for (const source of Object.values(sources)) {
      // Вне keyframes контент не должен прятаться: первый кадр = финальный.
      const staticCss = source.replace(/@keyframes[\s\S]*?\n\}/g, '')
      expect(staticCss).not.toMatch(/opacity:\s*0\b/)
    }
  })

  it('держит текст читаемым: контраст не ниже 4.5:1', () => {
    const paper = token('paper-raised')
    const message = token('ink-secondary')

    expect(contrast(message, paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('accent'), paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('danger'), paper)).toBeGreaterThanOrEqual(4.5)
  })

  it('не прячет сообщение в сером: строка читаемая, а не «серый текст»', () => {
    for (const source of Object.values(sources)) {
      expect(source).toMatch(
        /\.state__message\s*\{[^}]*color:\s*var\(--ink-secondary\)/,
      )
      expect(source).not.toMatch(
        /\.state__message\s*\{[^}]*color:\s*var\(--text-muted\)/,
      )
    }
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { mount } from '@vue/test-utils'

import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import LoadingState from '@/components/LoadingState.vue'
import NotFoundState from '@/components/NotFoundState.vue'
import EmptyStateSource from '@/components/EmptyState.vue?raw'
import ErrorStateSource from '@/components/ErrorState.vue?raw'
import LoadingStateSource from '@/components/LoadingState.vue?raw'
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

/* ── Смешение цветов ──────────────────────────────────────────────────────────
   `color-mix(in oklab, …)` считается так же, как в браузере: без этого
   проверка контраста проверяла бы не тот цвет, который видит человек. */

const toLinear = (channel: number): number => {
  const srgb = channel / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

const toSrgb = (value: number): number =>
  value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055

const hexToRgb = (hex: string): number[] => {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

const rgbToOklab = ([r, g, b]: number[]): number[] => {
  const R = toLinear(r)
  const G = toLinear(g)
  const B = toLinear(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const oklabToRgb = ([L, a, b]: number[]): number[] => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** `color-mix(in oklab, A p%, B)` — тем же смешением, что и в браузере. */
const mixOklab = (a: string, b: string, weight: number): string => {
  const A = rgbToOklab(hexToRgb(a))
  const B = rgbToOklab(hexToRgb(b))
  const mixed = oklabToRgb([0, 1, 2].map((i) => weight * A[i] + (1 - weight) * B[i]))
  return `#${mixed
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel * 255)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** Акцент состояния — как он написан в исходнике, но посчитанный в цвет. */
const accentOf = (source: string, selector: string): string => {
  const rule = source.match(
    new RegExp(
      `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*--state-accent:\\s*([^;]+);`,
    ),
  )
  const expression = rule?.[1]?.trim() ?? ''
  const mix = expression.match(
    /color-mix\(in oklab,\s*var\((--[\w-]+)\)\s+(\d+)%,\s*var\((--[\w-]+)\)\)/,
  )
  if (mix) {
    const [, first, weight, second] = mix
    return mixOklab(token(first.slice(2)), token(second.slice(2)), Number(weight) / 100)
  }
  const variable = expression.match(/var\((--[\w-]+)\)/)
  return variable ? token(variable[1].slice(2)) : ''
}

/** Кромка действия — тот же `color-mix`, но от акцента состояния. */
const borderOf = (source: string, selector: string): string => {
  const rule = source.match(
    /--state-border:\s*color-mix\(in oklab,\s*var\((--[\w-]+)\)\s+(\d+)%,\s*var\((--[\w-]+)\)\)/,
  )
  if (!rule) return ''
  const [, first, weight, second] = rule
  const base =
    first === '--state-accent' ? accentOf(source, selector) : token(first.slice(2))
  return mixOklab(base, token(second.slice(2)), Number(weight) / 100)
}

/** Все состояния прибора: подпись, акцент и кромка действия. */
const STATES: { name: string; source: string; selector: string }[] = [
  {
    name: 'loading',
    source: LoadingStateSource,
    selector: '.state-loading .state__frame',
  },
  { name: 'error', source: ErrorStateSource, selector: '.state-error .state__frame' },
  { name: 'empty', source: EmptyStateSource, selector: '.state-empty .state__frame' },
  {
    name: 'not-found/lost',
    source: NotFoundStateSource,
    selector: '.state-lost .state__frame',
  },
  {
    name: 'not-found/quiet',
    source: NotFoundStateSource,
    selector: '.state-quiet .state__frame',
  },
  {
    name: 'not-found/sealed',
    source: NotFoundStateSource,
    selector: '.state-sealed .state__frame',
  },
]

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
    expect(LoadingStateSource).toContain('@keyframes loading-state-scan')
    expect(LoadingStateSource).toMatch(
      /@keyframes loading-state-scan\s*\{[^}]*transform:\s*translateX/,
    )
  })

  it('animates the signal with transform and opacity only', () => {
    const keyframes =
      LoadingStateSource.match(
        /@keyframes loading-state-rise\s*\{([\s\S]*?)\n\}/,
      )?.[1] ?? ''

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

  it('не показывает человеку сырую ошибку браузера', () => {
    const wrapper = mount(ErrorState, {
      props: { message: 'TypeError: Failed to fetch' },
    })

    // Техническая строка в UI не остаётся: она не говорит, что делать.
    expect(wrapper.text()).not.toContain('Failed to fetch')
    expect(wrapper.find('.state__message').text()).toContain('Нет связи с сервером')
    // Обрыв связи отличается от отказа сервера — другим прибором.
    expect(wrapper.find('.state__label').text()).toBe('NO LINK')
    expect(wrapper.find('[data-testid="error"]').attributes('data-variant')).toBe(
      'offline',
    )
  })

  it('отказ сервера говорит своей формулировкой', () => {
    const wrapper = mount(ErrorState, {
      props: { message: 'HTTP 503 Service Unavailable' },
    })

    expect(wrapper.text()).not.toContain('503')
    expect(wrapper.find('.state__label').text()).toBe('ERROR')
    expect(wrapper.find('[data-testid="error"]').attributes('data-variant')).toBe(
      'server',
    )
  })

  it('обрывы связи не красят прибор в красный', () => {
    // «Красной стены» нет: обрыв связи — чернильный прибор, а не авария.
    expect(ErrorStateSource).toMatch(
      /\.state-error\[data-variant='offline'\] \.state__frame\s*\{[^}]*--state-accent:\s*var\(--ink-secondary\)/,
    )
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
    // Имена keyframes у каждого состояния свои — иначе один и тот же кадр
    // объявлен в трёх файлах. Сравниваем поэтому блок по существу: имя
    // прибора приводится к общему виду, всё остальное должно совпасть
    // символ в символ.
    const shared = (source: string): string =>
      source
        .slice(
          source.indexOf('/* === Общий язык состояний'),
          source.indexOf('/* === Состояние:'),
        )
        .replace(/\b(?:empty|error|loading)-state-(scan|live|rise)\b/g, 'state-$1')

    const reference = shared(sources.loading)

    expect(reference.length).toBeGreaterThan(0)
    expect(shared(sources.error)).toBe(reference)
    expect(shared(sources.empty)).toBe(reference)
  })

  it('не объявляет одно и то же имя keyframes дважды', () => {
    // Закон системы: имя keyframes принадлежит одному файлу. Состояния
    // делят прибор, но не делят имена кадров.
    const names = (source: string): string[] =>
      [...source.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1])

    const all = [
      ...names(sources.loading),
      ...names(sources.error),
      ...names(sources.empty),
    ]

    expect(all.length).toBeGreaterThan(0)
    expect(new Set(all).size).toBe(all.length)
    // и каждое имя принадлежит своему состоянию
    expect(names(sources.loading)).toEqual(
      expect.arrayContaining([expect.stringContaining('loading-state-')]),
    )
    expect(names(sources.error)).toEqual(
      expect.arrayContaining([expect.stringContaining('error-state-')]),
    )
    expect(names(sources.empty)).toEqual(
      expect.arrayContaining([expect.stringContaining('empty-state-')]),
    )
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

describe('Доступность состояний', () => {
  it('подпись состояния читаема: контраст не ниже 4.5:1', () => {
    const paper = token('paper-raised')

    for (const state of STATES) {
      const accent = accentOf(state.source, state.selector)
      expect(accent, state.name).toMatch(/^#[0-9a-f]{6}$/i)
      expect(contrast(accent, paper), `${state.name} ${accent}`).toBeGreaterThanOrEqual(
        4.5,
      )
    }
  })

  it('граница действия читаема: контрол виден, а не растворяется в бумаге', () => {
    const paper = token('paper-raised')

    for (const state of STATES) {
      const border = borderOf(state.source, state.selector)
      expect(border, state.name).toMatch(/^#[0-9a-f]{6}$/i)
      expect(contrast(border, paper), `${state.name} ${border}`).toBeGreaterThanOrEqual(
        3,
      )
    }
  })

  it('фокус действия виден: кольцо нарисовано, а не подавлено', () => {
    for (const source of [
      LoadingStateSource,
      ErrorStateSource,
      EmptyStateSource,
      NotFoundStateSource,
    ]) {
      expect(source).toMatch(/\.state__button:focus-visible\s*\{[^}]*outline:/)
      expect(source).not.toMatch(
        /\.state__button:focus-visible\s*\{[^}]*outline:\s*none/,
      )
    }
  })

  it('объявляет состояние целиком, а не по кускам', () => {
    for (const wrapper of [
      mount(LoadingState),
      mount(EmptyState),
      mount(NotFoundState),
    ]) {
      const root = wrapper.find('[role="status"]')
      expect(root.attributes('aria-live')).toBe('polite')
      expect(root.attributes('aria-atomic')).toBe('true')
    }
  })

  it('помечает занятостью только загрузку', () => {
    expect(
      mount(LoadingState).find('[data-testid="loading"]').attributes('aria-busy'),
    ).toBe('true')
    expect(
      mount(ErrorState).find('[data-testid="error"]').attributes('aria-busy'),
    ).toBeUndefined()
    expect(
      mount(EmptyState).find('[data-testid="empty"]').attributes('aria-busy'),
    ).toBeUndefined()
    expect(
      mount(NotFoundState).find('[data-testid="not-found"]').attributes('aria-busy'),
    ).toBeUndefined()
  })

  it('не объявляет движение прибора: то, что едет, скрыто от скринридера', () => {
    const loading = mount(LoadingState)

    expect(loading.find('.state__track').attributes('aria-hidden')).toBe('true')
    expect(loading.find('.state__live').attributes('aria-hidden')).toBe('true')
    for (const corner of loading.findAll('.state__corner')) {
      expect(corner.attributes('aria-hidden')).toBe('true')
    }

    const notFound = mount(NotFoundState)
    expect(notFound.find('.state__graphic').attributes('aria-hidden')).toBe('true')
  })

  it('не прячет контент: в DOM нет прозрачных и невидимых элементов', () => {
    for (const wrapper of [
      mount(LoadingState),
      mount(ErrorState),
      mount(EmptyState),
      mount(NotFoundState),
    ]) {
      for (const node of wrapper.element.querySelectorAll('*')) {
        const style = (node as HTMLElement).style
        expect(style.opacity).not.toBe('0')
        expect(style.visibility).not.toBe('hidden')
      }
    }
  })

  it('действие ошибки доступно с клавиатуры', async () => {
    const onRetry = vi.fn()
    const wrapper = mount(ErrorState, { props: { onRetry } })
    const button = wrapper.find('button')

    // Настоящая кнопка браузера: Enter и Space активируют её сами, а
    // tabindex не выбрасывает её из порядка обхода.
    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('tabindex')).toBeUndefined()

    await button.trigger('click')
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('действие «назад» доступно с клавиатуры', async () => {
    const onAction = vi.fn()
    const wrapper = mount(NotFoundState, { props: { onAction } })
    const button = wrapper.find('button')

    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('disabled')).toBeUndefined()

    await button.trigger('click')
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})

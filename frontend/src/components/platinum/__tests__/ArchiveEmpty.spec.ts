import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import ArchiveEmpty from '../ArchiveEmpty.vue'

const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/platinum/ArchiveEmpty.vue'),
  'utf8',
)

const root = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('[data-testid="archive-empty"]')

const title = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('[data-testid="archive-empty-title"]')

const caption = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('[data-testid="archive-empty-caption"]')

const retry = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('[data-testid="archive-empty-retry"]')

const reset = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('[data-testid="archive-empty-reset"]')

const rings = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('[data-testid="archive-empty-rings"]')

describe('ArchiveEmpty', () => {
  describe('empty state', () => {
    it('speaks in the archive register: rings turning in vain', () => {
      const wrapper = mount(ArchiveEmpty)

      expect(title(wrapper).text()).toBe('Кольца вращаются вхолостую')
      expect(caption(wrapper).text()).toContain(
        'fragments: 0 · orbits: 3 · vault: idle',
      )
    })

    it('counts the fragments the vault actually holds', () => {
      const wrapper = mount(ArchiveEmpty, { props: { total: 17 } })

      expect(caption(wrapper).text()).toContain('fragments: 17 · orbits: 3')
    })

    it('shows the rings — the archive body is still there', () => {
      const wrapper = mount(ArchiveEmpty)

      expect(rings(wrapper).exists()).toBe(true)
      expect(rings(wrapper).findAll('.archive-empty__ring')).toHaveLength(3)
    })

    it('offers the default hint to create a story', () => {
      const wrapper = mount(ArchiveEmpty)

      expect(wrapper.text()).toContain('Создай историю')
    })

    it('has no button to press', () => {
      const wrapper = mount(ArchiveEmpty)

      expect(wrapper.find('button').exists()).toBe(false)
      expect(retry(wrapper).exists()).toBe(false)
      expect(reset(wrapper).exists()).toBe(false)
    })
  })

  describe('the caller’s action', () => {
    it('renders the slot instead of the default hint', () => {
      const wrapper = mount(ArchiveEmpty, {
        slots: { default: '<a class="own-action" href="/platinum/new">создать</a>' },
      })

      expect(wrapper.find('.own-action').exists()).toBe(true)
      expect(wrapper.text()).not.toContain('Создай историю')
    })

    it('lets the caller bring its own action into any mode', () => {
      const wrapper = mount(ArchiveEmpty, {
        props: { mode: 'search', query: 'ветер' },
        slots: { default: '<span class="own-action">своё</span>' },
      })

      expect(wrapper.find('.own-action').exists()).toBe(true)
    })
  })

  describe('search state', () => {
    it('quotes the query the archive was asked in', () => {
      const wrapper = mount(ArchiveEmpty, {
        props: { mode: 'search', query: 'осциллограф' },
      })

      expect(title(wrapper).text()).toBe('По запросу «осциллограф» архив молчит.')
      expect(wrapper.text()).toContain('осциллограф')
    })

    it('keeps the vault count in the mono caption', () => {
      const wrapper = mount(ArchiveEmpty, {
        props: { mode: 'search', query: 'осциллограф', total: 4 },
      })

      expect(caption(wrapper).text()).toContain(
        'fragments: 4 · orbits: 3 · vault: search',
      )
    })

    it('offers the reset of the search and nothing else', async () => {
      const wrapper = mount(ArchiveEmpty, {
        props: { mode: 'search', query: 'осциллограф' },
      })

      expect(reset(wrapper).exists()).toBe(true)
      expect(reset(wrapper).text()).toBe('сбросить поиск')
      expect(retry(wrapper).exists()).toBe(false)
      expect(wrapper.emitted('reset')).toBeUndefined()
      expect(wrapper.emitted('retry')).toBeUndefined()

      await reset(wrapper).trigger('click')

      expect(wrapper.emitted('reset')).toHaveLength(1)
      expect(wrapper.emitted('retry')).toBeUndefined()
    })

    it('hides the rings — a silent archive is not a syncing one', () => {
      const wrapper = mount(ArchiveEmpty, { props: { mode: 'search' } })

      expect(rings(wrapper).exists()).toBe(false)
    })
  })

  describe('loading state', () => {
    it('announces the synchronisation and stays busy', () => {
      const wrapper = mount(ArchiveEmpty, { props: { mode: 'loading' } })

      expect(title(wrapper).text()).toBe('Синхронизация архива…')
      expect(caption(wrapper).text()).toContain('vault: sync')
      expect(root(wrapper).attributes('aria-busy')).toBe('true')
    })

    it('turns three hairline rings', () => {
      const wrapper = mount(ArchiveEmpty, { props: { mode: 'loading' } })

      expect(rings(wrapper).exists()).toBe(true)
      expect(rings(wrapper).findAll('.archive-empty__ring')).toHaveLength(3)
      expect(rings(wrapper).attributes('aria-hidden')).toBe('true')
    })

    it('keeps the hint the caller passed along', () => {
      const wrapper = mount(ArchiveEmpty, {
        props: { mode: 'loading', detail: 'Тянем кольца из хранилища.' },
      })

      expect(wrapper.text()).toContain('Тянем кольца из хранилища.')
    })
  })

  describe('error state', () => {
    it('shows the error the archive reported', () => {
      const wrapper = mount(ArchiveEmpty, {
        props: { mode: 'error', detail: 'Хранилище не отвечает.' },
      })

      expect(title(wrapper).text()).toBe('Хранилище не отвечает.')
    })

    it('falls back to its own line when the archive said nothing', () => {
      const wrapper = mount(ArchiveEmpty, { props: { mode: 'error' } })

      expect(title(wrapper).text()).toBe('Архив недоступен.')
    })

    it('offers the retry and nothing else', async () => {
      const wrapper = mount(ArchiveEmpty, { props: { mode: 'error' } })

      expect(retry(wrapper).exists()).toBe(true)
      expect(retry(wrapper).text()).toBe('попробовать снова')
      expect(reset(wrapper).exists()).toBe(false)
      expect(wrapper.emitted('retry')).toBeUndefined()
      expect(wrapper.emitted('reset')).toBeUndefined()

      await retry(wrapper).trigger('click')

      expect(wrapper.emitted('retry')).toHaveLength(1)
      expect(wrapper.emitted('reset')).toBeUndefined()
    })
  })

  describe('accessibility', () => {
    it('is a polite status region in the quiet states', () => {
      for (const mode of ['empty', 'search', 'loading'] as const) {
        const wrapper = mount(ArchiveEmpty, { props: { mode } })

        expect(root(wrapper).attributes('role')).toBe('status')
        expect(root(wrapper).attributes('aria-live')).toBe('polite')
      }
    })

    it('is an alert region when the line breaks', () => {
      const wrapper = mount(ArchiveEmpty, { props: { mode: 'error' } })

      expect(root(wrapper).attributes('role')).toBe('alert')
    })

    it('names the region by its heading', () => {
      const wrapper = mount(ArchiveEmpty)

      const heading = title(wrapper)
      expect(heading.element.tagName).toBe('H2')
      expect(heading.attributes('id')).toBeTruthy()
      expect(root(wrapper).attributes('aria-labelledby')).toBe(heading.attributes('id'))
    })

    it('gives every button a 44px target and a visible focus', () => {
      const wrapper = mount(ArchiveEmpty, { props: { mode: 'error' } })
      const button = retry(wrapper)

      expect(button.attributes('type')).toBe('button')
      expect(SOURCE).toMatch(/\.archive-empty__link\s*\{[^}]*min-height:\s*44px/)
      expect(SOURCE).toContain('.archive-empty__link:focus-visible')
    })
  })

  describe('layout', () => {
    it('holds its height in every mode, so nothing shifts under the reader', () => {
      expect(SOURCE).toMatch(/\.archive-empty\s*\{[^}]*min-height:/)

      for (const mode of ['empty', 'search', 'loading', 'error'] as const) {
        const wrapper = mount(ArchiveEmpty, { props: { mode } })
        expect(root(wrapper).classes()).toContain('archive-empty')
        expect(root(wrapper).classes()).toContain(`archive-empty--${mode}`)
      }
    })

    it('turns the rings with transform only', () => {
      const keyframes =
        SOURCE.match(/@keyframes archive-orbit\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''

      expect(keyframes).toContain('transform: rotate(360deg)')
      expect(keyframes).not.toContain('width:')
      expect(keyframes).not.toContain('height:')
    })

    it('rests the rings when the reader asked for less motion', () => {
      expect(SOURCE).toMatch(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^@]*\.archive-empty__ring\s*\{[^}]*animation:\s*none/,
      )
    })

    it('stays readable on a 320px screen', () => {
      expect(SOURCE).toMatch(/@media\s*\(max-width:\s*640px\)/)
      expect(SOURCE).toContain('overflow-wrap: anywhere')
    })
  })

  describe('independence', () => {
    it('is self-contained: no three, no store, no router, no api', () => {
      expect(SOURCE).not.toMatch(/from\s+['"]three['"]/)
      expect(SOURCE).not.toMatch(/from\s+['"]@\/stores/)
      expect(SOURCE).not.toMatch(/from\s+['"]vue-router['"]/)
      expect(SOURCE).not.toMatch(/from\s+['"]@\/api\//)
      expect(SOURCE).not.toMatch(/\bfetch\s*\(/)
      expect(SOURCE).not.toMatch(/\baxios\b/)
    })

    it('imports nothing but vue', () => {
      const imports = [...SOURCE.matchAll(/^import\s+(.*?)\s+from\s+'([^']+)'/gm)].map(
        (match) => match[2],
      )

      expect(imports).toEqual(['vue'])
    })
  })
})

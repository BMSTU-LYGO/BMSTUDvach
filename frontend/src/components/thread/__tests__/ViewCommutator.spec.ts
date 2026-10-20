import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import ViewCommutator from '@/components/thread/ViewCommutator.vue'
import ViewCommutatorSource from '@/components/thread/ViewCommutator.vue?raw'

/**
 * View commutator (P3-T4) — one node where two identical pills used to
 * be. jsdom never applies scoped CSS, so the morph is read out of the SFC
 * source; the gesture, the aria and the emit are exercised for real.
 */
function node(mode: 'list' | 'catalog' = 'list') {
  return mount(ViewCommutator, { props: { modelValue: mode } })
}

/** Pull one CSS rule out of the SFC source. */
function ruleBlock(selector: string): string {
  const start = ViewCommutatorSource.indexOf(`${selector} {`)
  return start === -1
    ? ''
    : ViewCommutatorSource.slice(start, ViewCommutatorSource.indexOf('}', start))
}

describe('ViewCommutator — one node, two views', () => {
  it('is a single control that flips the view in both directions', async () => {
    const wrapper = node()
    expect(wrapper.findAll('button')).toHaveLength(1)

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('change')).toEqual([['catalog']])

    await wrapper.setProps({ modelValue: 'catalog' })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('change')).toEqual([['catalog'], ['list']])
  })

  it('carries the cluster state on aria-pressed and in the glyph class', async () => {
    const wrapper = node()
    const button = wrapper.find('button')

    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.classes()).not.toContain('view-node--cluster')
    expect(button.attributes('data-mode')).toBe('list')

    await wrapper.setProps({ modelValue: 'catalog' })
    expect(wrapper.find('button').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('button').classes()).toContain('view-node--cluster')
    expect(wrapper.find('button').attributes('data-mode')).toBe('catalog')
  })

  it('names the view you are in and the one the click brings', async () => {
    const wrapper = node()
    const list = wrapper.find('button')
    expect(list.attributes('title')).toBe('Список тредов — переключить на каталог узлов')
    expect(list.attributes('aria-label')).toBe(list.attributes('title'))

    await wrapper.setProps({ modelValue: 'catalog' })
    const cluster = wrapper.find('button')
    expect(cluster.attributes('title')).toBe('Каталог узлов — переключить на список тредов')
    expect(cluster.attributes('aria-label')).toBe(cluster.attributes('title'))
  })

  it('hides the glyph from the a11y tree — the button is the name', () => {
    const wrapper = node()
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
  })

  it('morphs four hairlines into the four squares of the grid', () => {
    // one glyph, four rows — no second icon to swap
    expect(ViewCommutatorSource.match(/<svg/g)?.length).toBe(1)
    // v-for over four ROWS: one <rect> template, four rendered hairlines
    expect(ViewCommutatorSource.match(/<rect/g)?.length).toBe(1)
    expect(node().findAll('.view-node__hair')).toHaveLength(4)

    const hair = ruleBlock('.view-node__hair')
    expect(hair).toContain('transform-box: fill-box')
    expect(hair).toContain('transition: transform var(--duration-normal)')
    // rows bloom one after another, not all at once
    expect(hair).toContain('transition-delay: calc(var(--row) * 20ms)')

    // each row keeps its anchor: left rows their left edge, right rows theirs
    expect(ViewCommutatorSource).toContain('transform-origin: 0% 50%')
    expect(ViewCommutatorSource).toContain('transform-origin: 100% 50%')

    // 12×1.5 → 5×5: shrink to the square's width, grow to its height,
    // slide into the grid row
    const morphed = ruleBlock('.view-node--cluster .view-node__hair')
    expect(morphed).toContain('translateY(var(--dy))')
    expect(morphed).toContain('scale(0.41667, 3.33333)')
  })

  it('wears the lens hairline and lights up only while the cluster holds', () => {
    const bezel = ruleBlock('.view-node')
    // a round node with a hairline rim, not a segmented pill
    expect(bezel).toContain('border-radius: 50%')
    expect(bezel).toContain('width: 44px')
    expect(bezel).toContain('height: 44px')

    expect(ruleBlock('.view-node--cluster')).toContain('color: var(--accent)')
    expect(ruleBlock('.view-node--cluster::after')).toContain('opacity: 0.35')
  })

  it('makes the morph instant under reduced motion', () => {
    const reduced = ViewCommutatorSource.slice(
      ViewCommutatorSource.indexOf('@media (prefers-reduced-motion: reduce)'),
    )
    expect(reduced).toContain('transition: none')
  })
})

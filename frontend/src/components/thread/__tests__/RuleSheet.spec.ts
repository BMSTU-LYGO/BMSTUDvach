import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import RuleSheet from '@/components/thread/RuleSheet.vue'
import RuleSheetSource from '@/components/thread/RuleSheet.vue?raw'

/**
 * Rule sheet (P3-T4). jsdom never applies scoped CSS, so the mask itself
 * (clip-path rows, the ruler drawing down, the height unfolding) is read
 * straight out of the SFC source — the same way the launch stage pinches
 * its own CSS in BoardView.spec.
 */
const RULES = 'Без спама.\nБез дублей.\nБез рекламы.'

function sheet(rules = RULES) {
  return mount(RuleSheet, { props: { rules } })
}

/** Pull one CSS rule out of the SFC source. */
function ruleBlock(selector: string): string {
  const start = RuleSheetSource.indexOf(`${selector} {`)
  return start === -1 ? '' : RuleSheetSource.slice(start, RuleSheetSource.indexOf('}', start))
}

describe('RuleSheet — the margin note', () => {
  it('sets the kicker and the first rule in the editorial face', () => {
    const wrapper = sheet()

    expect(wrapper.find('[data-testid="board-rules"]').exists()).toBe(true)
    expect(wrapper.find('.rule-sheet__kicker').text()).toBe('Правила записа')
    // the first line is the note's own text, not a clamped preview
    expect(wrapper.find('.rule-sheet__lead').text()).toContain('Без спама.')
    // the rest waits in rows, each its own masked line
    expect(wrapper.findAll('.rule-sheet__row').map((r) => r.text())).toEqual([
      'Без дублей.',
      'Без рекламы.',
    ])
  })

  it('drops blank lines — a note has no empty sentences', () => {
    const wrapper = sheet('Без спама.\n\n   \nБез дублей.')

    expect(wrapper.findAll('.rule-sheet__row')).toHaveLength(1)
    expect(wrapper.find('.rule-sheet__row').text()).toBe('Без дублей.')
  })

  it('stays a still note when a single line says it all', () => {
    const wrapper = sheet('Без спама.')

    expect(wrapper.find('.rule-sheet__lead--still').text()).toBe('Без спама.')
    expect(wrapper.find('[data-testid="board-rules-open"]').exists()).toBe(false)
    expect(wrapper.find('.rule-sheet__more').exists()).toBe(false)
  })

  it('opens and folds with one gesture on the marker', async () => {
    const wrapper = sheet()
    const marker = wrapper.find('[data-testid="board-rules-open"]')

    expect(marker.attributes('aria-expanded')).toBe('false')
    expect(marker.attributes('aria-controls')).toBe('rule-sheet-more')
    // the closed rest is out of the a11y tree, the open one is not
    expect(wrapper.find('#rule-sheet-more').attributes('aria-hidden')).toBe('true')

    await marker.trigger('click')
    expect(marker.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('#rule-sheet-more').attributes('aria-hidden')).toBeUndefined()
    expect(wrapper.find('.rule-sheet').classes()).toContain('rule-sheet--open')

    await marker.trigger('click')
    expect(marker.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.rule-sheet').classes()).not.toContain('rule-sheet--open')
  })

  it('names the gesture in the marker, never a «показать/свернуть» label', () => {
    const wrapper = sheet()
    const marker = wrapper.find('[data-testid="board-rules-open"]')

    expect(marker.attributes('title')).toBe('Раскрыть правила')
    expect(RuleSheetSource).not.toContain('показать')
    expect(RuleSheetSource).not.toContain('свернуть')
    // no accordion head and no clamp anywhere
    expect(RuleSheetSource).not.toContain('Правила раздела')
    expect(RuleSheetSource).not.toContain('-webkit-line-clamp')
  })

  it('opens from the first line too — the marker stays the one tab stop', async () => {
    const wrapper = sheet()
    const lead = wrapper.find('.rule-sheet__lead')

    // a convenience pointer surface, not a second keyboard stop
    expect(lead.attributes('tabindex')).toBe('-1')
    await lead.trigger('click')
    expect(wrapper.find('[data-testid="board-rules-open"]').attributes('aria-expanded')).toBe(
      'true',
    )
  })

  it('masks the rows with a clip-path line-up and unfolds the height', () => {
    const row = ruleBlock('.rule-sheet__row')
    expect(row).toContain('clip-path: inset(0 0 100% 0)')
    expect(row).toContain('visibility: hidden')

    const unveiled = ruleBlock('.rule-sheet--open .rule-sheet__row')
    expect(unveiled).toContain('visibility: visible')
    expect(unveiled).toContain('animation: rule-sheet-unveil')
    // one row after another, not one block at once
    expect(unveiled).toContain('calc(var(--row) * 55ms)')

    const more = ruleBlock('.rule-sheet__more')
    expect(more).toContain('grid-template-rows: 0fr')
    expect(ruleBlock('.rule-sheet--open .rule-sheet__more')).toContain('grid-template-rows: 1fr')
    expect(more).toContain('transition: grid-template-rows 320ms')

    // the ruler draws itself downward while the note opens
    expect(ruleBlock('.rule-sheet--open .rule-sheet__fill')).toContain('height: 100%')
  })

  it('keeps the marker a ≥44px tap zone on mobile', () => {
    const marker = ruleBlock('.rule-sheet__marker')
    expect(marker).toContain('width: 44px')
  })

  it('rules the sheet in at once under reduced motion', () => {
    const reduced = RuleSheetSource.slice(
      RuleSheetSource.indexOf('@media (prefers-reduced-motion: reduce)'),
    )
    expect(reduced).toContain('transition: none')
    expect(reduced).toContain('clip-path: none')
    expect(reduced).toContain('animation: none')
  })
})

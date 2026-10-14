import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/telemetry', () => ({
  getTelemetry: vi.fn(),
  getTelemetryActivity: vi.fn(),
}))

import StatsView from '@/views/StatsView.vue'
import { getTelemetry, getTelemetryActivity } from '@/api/telemetry'
import type { Telemetry, TelemetryActivity } from '@/api/telemetry'

const telemetry: Telemetry = {
  boards: 4,
  threads: 13,
  posts: 63,
  attachments: 5,
  last_24h: { posts: 3, threads: 1 },
  busiest_board: { slug: 'b', name: 'Разное', posts: 40 },
  generated_at: '2026-10-13T12:00:00Z',
}

function series(days: number): TelemetryActivity {
  return {
    days,
    points: Array.from({ length: days }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      posts: i === days - 1 ? 5 : 0,
      threads: i === days - 1 ? 2 : 0,
    })),
  }
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  const wrapper = mount(StatsView, { global: { plugins: [router] } })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('StatsView', () => {
  beforeEach(() => {
    vi.mocked(getTelemetry).mockResolvedValue(telemetry)
    vi.mocked(getTelemetryActivity).mockResolvedValue(series(7))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the summary cells from the telemetry api', async () => {
    const wrapper = await mountView()
    expect(getTelemetry).toHaveBeenCalled()
    const cell = (key: string) => wrapper.find(`[data-testid="stat-cell-${key}"]`)
    expect(cell('boards').text()).toContain('04')
    expect(cell('threads').text()).toContain('013')
    expect(cell('posts').text()).toContain('063')
    expect(cell('attachments').text()).toContain('005')
    expect(cell('day').text()).toContain('+003')
    expect(cell('active').text()).toContain('/b/')
  })

  it('draws one bar per day and exposes the values to a11y', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="activity-chart"]').exists()).toBe(true)

    const bars = wrapper.findAll('.chart__col')
    expect(bars).toHaveLength(7)
    expect(bars[0].attributes('title')).toContain('сообщений 0')
    expect(bars[6].attributes('title')).toContain('сообщений 5')

    // visual bars stay out of the a11y tree; values are listed instead
    expect(wrapper.find('.chart__bars').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('.chart__data').text()).toContain('сообщений 5, тредов 2')
  })

  it('refetches the series when the range changes', async () => {
    const wrapper = await mountView()
    expect(getTelemetryActivity).toHaveBeenCalledWith(7)

    vi.mocked(getTelemetryActivity).mockResolvedValue(series(30))
    await wrapper.find('[data-testid="range-30"]').trigger('click')
    await flushPromises()

    expect(getTelemetryActivity).toHaveBeenLastCalledWith(30)
    expect(wrapper.find('[data-testid="range-30"]').attributes('aria-pressed')).toBe(
      'true',
    )
    expect(wrapper.findAll('.chart__col')).toHaveLength(30)
  })

  it('shows the error state when the series fails', async () => {
    vi.mocked(getTelemetryActivity).mockRejectedValue(new Error('down'))
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="activity-chart"]').exists()).toBe(false)
  })
})

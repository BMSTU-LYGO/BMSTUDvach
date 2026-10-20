import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api/telemetry', () => ({
  getTelemetry: vi.fn(),
  getTelemetryActivity: vi.fn(),
}))

import StatsView from '@/views/StatsView.vue'
import { getTelemetry, getTelemetryActivity } from '@/api/telemetry'
import type { Telemetry } from '@/api/telemetry'

const telemetry: Telemetry = {
  boards: 4,
  threads: 13,
  posts: 63,
  attachments: 5,
  last_24h: { posts: 3, threads: 1 },
  busiest_board: { slug: 'b', name: 'Разное', posts: 40 },
  generated_at: '2026-10-13T12:00:00Z',
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

describe('StatsView — состояния без данных', () => {
  beforeEach(() => {
    vi.mocked(getTelemetry).mockResolvedValue(telemetry)
    vi.mocked(getTelemetryActivity).mockResolvedValue({
      days: 7,
      points: [
        { date: '2026-10-01', posts: 1, threads: 1 },
        { date: '2026-10-02', posts: 2, threads: 0 },
      ],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('пустая серия — это состояние, а не пустой график', async () => {
    vi.mocked(getTelemetryActivity).mockResolvedValue({ days: 7, points: [] })

    const wrapper = await mountView()

    const state = wrapper.find('[data-testid="state-not-found"]')
    expect(state.exists()).toBe(true)
    expect(state.attributes('data-variant')).toBe('quiet')
    expect(wrapper.find('.state__label').text()).toContain('NO READINGS')
    expect(wrapper.find('[data-testid="activity-chart"]').exists()).toBe(false)
  })

  it('с показаниями остаётся график', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="activity-chart"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="state-not-found"]').exists()).toBe(false)
  })

  it('без сводки показывает то же состояние, а не прочерки', async () => {
    vi.mocked(getTelemetry).mockResolvedValue(null as unknown as Telemetry)

    const wrapper = await mountView()

    const state = wrapper.find('[data-testid="state-not-found"]')
    expect(state.exists()).toBe(true)
    expect(state.attributes('data-variant')).toBe('quiet')
    expect(wrapper.find('[data-testid="stat-cell-boards"]').exists()).toBe(false)
  })
})

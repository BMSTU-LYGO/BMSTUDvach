import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import AmbientField from '../AmbientField.vue'
import { sceneState } from '@/three/sceneState'

/**
 * The ambient layer chooses between three backgrounds: the network (every
 * route), the archive space (the platinum routes) and the Canvas2D particle
 * field (3D off).
 *
 * The canvases are mocked — they own WebGL contexts, and what matters here
 * is the choice of the layer and the fact that the loser of the choice is
 * really unmounted (an unmount releases the context slot of `useThreeScene`).
 */

const mocks = vi.hoisted(() => ({
  resolved: null as { value: 'high' | 'low' | 'off' } | null,
  network: { mounted: 0, unmounted: 0 },
  archive: { mounted: 0, unmounted: 0 },
  particle: { mounted: 0, unmounted: 0 },
}))

vi.mock('@/composables/useQuality3D', async () => {
  const { ref } = await import('vue')
  const resolved = ref<'high' | 'low' | 'off'>('high')
  mocks.resolved = resolved
  return {
    useQuality3D: () => ({
      setting: ref('auto'),
      resolved,
      cycleSetting: vi.fn(),
      degrade: vi.fn(),
    }),
  }
})

vi.mock('@/components/three/NetworkCanvas.vue', async () => {
  const { defineComponent, h, onMounted, onUnmounted } = await import('vue')
  return {
    // The async wrapper of Vue unwraps an ES module: the mock has to look
    // like one, otherwise the whole namespace is taken for a component.
    __esModule: true,
    default: defineComponent({
      name: 'NetworkCanvasMock',
      setup() {
        onMounted(() => {
          mocks.network.mounted++
        })
        onUnmounted(() => {
          mocks.network.unmounted++
        })
        return () => h('div', { 'data-testid': 'network-canvas' })
      },
    }),
  }
})

vi.mock('@/components/three/ArchiveSpaceCanvas.vue', async () => {
  const { defineComponent, h, onMounted, onUnmounted } = await import('vue')
  return {
    __esModule: true,
    default: defineComponent({
      name: 'ArchiveSpaceCanvasMock',
      setup() {
        onMounted(() => {
          mocks.archive.mounted++
        })
        onUnmounted(() => {
          mocks.archive.unmounted++
        })
        return () => h('div', { 'data-testid': 'archive-space-canvas' })
      },
    }),
  }
})

vi.mock('@/components/ui/ParticleField.vue', async () => {
  const { defineComponent, h, onMounted, onUnmounted } = await import('vue')
  return {
    __esModule: true,
    default: defineComponent({
      name: 'ParticleFieldMock',
      props: { count: { type: Number, default: 60 } },
      setup(props) {
        onMounted(() => {
          mocks.particle.mounted++
        })
        onUnmounted(() => {
          mocks.particle.unmounted++
        })
        return () =>
          h('canvas', {
            class: 'particle-field',
            'data-testid': 'particle-field',
            'data-count': String(props.count),
          })
      },
    }),
  }
})

/** The resolved 3D quality the mocked `useQuality3D` hands out. */
function quality() {
  if (!mocks.resolved) throw new Error('the quality mock is not installed')
  return mocks.resolved
}

/** Switch the resolved 3D quality. */
function setQuality(value: 'high' | 'low' | 'off') {
  quality().value = value
}

/** Let the reactive render and the async canvases settle. */
async function settle() {
  await nextTick()
  await flushPromises()
  await nextTick()
}

/** The wrapper of the test that is running (unmounted after the test). */
let current: { unmount: () => void } | null = null

/** Mount the ambient layer and wait for the async canvases to arrive. */
async function mountField(mode: 'home' | 'platinum') {
  sceneState.mode = mode
  const wrapper = mount(AmbientField)
  current = wrapper
  await settle()
  return wrapper
}

/** Switch the scene mode of the route. */
async function switchMode(mode: 'home' | 'platinum') {
  sceneState.mode = mode
  await settle()
}

beforeEach(() => {
  sceneState.mode = 'home'
  quality().value = 'high'
  mocks.network.mounted = 0
  mocks.network.unmounted = 0
  mocks.archive.mounted = 0
  mocks.archive.unmounted = 0
  mocks.particle.mounted = 0
  mocks.particle.unmounted = 0
})

afterEach(() => {
  current?.unmount()
  current = null
})

describe('AmbientField — the layer of the route', () => {
  it('gives the platinum route the archive space instead of the network', async () => {
    const wrapper = await mountField('platinum')

    expect(wrapper.find('[data-testid="archive-space-canvas"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="network-canvas"]').exists()).toBe(false)
    expect(mocks.archive.mounted).toBe(1)
    expect(mocks.network.mounted).toBe(0)
  })

  it('keeps the network on the other routes', async () => {
    const wrapper = await mountField('home')

    expect(wrapper.find('[data-testid="network-canvas"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="archive-space-canvas"]').exists()).toBe(false)
    expect(mocks.network.mounted).toBe(1)
    expect(mocks.archive.mounted).toBe(0)
  })

  it('falls back to the particle field when 3D is off', async () => {
    setQuality('off')
    const wrapper = await mountField('home')

    expect(wrapper.find('[data-testid="particle-field"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="network-canvas"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="archive-space-canvas"]').exists()).toBe(false)
    expect(mocks.network.mounted).toBe(0)
    expect(mocks.archive.mounted).toBe(0)
  })

  it('falls back to the particle field on the platinum route too', async () => {
    setQuality('off')
    const wrapper = await mountField('platinum')

    expect(wrapper.find('[data-testid="particle-field"]').exists()).toBe(true)
    expect(mocks.archive.mounted).toBe(0)
    expect(mocks.network.mounted).toBe(0)
  })

  it('asks the particle field for the same amount of particles as before', async () => {
    setQuality('off')
    const wrapper = await mountField('home')

    expect(
      wrapper.find('[data-testid="particle-field"]').attributes('data-count'),
    ).toBe('25')
  })
})

describe('AmbientField — the switch of the route', () => {
  it('follows the scene mode of the route', async () => {
    const wrapper = await mountField('platinum')
    expect(wrapper.find('[data-testid="archive-space-canvas"]').exists()).toBe(true)

    await switchMode('home')

    expect(wrapper.find('[data-testid="network-canvas"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="archive-space-canvas"]').exists()).toBe(false)
  })

  it('unmounts the archive when the route leaves it', async () => {
    await mountField('platinum')

    await switchMode('home')

    expect(mocks.archive.unmounted).toBe(1)
  })

  it('mounts the network again when the archive is left', async () => {
    await mountField('platinum')

    await switchMode('home')

    expect(mocks.network.mounted).toBe(1)
  })

  it('leaves no canvas behind on a fast enter and leave', async () => {
    const wrapper = await mountField('home')
    expect(mocks.network.mounted).toBe(1)

    await switchMode('platinum')
    await switchMode('home')

    expect(wrapper.find('[data-testid="network-canvas"]').exists()).toBe(true)

    // Every canvas that was mounted was unmounted again — no dangling
    // WebGL context survives the round trip.
    wrapper.unmount()
    current = null
    expect(mocks.network.mounted).toBe(mocks.network.unmounted)
    expect(mocks.archive.mounted).toBe(mocks.archive.unmounted)
  })
})

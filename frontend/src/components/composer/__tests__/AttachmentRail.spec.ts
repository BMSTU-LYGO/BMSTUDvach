import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import AttachmentRail from '../AttachmentRail.vue'

/**
 * Cargo Rail intake (P3-T1a). The rail owns its own arming, so every parent
 * that mounts it — Signal Dock, Launch Bay — gets the same authored intake
 * without any extra wiring, and none of them grows a dropzone.
 */
function mountRail(props: Record<string, unknown> = {}) {
  return mount(AttachmentRail, {
    props: { files: [], maxFiles: 4, ...props },
  })
}

function drag(wrapper: ReturnType<typeof mountRail>, type: string, extra: Record<string, unknown> = {}) {
  return wrapper.trigger(type, {
    clientX: 30,
    clientY: 10,
    dataTransfer: { files: [], dropEffect: '' },
    ...extra,
  })
}

describe('AttachmentRail intake', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens its sockets when files are dragged over a bare mount', async () => {
    const wrapper = mountRail()

    expect(wrapper.find('.cargo-rail__strip').exists()).toBe(false)

    await drag(wrapper, 'dragover')

    expect(wrapper.classes()).toContain('cargo-rail--armed')
    expect(wrapper.findAll('.cargo-rail__socket')).toHaveLength(4)
    expect(wrapper.find('.cargo-rail__fiber').exists()).toBe(true)
    expect(wrapper.find('.cargo-rail__magnet').text()).toContain('свободно 4 из 4')
    // still no capsule until something is actually accepted
    expect(wrapper.findAll('[data-testid="attachment-capsule"]')).toHaveLength(0)
  })

  it('keeps the 4-file limit and honours the accepted list', async () => {
    const wrapper = mountRail()

    await drag(wrapper, 'drop', {
      dataTransfer: {
        files: [
          new File([new Uint8Array(8)], 'a.png', { type: 'image/png' }),
          new File([new Uint8Array(8)], 'b.png', { type: 'image/png' }),
          new File([new Uint8Array(8)], 'c.png', { type: 'image/png' }),
          new File([new Uint8Array(8)], 'd.png', { type: 'image/png' }),
          new File([new Uint8Array(8)], 'e.png', { type: 'image/png' }),
          new File([new Uint8Array(8)], 'vec.svg', { type: 'image/svg+xml' }),
        ],
      },
    })

    const emitted = wrapper.emitted('update:files')
    expect(emitted?.[0][0]).toHaveLength(4)
    expect(wrapper.emitted('error')).toBeTruthy()
    // two rejections: the 5th file and the unsupported type
    expect(wrapper.findAll('.capsule--rejected')).toHaveLength(2)
  })

  it('removes a capsule and hands the trimmed list back', async () => {
    const wrapper = mountRail({
      files: [
        new File([new Uint8Array(8)], 'keep.png', { type: 'image/png' }),
        new File([new Uint8Array(8)], 'drop.png', { type: 'image/png' }),
      ],
    })

    await wrapper.findAll('.capsule__remove')[1].trigger('click')

    const emitted = wrapper.emitted('update:files')
    expect(emitted?.[0][0]).toHaveLength(1)
    expect((emitted?.[0][0] as File[])[0].name).toBe('keep.png')
  })
})

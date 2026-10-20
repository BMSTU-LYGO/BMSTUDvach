import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

/** The motion preference is a switch of the reader, not of the build. */
const motion = vi.hoisted(() => ({ reduced: false }))

vi.mock('@/composables/useGsap', () => ({
  gsap: {
    from: vi.fn(),
    to: vi.fn(),
    fromTo: vi.fn(),
    set: vi.fn(),
    // The context runs its callback right away and hands back a revertible
    // handle, exactly like the real one does.
    context: vi.fn((fn: () => void) => {
      fn()
      return { revert: vi.fn(), kill: vi.fn() }
    }),
  },
  ScrollTrigger: {},
  Flip: {},
  prefersReducedMotion: () => motion.reduced,
  isTouchDevice: () => false,
}))

vi.mock('@/api/platinum', () => ({
  getPlatinumStory: vi.fn(),
  listPlatinumStories: vi.fn(),
}))

import PlatinumStoryView from '@/views/PlatinumStoryView.vue'
import { getPlatinumStory } from '@/api/platinum'
import { ApiRequestError } from '@/api/client'
import { gsap } from '@/composables/useGsap'
import { onSceneEvent, sceneState, type SceneEvent } from '@/three/sceneState'

const STORY = {
  id: 5,
  title: 'Ночь перед экзаменом',
  body: 'Длинный текст истории,\nкоторый целиком здесь.\n\nВторой абзац.',
  source_type: 'generated',
  status: 'published',
  generation_metadata: {},
  created_at: '2026-05-01T10:00:00Z',
  published_at: '2026-05-01T10:00:00Z',
}

async function mountStory(storyId = 5) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/platinum', component: { template: '<div />' } },
      { path: '/platinum/:storyId(\\d+)', component: PlatinumStoryView, props: true },
    ],
  })
  await router.push(`/platinum/${storyId}`)
  await router.isReady()
  const wrapper = mount(PlatinumStoryView, {
    props: { storyId },
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

/** Collect the scene events of the story. */
function captureEvents() {
  const events: SceneEvent[] = []
  const stop = onSceneEvent((ev) => events.push(ev))
  return { events, stop }
}

describe('PlatinumStoryView', () => {
  beforeEach(() => {
    vi.mocked(getPlatinumStory).mockReset()
    vi.clearAllMocks()
    motion.reduced = false
    // The archive space is a shared scene: every test starts from a clean
    // vault.
    sceneState.archiveStories = []
    sceneState.focusedStory = null
    sceneState.selectedStory = null
  })

  it('renders the full story on a calm reading surface', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({ ...STORY })
    const wrapper = await mountStory()

    expect(wrapper.get('.story-title').text()).toBe('Ночь перед экзаменом')
    expect(wrapper.get('.story-body').text()).toContain('Длинный текст истории')
    expect(wrapper.text()).toContain('node #5')
    expect(wrapper.text()).toContain('generated')
  })

  it('keeps the rhythm of the paragraphs', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({ ...STORY })
    const wrapper = await mountStory()

    const paragraphs = wrapper.findAll('.story-para')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].text()).toContain('Длинный текст истории')
    expect(paragraphs[1].text()).toBe('Второй абзац.')
  })

  it('explains a missing fragment honestly', async () => {
    vi.mocked(getPlatinumStory).mockRejectedValue(new ApiRequestError(404, 'Not found'))
    const wrapper = await mountStory(999)
    expect(wrapper.text()).toContain('Фрагмент не найден в архиве.')
  })

  it('explains an unreachable archive honestly', async () => {
    vi.mocked(getPlatinumStory).mockRejectedValue(new Error('boom'))
    const wrapper = await mountStory(5)
    expect(wrapper.text()).toContain('Архив недоступен.')
  })

  it('offers a way back to the archive', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({ ...STORY })
    const wrapper = await mountStory(1)
    expect(wrapper.find('.story-back').attributes('href')).toBe('/platinum')
  })

  /* === The space opens the story ==================================== */

  it('opens the story in the archive space', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({ ...STORY })
    await mountStory(5)

    expect(sceneState.selectedStory).toBe(5)
    expect(sceneState.focusedStory).toBe(5)
  })

  it('gives the space a fragment to aim at on a direct link', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({ ...STORY })
    await mountStory(5)

    expect(sceneState.archiveStories).toHaveLength(1)
    expect(sceneState.archiveStories[0]).toMatchObject({
      id: 5,
      title: 'Ночь перед экзаменом',
      year: 2026,
      ringIndex: 0,
      sourceType: 'generated',
    })
  })

  it('keeps the archive list the reader came from', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({ ...STORY })
    sceneState.archiveStories = [
      { id: 1, title: 'Другой', year: 2025, ringIndex: 0, sourceType: 'dvach' },
      { id: 5, title: 'Ночь перед экзаменом', year: 2026, ringIndex: 1, sourceType: 'generated' },
    ]
    await mountStory(5)

    expect(sceneState.archiveStories).toHaveLength(2)
  })

  it('tells the space to open the fragment once', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({ ...STORY })
    const { events, stop } = captureEvents()
    await mountStory(5)
    stop()

    expect(events).toContainEqual({ type: 'archive-open', target: 5 })
  })

  it('does not open the fragment twice when the list opened it first', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({ ...STORY })
    // The reader came from the archive list: the story is already selected
    // and the director has announced the opening.
    sceneState.selectedStory = 5
    const { events, stop } = captureEvents()
    await mountStory(5)
    stop()

    expect(events.filter((ev) => ev.type === 'archive-open')).toHaveLength(0)
    expect(sceneState.selectedStory).toBe(5)
  })

  /* === The way back ================================================= */

  it('closes the fragment on the way back to the archive', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({ ...STORY })
    const { events, stop } = captureEvents()
    const wrapper = await mountStory(5)

    await wrapper.get('.story-back').trigger('click')
    await flushPromises()
    stop()

    expect(sceneState.selectedStory).toBeNull()
    expect(sceneState.focusedStory).toBeNull()
    expect(events).toContainEqual({ type: 'archive-clear' })
  })

  it('releases the fragment when the story is left another way', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({ ...STORY })
    const wrapper = await mountStory(5)
    expect(sceneState.selectedStory).toBe(5)

    wrapper.unmount()

    expect(sceneState.selectedStory).toBeNull()
    expect(sceneState.focusedStory).toBeNull()
  })

  /* === The cinematic entrance ======================================== */

  it('unfolds the reading layer in steps', async () => {
    vi.mocked(getPlatinumStory).mockResolvedValue({ ...STORY })
    await mountStory(5)

    const calls = vi.mocked(gsap.fromTo).mock.calls
    const stage = calls.find((call) => call[0] === '.story-stage')
    expect(stage).toBeTruthy()
    expect(stage![1]).toEqual({ opacity: 0, y: 18 })
    expect(stage![2]).toMatchObject({
      opacity: 1,
      y: 0,
      duration: 0.6,
      ease: 'power3.out',
      delay: 0.25,
    })

    // The title comes after the metadata, the paragraphs after the title.
    const order = calls.map((call) => String(call[0]))
    expect(order.indexOf('.story-meta')).toBeLessThan(order.indexOf('.story-title'))
    expect(order.indexOf('.story-title')).toBeLessThan(order.indexOf('.story-para'))

    const paragraphs = calls.find((call) => call[0] === '.story-para')
    expect(paragraphs![2]).toMatchObject({ stagger: 0.05 })
  })

  it('keeps the text readable when the reader asked for calm motion', async () => {
    motion.reduced = true
    vi.mocked(getPlatinumStory).mockResolvedValue({ ...STORY })
    const wrapper = await mountStory(5)

    const stage = wrapper.get('.story-stage').element as HTMLElement
    const title = wrapper.get('.story-title').element as HTMLElement

    expect(vi.mocked(gsap.fromTo)).not.toHaveBeenCalled()
    expect(stage.style.opacity).toBe('')
    expect(title.style.opacity).toBe('')
    expect(title.textContent).toBe('Ночь перед экзаменом')
  })
})

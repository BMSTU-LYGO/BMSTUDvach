import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'

import { createAppRouter } from '@/router'

function descriptionContent(): string | null {
  return (
    document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null
  )
}

async function navigate(path: string): Promise<void> {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
}

describe('router meta', () => {
  beforeEach(() => {
    document.title = 'BMSTUDvach'
    document
      .querySelectorAll('meta[name="description"]')
      .forEach((node) => node.remove())
  })

  it('sets home title and description', async () => {
    await navigate('/')
    expect(document.title).toBe('BMSTUDvach — сеть бауманских форумов')
    expect(descriptionContent()).toContain('Анонимный форум')
  })

  it('substitutes the board slug into the title', async () => {
    await navigate('/boards/b/')
    expect(document.title).toBe('/b/ — BMSTUDvach')
    expect(descriptionContent()).not.toContain('/b/')
  })

  it('substitutes the thread id into the title', async () => {
    await navigate('/threads/42/')
    expect(document.title).toBe('Тред #42 — BMSTUDvach')
    expect(descriptionContent()).toContain('Тред')
  })

  it('substitutes the story id into the title', async () => {
    await navigate('/platinum/7/')
    expect(document.title).toBe('Платинум #7 — BMSTUDvach')
    expect(descriptionContent()).toContain('Платиновая история')
  })

  it('covers platinum, about and moderation', async () => {
    await navigate('/platinum/')
    expect(document.title).toBe('Платинум — BMSTUDvach')

    await navigate('/about/')
    expect(document.title).toBe('О проекте — BMSTUDvach')

    await navigate('/moderation/')
    expect(document.title).toBe('Модерация — BMSTUDvach')
  })

  it('names the stats page', async () => {
    await navigate('/stats/')
    expect(document.title).toBe('Статистика сети — BMSTUDvach')
    expect(descriptionContent()).toContain('Телеметрия')
  })

  it('falls back to the lost node title for unknown paths', async () => {
    await navigate('/unknown-path')
    expect(document.title).toBe('Сигнал потерян — 404')
    expect(descriptionContent()).toContain('LOST NODE')
  })

  it('creates the description meta when the document has none', async () => {
    expect(document.querySelector('meta[name="description"]')).toBeNull()
    await navigate('/about/')
    const meta = document.querySelector('meta[name="description"]')
    expect(meta).not.toBeNull()
    expect(meta?.getAttribute('name')).toBe('description')
    expect(descriptionContent()).toContain('BMSTUDvach: анонимность')
  })

  it('applies meta on the very first (initial) navigation', async () => {
    window.history.replaceState(null, '', '/threads/9/')
    const router = createAppRouter()
    mount({ template: '<div />' }, { global: { plugins: [router] } })
    await router.isReady()
    expect(document.title).toBe('Тред #9 — BMSTUDvach')
    window.history.replaceState(null, '', '/')
  })
})

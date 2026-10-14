import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import {
  isEditableTarget,
  matchPostIds,
  splitHighlight,
  useThreadSearch,
} from '@/composables/useThreadSearch'
import type { Post } from '@/types'

function post(id: number, body: string): Post {
  return {
    id,
    thread: 1,
    body,
    is_op: id === 1,
    sage: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    author: 'Аноним',
    tripcode: '',
    attachments: [],
  }
}

describe('matchPostIds', () => {
  const posts = [post(1, 'Открываю тред'), post(2, 'Тред про мемы'), post(3, 'мимо')]

  it('ищет регистронезависимо', () => {
    expect(matchPostIds(posts, 'ТРЕД')).toEqual([1, 2])
    expect(matchPostIds(posts, 'тред')).toEqual([1, 2])
  })

  it('тримит запрос', () => {
    expect(matchPostIds(posts, '  мемы  ')).toEqual([2])
  })

  it('игнорирует запрос короче двух символов', () => {
    expect(matchPostIds(posts, 'т')).toEqual([])
    expect(matchPostIds(posts, '')).toEqual([])
    expect(matchPostIds(posts, '   ')).toEqual([])
  })

  it('возвращает пустой список без совпадений', () => {
    expect(matchPostIds(posts, 'нет такого')).toEqual([])
  })
})

describe('splitHighlight', () => {
  it('возвращает один не-hit сегмент без совпадений', () => {
    expect(splitHighlight('просто текст', 'zzz')).toEqual([
      { text: 'просто текст', hit: false },
    ])
  })

  it('режет текст на сегменты вокруг совпадения', () => {
    expect(splitHighlight('это тред, да', 'тред')).toEqual([
      { text: 'это ', hit: false },
      { text: 'тред', hit: true },
      { text: ', да', hit: false },
    ])
  })

  it('сохраняет регистр исходного текста', () => {
    expect(splitHighlight('Тред', 'тред')).toEqual([{ text: 'Тред', hit: true }])
  })

  it('находит все вхождения последовательно', () => {
    expect(splitHighlight('ба ба ба', 'ба')).toEqual([
      { text: 'ба', hit: true },
      { text: ' ', hit: false },
      { text: 'ба', hit: true },
      { text: ' ', hit: false },
      { text: 'ба', hit: true },
    ])
  })

  it('не ищет перекрытия — простой последовательный проход', () => {
    expect(splitHighlight('ааа', 'аа')).toEqual([
      { text: 'аа', hit: true },
      { text: 'а', hit: false },
    ])
  })

  it('пустой запрос не подсвечивает', () => {
    expect(splitHighlight('текст', '')).toEqual([{ text: 'текст', hit: false }])
  })

  it('совпадение в начале и в конце', () => {
    expect(splitHighlight('да-да', 'да')).toEqual([
      { text: 'да', hit: true },
      { text: '-', hit: false },
      { text: 'да', hit: true },
    ])
  })
})

describe('useThreadSearch', () => {
  const posts = [post(1, 'раз тред'), post(2, 'два'), post(3, 'три тред')]

  it('начинает закрытым и без совпадений', () => {
    const search = useThreadSearch(ref(posts))
    expect(search.open.value).toBe(false)
    expect(search.query.value).toBe('')
    expect(search.matches.value).toEqual([])
    expect(search.activeIndex.value).toBe(-1)
    expect(search.label.value).toBe('')
  })

  it('считает совпадения и стартует с первого', () => {
    const search = useThreadSearch(ref(posts))
    search.openSearch()
    search.query.value = 'тред'

    expect(search.open.value).toBe(true)
    expect(search.matches.value).toEqual([1, 3])
    expect(search.activeIndex.value).toBe(0)
    expect(search.activePostId.value).toBe(1)
    expect(search.label.value).toBe('1 / 2')
  })

  it('next/prev зацикливаются', () => {
    const search = useThreadSearch(ref(posts))
    search.openSearch()
    search.query.value = 'тред'

    search.next()
    expect(search.activePostId.value).toBe(3)
    expect(search.label.value).toBe('2 / 2')

    search.next()
    expect(search.activePostId.value).toBe(1)

    search.prev()
    expect(search.activePostId.value).toBe(3)
  })

  it('next/prev молчат без совпадений', () => {
    const search = useThreadSearch(ref(posts))
    search.openSearch()
    search.query.value = 'zzz'
    search.next()
    search.prev()
    expect(search.activeIndex.value).toBe(-1)
    expect(search.activePostId.value).toBe(null)
    expect(search.label.value).toBe('0 / 0')
  })

  it('close сбрасывает запрос, подсветку и счётчик', () => {
    const search = useThreadSearch(ref(posts))
    search.openSearch()
    search.query.value = 'тред'
    search.close()

    expect(search.open.value).toBe(false)
    expect(search.query.value).toBe('')
    expect(search.matches.value).toEqual([])
    expect(search.activeIndex.value).toBe(-1)
    expect(search.label.value).toBe('')
  })

  it('курсор j стартует с первого и упирается в конец', () => {
    const search = useThreadSearch(ref(posts))
    expect(search.cursorIndex.value).toBe(-1)

    search.cursorNext()
    expect(search.cursorIndex.value).toBe(0)
    search.cursorNext()
    expect(search.cursorIndex.value).toBe(1)
    search.cursorNext()
    search.cursorNext()
    expect(search.cursorIndex.value).toBe(2)
  })

  it('курсор k стартует с последнего и упирается в начало', () => {
    const search = useThreadSearch(ref(posts))
    search.cursorPrev()
    expect(search.cursorIndex.value).toBe(2)
    search.cursorPrev()
    search.cursorPrev()
    search.cursorPrev()
    expect(search.cursorIndex.value).toBe(0)
  })

  it('курсор безопасен на пустом списке', () => {
    const search = useThreadSearch(ref<Post[]>([]))
    search.cursorNext()
    expect(search.cursorIndex.value).toBe(-1)
    search.cursorPrev()
    expect(search.cursorIndex.value).toBe(-1)
  })
})

describe('isEditableTarget', () => {
  it('распознаёт поля ввода', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableTarget(document.createElement('select'))).toBe(true)
  })

  it('распознаёт contenteditable и его потомков', () => {
    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    const child = document.createElement('span')
    host.appendChild(child)
    expect(isEditableTarget(host)).toBe(true)
    expect(isEditableTarget(child)).toBe(true)
  })

  it('обычный элемент и null не считаются полем', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(document.body)).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})

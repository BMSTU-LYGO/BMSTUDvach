import { createRouter, createWebHistory } from 'vue-router'
import type {
  RouteLocationNormalized,
  RouteRecordRaw,
  Router,
  RouterHistory,
} from 'vue-router'

import DefaultLayout from '@/layouts/DefaultLayout.vue'
import type { SceneMode } from '@/three/sceneState'

declare module 'vue-router' {
  interface RouteMeta {
    /** Which visual mode the persistent 3D network scene should take. */
    scene?: SceneMode
    /** Document title, `:param` placeholders resolved from route params. */
    title?: string
    /** Value of `<meta name="description">`, `:param` placeholders allowed. */
    description?: string
  }
}

const DEFAULT_TITLE = 'BMSTUDvach'
const DEFAULT_DESCRIPTION = 'BMSTUDvach — форум МГТУ им. Н. Э. Баумана'

function fillParams(
  template: string,
  params: RouteLocationNormalized['params'],
): string {
  return template.replace(/:([A-Za-z0-9_]+)/g, (placeholder, name: string) => {
    const value = params[name]
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value)
    }
    if (Array.isArray(value) && value.length > 0) return String(value[0])
    return placeholder
  })
}

function descriptionMeta(): HTMLMetaElement | null {
  if (typeof document === 'undefined') return null
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'description'
    document.head.appendChild(meta)
  }
  return meta
}

function applyRouteMeta(to: RouteLocationNormalized): void {
  if (typeof document === 'undefined') return
  const title = to.meta.title
  document.title = title ? fillParams(title, to.params) : DEFAULT_TITLE
  const description = to.meta.description
  descriptionMeta()?.setAttribute(
    'content',
    description ? fillParams(description, to.params) : DEFAULT_DESCRIPTION,
  )
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: DefaultLayout,
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/HomeView.vue'),
        meta: {
          scene: 'home',
          title: 'BMSTUDvach — сеть бауманских форумов',
          description:
            'Анонимный форум МГТУ им. Н. Э. Баумана: разделы, треды, ответы и архив платиновых историй в одной инженерной сети.',
        },
      },
      {
        path: 'boards/:boardSlug',
        name: 'board',
        component: () => import('@/views/BoardView.vue'),
        props: true,
        meta: {
          scene: 'board',
          title: '/:boardSlug/ — BMSTUDvach',
          description:
            'Треды и обсуждения бауманского раздела: читай сигналы, отвечай в Signal Dock или запусти свой тред из Launch Bay.',
        },
      },
      {
        path: 'threads/:threadId(\\d+)',
        name: 'thread',
        component: () => import('@/views/ThreadView.vue'),
        props: true,
        meta: {
          scene: 'thread',
          title: 'Тред #:threadId — BMSTUDvach',
          description:
            'Тред бауманского форума: сообщения, ответы и вложения — отвечай в Signal Dock или следи за темой.',
        },
      },
      {
        path: 'platinum',
        name: 'platinum',
        component: () => import('@/views/PlatinumView.vue'),
        meta: {
          scene: 'platinum',
          title: 'Платинум — BMSTUDvach',
          description:
            'Архив Платинума: сгенерированные истории в бауманской вселенной — поиск, чтение и копирование ссылок.',
        },
      },
      {
        path: 'platinum/:storyId(\\d+)',
        name: 'platinum-story',
        component: () => import('@/views/PlatinumStoryView.vue'),
        props: true,
        meta: {
          scene: 'platinum',
          title: 'Платинум #:storyId — BMSTUDvach',
          description:
            'Платиновая история из архива BMSTUDvach — генерация в бауманской вселенной.',
        },
      },
      {
        path: 'about',
        name: 'about',
        component: () => import('@/views/AboutView.vue'),
        meta: {
          scene: 'home',
          title: 'О проекте — BMSTUDvach',
          description:
            'Что такое BMSTUDvach: анонимность, троттлинг, разделы, платины и маршрутная 3D-сеть бауманского форума.',
        },
      },
      {
        path: 'moderation',
        name: 'moderation',
        component: () => import('@/views/ModerationView.vue'),
        meta: {
          scene: 'home',
          title: 'Модерация — BMSTUDvach',
          description:
            'Журнал модерации BMSTUDvach: очередь жалоб, быстрые действия и статистика бауманского форума.',
        },
      },
      {
        path: 'stats',
        name: 'stats',
        component: () => import('@/views/StatsView.vue'),
        meta: {
          scene: 'home',
          title: 'Статистика сети — BMSTUDvach',
          description:
            'Телеметрия сети BMSTUDvach: сводка по разделам, тредам, сообщениям и вложениям и суточная серия активности за 7 или 30 дней.',
        },
      },
      {
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/views/NotFoundView.vue'),
        meta: {
          scene: 'error',
          title: 'Сигнал потерян — 404',
          description:
            'LOST NODE: узел не найден или отключён от сети BMSTUDvach — вернитесь в сеть и продолжайте поиск.',
        },
      },
    ],
  },
]

export function createAppRouter(
  history: RouterHistory = createWebHistory(import.meta.env.BASE_URL),
): Router {
  const router = createRouter({ history, routes })
  router.afterEach((to) => applyRouteMeta(to))
  return router
}

const router = createAppRouter()

export default router

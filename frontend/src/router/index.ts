import { createRouter, createWebHistory } from 'vue-router'

import DefaultLayout from '@/layouts/DefaultLayout.vue'
import type { SceneMode } from '@/three/sceneState'

declare module 'vue-router' {
  interface RouteMeta {
    /** Which visual mode the persistent 3D network scene should take. */
    scene?: SceneMode
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: DefaultLayout,
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/views/HomeView.vue'),
          meta: { scene: 'home' },
        },
        {
          path: 'boards/:boardSlug',
          name: 'board',
          component: () => import('@/views/BoardView.vue'),
          props: true,
          meta: { scene: 'board' },
        },
        {
          path: 'threads/:threadId(\\d+)',
          name: 'thread',
          component: () => import('@/views/ThreadView.vue'),
          props: true,
          meta: { scene: 'thread' },
        },
        {
          path: 'platinum',
          name: 'platinum',
          component: () => import('@/views/PlatinumView.vue'),
          meta: { scene: 'platinum' },
        },
        {
          path: 'about',
          name: 'about',
          component: () => import('@/views/AboutView.vue'),
          meta: { scene: 'home' },
        },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('@/views/NotFoundView.vue'),
          meta: { scene: 'error' },
        },
      ],
    },
  ],
})

export default router
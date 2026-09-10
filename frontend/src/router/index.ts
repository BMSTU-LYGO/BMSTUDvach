import { createRouter, createWebHistory } from 'vue-router'

import DefaultLayout from '@/layouts/DefaultLayout.vue'

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
        },
        {
          path: 'boards/:boardSlug',
          name: 'board',
          component: () => import('@/views/BoardView.vue'),
          props: true,
        },
        {
          path: 'threads/:threadId(\\d+)',
          name: 'thread',
          component: () => import('@/views/ThreadView.vue'),
          props: true,
        },
        {
          path: 'platinum',
          name: 'platinum',
          component: () => import('@/views/PlatinumView.vue'),
        },
        {
          path: 'about',
          name: 'about',
          component: () => import('@/views/AboutView.vue'),
        },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('@/views/NotFoundView.vue'),
        },
      ],
    },
  ],
})

export default router
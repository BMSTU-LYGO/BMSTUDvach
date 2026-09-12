import type { Router } from 'vue-router'

import { setSceneMode, type SceneMode } from '@/three/sceneState'

/**
 * Binds the router to the single 3D scene state: every navigation puts the
 * persistent NetworkCanvas into the matching mode (home / board / thread /
 * platinum / error). Warp playback is layered on top in a later step via
 * the optional onNavigate callback.
 */
export function useRouteScene(
  router: Router,
  onNavigate?: (fromMode: SceneMode, toMode: SceneMode) => void,
) {
  let current = router.currentRoute.value

  const apply = (to: typeof current) => {
    const mode = to.meta.scene
    switch (mode) {
      case 'board':
        setSceneMode('board', { boardSlug: String(to.params.boardSlug ?? '') })
        break
      case 'thread':
        setSceneMode('thread', { threadId: Number(to.params.threadId ?? 0) })
        break
      case 'platinum':
      case 'error':
        setSceneMode(mode)
        break
      default:
        setSceneMode('home')
    }
  }

  // Initial route (also covers direct page loads and refreshes).
  apply(current)

  router.beforeEach((to) => {
    onNavigate?.(current.meta.scene ?? 'home', to.meta.scene ?? 'home')
    return true
  })

  router.afterEach((to) => {
    current = to
    apply(to)
  })
}

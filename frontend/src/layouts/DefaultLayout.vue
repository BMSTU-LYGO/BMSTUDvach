<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import ScanLens from '@/components/scan/ScanLens.vue'
import AnnouncementBanner from '@/components/ui/AnnouncementBanner.vue'
import OfflineBadge from '@/components/ui/OfflineBadge.vue'
import SkipLink from '@/components/ui/SkipLink.vue'
import { useRouteScene } from '@/composables/useRouteScene'
import { usePwa } from '@/composables/usePwa'
import { sceneState } from '@/three/sceneState'
import { playTransition, initTransitionDirector } from '@/three/transitionDirector'

// The ambient particle layer (WebGL or Canvas2D) is pure decoration —
// load it after the app mounts so it never blocks the initial render.
const AmbientField = defineAsyncComponent(
  () => import('@/components/three/AmbientField.vue'),
)
const WarpCanvas = defineAsyncComponent(
  () => import('@/components/three/WarpCanvas.vue'),
)

initTransitionDirector({})

// P3-T5: on the thread route the dock owns a real gutter column (the reader
// grid in ThreadView). The content shell widens by the same gutter so the
// reading measure never pays for the dock.
const route = useRoute()
const isThreadReader = computed(() => route.name === 'thread')

// `beforeEach` fires while sceneState still describes the route we are
// leaving — exactly the shared element the trip starts from.
useRouteScene(useRouter(), (from, to) => {
  if (from !== to) {
    playTransition(from, to, {
      boardSlug: sceneState.boardSlug,
      threadId: sceneState.threadId,
    })
  }
})

// Global SCAN trigger (Cmd/Ctrl+K). The Signal Dock and any field own
// their own shortcuts — the scanner must not steal them.
const scanOpen = ref(false)

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.closest) return false
  return !!el.closest(
    'input, textarea, [contenteditable="true"], [data-testid="signal-dock"], [data-testid="launch-bay"], [data-testid="scan-lens"]',
  )
}

function onWindowKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    if (isTypingTarget(e.target)) return
    e.preventDefault()
    scanOpen.value = true
  }
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onUnmounted(() => window.removeEventListener('keydown', onWindowKeydown))

// PWA shell: the service worker is only registered from a production build.
const { online, register: registerPwa } = usePwa()
onMounted(() => void registerPwa())
</script>

<template>
  <div class="layout">
    <SkipLink />
    <AmbientField />
    <AppHeader @scan="scanOpen = true" />
    <AnnouncementBanner />
    <OfflineBadge :online="online" />
    <main
      id="main-content"
      class="content"
      :class="{ 'content--reader': isThreadReader }"
      tabindex="-1"
      aria-label="Основное содержимое"
    >
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    <AppFooter />
    <WarpCanvas />
    <ScanLens v-model:open="scanOpen" />
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--paper);
}

.content {
  flex: 1;
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-4);
  position: relative;
  z-index: 1;
}

/* P3-T5 — the thread reader: the dock gutter (ThreadView's grid) is added
   on top of the reading measure, so wide screens keep the posts as wide as
   they always were while the sheet lives in its own left column. Below the
   grid breakpoint the class is inert — the dock is a bottom bar again and
   the measure is the classic 1000px. */
@media (min-width: 1100px) {
  .content--reader {
    max-width: calc(1000px + clamp(440px, 34vw, 500px) + var(--dock-gap, var(--space-6)));
  }
}

.page-enter-active,
.page-leave-active {
  transition: opacity var(--duration-normal) var(--ease-out);
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }
}
</style>

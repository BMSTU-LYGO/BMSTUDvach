<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import ScanLens from '@/components/scan/ScanLens.vue'
import AnnouncementBanner from '@/components/ui/AnnouncementBanner.vue'
import OfflineBadge from '@/components/ui/OfflineBadge.vue'
import { useRouteScene } from '@/composables/useRouteScene'
import { usePwa } from '@/composables/usePwa'
import { playWarp, warpKindFor } from '@/three/warps'

// The ambient particle layer (WebGL or Canvas2D) is pure decoration —
// load it after the app mounts so it never blocks the initial render.
const AmbientField = defineAsyncComponent(
  () => import('@/components/three/AmbientField.vue'),
)
const WarpCanvas = defineAsyncComponent(
  () => import('@/components/three/WarpCanvas.vue'),
)

useRouteScene(useRouter(), (from, to) => {
  if (from !== to) playWarp(warpKindFor(from, to))
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
    <a href="#main-content" class="skip-link">Перейти к содержимому</a>
    <AmbientField />
    <AppHeader @scan="scanOpen = true" />
    <AnnouncementBanner />
    <OfflineBadge :online="online" />
    <main id="main-content" class="content">
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
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 10000;
  padding: var(--space-2) var(--space-4);
  background: var(--accent);
  color: oklch(0.1 0.01 260);
  font-weight: 700;
  text-decoration: none;
  border-radius: 0 0 var(--radius-md) 0;
}

.skip-link:focus {
  left: 0;
}

.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
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

/* Minimal veil: the WebGL route warp (WarpCanvas) carries the transition,
   the DOM only crossfades underneath it. */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.2s linear;
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

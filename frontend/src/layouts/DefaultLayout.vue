<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'

// The ambient particle layer (WebGL or Canvas2D) is pure decoration —
// load it after the app mounts so it never blocks the initial render.
const ParticleField = defineAsyncComponent(
  () => import('@/components/three/AmbientField.vue'),
)
</script>

<template>
  <div class="layout">
    <a href="#main-content" class="skip-link">Перейти к содержимому</a>
    <ParticleField :count="25" />
    <AppHeader />
    <main id="main-content" class="content">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    <AppFooter />
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

/* Page transition */
.page-enter-active {
  transition:
    opacity 0.3s var(--ease-out-quart),
    transform 0.3s var(--ease-out-quart);
}

.page-leave-active {
  transition:
    opacity 0.15s ease-in,
    transform 0.15s ease-in;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }
}
</style>

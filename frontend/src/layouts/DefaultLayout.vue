<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import ParticleField from '@/components/ui/ParticleField.vue'
</script>

<template>
  <div class="layout">
    <ParticleField :count="25" />
    <AppHeader />
    <main class="content">
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

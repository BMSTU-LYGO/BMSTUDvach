<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'

import ParticleField from '@/components/ui/ParticleField.vue'
import { useQuality3D } from '@/composables/useQuality3D'

// 3D particles render on a WebGL layer when enabled; the Canvas2D field is
// the fallback for quality=off (no-WebGL / reduced-motion / user choice).
const ParticleField3D = defineAsyncComponent(
  () => import('./ParticleField3D.vue'),
)

const { resolved } = useQuality3D()
const use3D = computed(() => resolved.value !== 'off')
</script>

<template>
  <ParticleField3D v-if="use3D" />
  <ParticleField v-else :count="25" />
</template>

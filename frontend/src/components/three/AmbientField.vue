<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'

import ParticleField from '@/components/ui/ParticleField.vue'
import { useQuality3D } from '@/composables/useQuality3D'

// The route-aware engineering network (WebGL) is the default ambient layer.
// When 3D quality is off (user choice, no WebGL, reduced-motion) we fall
// back to the dependency-free Canvas2D particle field.
const NetworkCanvas = defineAsyncComponent(() => import('./NetworkCanvas.vue'))

const { resolved } = useQuality3D()
const use3D = computed(() => resolved.value !== 'off')
</script>

<template>
  <NetworkCanvas v-if="use3D" />
  <ParticleField v-else :count="25" />
</template>

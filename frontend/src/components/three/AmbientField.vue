<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'

import ParticleField from '@/components/ui/ParticleField.vue'
import { useQuality3D } from '@/composables/useQuality3D'
import { sceneState } from '@/three/sceneState'

// The route-aware engineering network (WebGL) is the default ambient layer.
// When 3D quality is off (user choice, no WebGL, reduced-motion) we fall
// back to the dependency-free Canvas2D particle field.
const NetworkCanvas = defineAsyncComponent(() => import('./NetworkCanvas.vue'))

// The platinum route is not a mode of the network — it is a scene of its
// own (epoch rings, one plate per story). The WebGL budget is hard:
// `MAX_ACTIVE_CONTEXTS = 2` in `useThreeScene` is taken by the network and
// the warp overlay, so the archive has to occupy the slot of the network
// instead of living next to it. The `v-if` below unmounts the network
// canvas, and the unmount releases its context slot — that is what keeps a
// fast enter/leave of the archive free of dangling contexts.
const ArchiveSpaceCanvas = defineAsyncComponent(
  () => import('./ArchiveSpaceCanvas.vue'),
)

const { resolved } = useQuality3D()
const use3D = computed(() => resolved.value !== 'off')

// The router binds the route to the scene mode (`useRouteScene`): on the
// platinum routes the mode is 'platinum' and the archive takes the layer.
const isArchive = computed(() => sceneState.mode === 'platinum')
</script>

<template>
  <ArchiveSpaceCanvas v-if="use3D && isArchive" />
  <NetworkCanvas v-else-if="use3D" />
  <ParticleField v-else :count="25" />
</template>

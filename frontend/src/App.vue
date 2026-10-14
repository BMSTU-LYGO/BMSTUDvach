<script setup lang="ts">
import { useNavShortcuts } from '@/composables/useNavShortcuts'
import ShortcutsDialog from '@/components/ui/ShortcutsDialog.vue'

const { shortcutsOpen } = useNavShortcuts()
</script>

<template>
  <RouterView />
  <ShortcutsDialog v-model="shortcutsOpen" />
</template>

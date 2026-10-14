<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

defineEmits<{ scan: [] }>()
import { useForumStore } from '@/stores/forum'
import { useCRT } from '@/composables/useCRT'
import { useSound } from '@/composables/useSound'
import { useQuality3D } from '@/composables/useQuality3D'
import { syncBoards } from '@/three/sceneState'
import NetworkIcon from '@/components/composer/NetworkIcon.vue'
import { staffMe } from '@/api/moderation'

const store = useForumStore()
const mobileOpen = ref(false)

const { crtEnabled, toggleCRT } = useCRT()
const { soundEnabled, toggleSound } = useSound()
const { setting: quality3D, cycleSetting: cycle3D } = useQuality3D()

// Keep the 3D network graph in step with the board registry regardless of
// which page the boards list was first loaded on.
watch(
  () => store.boards.boards.map((b) => b.slug),
  (slugs) => syncBoards(slugs),
)

const QUALITY_LABELS: Record<string, string> = {
  auto: 'AUTO',
  high: 'HI',
  low: 'LO',
  off: 'OFF',
}
const QUALITY_HINTS: Record<string, string> = {
  auto: '3D: авто — по возможностям устройства. Клик: сменить режим.',
  high: '3D: высокое качество (полная детализация, до 2×DPR).',
  low: '3D: экономичный режим (меньше частиц и объектов).',
  off: '3D: выключено — работает 2D-версия частиц.',
}

const isStaff = ref(false)

onMounted(() => {
  void store.fetchBoards()
  // the console link only shows for staff sessions
  void staffMe().then((me) => {
    isStaff.value = me.is_staff
  }).catch(() => {})
})

function closeMobile() {
  mobileOpen.value = false
}
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <RouterLink to="/" class="brand" @click="closeMobile">
        <span class="brand-text">BMSTUDvach</span>
        <span class="brand-dot"></span>
      </RouterLink>

      <div class="header-right">
        <nav class="nav" :class="{ open: mobileOpen }" aria-label="Разделы">
          <RouterLink
            v-for="board in store.boards.boards"
            :key="board.slug"
            :to="`/boards/${board.slug}`"
            class="nav-link"
            @click="closeMobile"
          >
            /{{ board.slug }}/
          </RouterLink>
          <RouterLink to="/platinum" class="nav-link nav-accent" @click="closeMobile">
            /platinum/
          </RouterLink>
          <RouterLink to="/about" class="nav-link" @click="closeMobile">
            /about/
          </RouterLink>
          <RouterLink
            v-if="isStaff"
            to="/moderation"
            class="nav-link nav-accent"
            @click="closeMobile"
          >
            /mod/
          </RouterLink>
        </nav>

        <div class="fx-toggles">
          <button
            class="fx-toggle fx-toggle--scan"
            aria-label="Поиск по сети (Cmd/Ctrl+K)"
            title="Поиск по сети — Cmd/Ctrl+K"
            @click="$emit('scan')"
          >
            <NetworkIcon name="report" :size="14" />
            <span class="scan-label">Поиск</span>
          </button>
          <button
            class="fx-toggle"
            :class="{ active: quality3D !== 'off' }"
            :aria-label="QUALITY_HINTS[quality3D]"
            :title="QUALITY_HINTS[quality3D]"
            @click="cycle3D"
          >
            3D<span class="q-suffix">·{{ QUALITY_LABELS[quality3D] }}</span>
          </button>
          <button
            class="fx-toggle"
            :class="{ active: crtEnabled }"
            :aria-pressed="crtEnabled"
            title="CRT-эффекты (сканлайны, виньетка)"
            @click="toggleCRT"
          >
            CRT
          </button>
          <button
            class="fx-toggle fx-toggle--sound"
            :class="{ active: soundEnabled }"
            :aria-pressed="soundEnabled"
            :aria-label="soundEnabled ? 'Выключить звук' : 'Включить звук'"
            :title="soundEnabled ? 'Звук включён' : 'Звук выключен'"
            @click="toggleSound"
          >
            <NetworkIcon :name="soundEnabled ? 'sound' : 'mute'" :size="14" />
          </button>
        </div>

        <button
          class="mobile-toggle"
          :aria-expanded="mobileOpen"
          aria-label="Навигация"
          @click="mobileOpen = !mobileOpen"
        >
          <span class="hamburger" :class="{ open: mobileOpen }">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  background: var(--paper-raised);
  border-bottom: 1px solid var(--rule);
}

.header-inner {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-3) var(--space-4);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  text-decoration: none;
  flex-shrink: 0;
}

.brand-text {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--ink);
  line-height: 1;
}

.brand-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex: 1;
  min-width: 0;
}

.fx-toggles {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.fx-toggle {
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--ink-secondary);
  background: transparent;
  border: 1px solid var(--rule);
  border-radius: 0;
  padding: var(--space-1) var(--space-2);
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}

.fx-toggle:hover {
  color: var(--ink);
  background: var(--paper-sunken);
  border-color: var(--ink-tertiary);
}

.fx-toggle--scan {
  gap: 6px;
}

.fx-toggle--scan .scan-label {
  font-size: 0.8rem;
  font-weight: 500;
}

.fx-toggle--sound {
  position: relative;
  justify-content: center;
  min-width: 28px;
}

.fx-toggle--sound::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
}

.fx-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.fx-toggle.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--paper-sunken);
}

.nav {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.nav-link {
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ink-secondary);
  text-decoration: none;
  border-radius: 0;
  transition:
    color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}

.nav-link:hover {
  color: var(--ink);
  background: var(--paper-sunken);
}

.nav-link.router-link-active {
  color: var(--accent);
  background: var(--paper-sunken);
}

.nav-accent {
  color: var(--accent);
}

.mobile-toggle {
  display: none;
  background: none;
  border: none;
  padding: var(--space-2);
  cursor: pointer;
}

.hamburger {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 20px;
}

.hamburger span {
  display: block;
  height: 2px;
  background: var(--ink-secondary);
  border-radius: 1px;
  transition:
    transform var(--duration-normal) var(--ease-out),
    opacity var(--duration-fast);
}

.hamburger.open span:nth-child(1) {
  transform: rotate(45deg) translate(4px, 4px);
}
.hamburger.open span:nth-child(2) {
  opacity: 0;
}
.hamburger.open span:nth-child(3) {
  transform: rotate(-45deg) translate(4px, -4px);
}

@media (max-width: 767px) {
  .mobile-toggle {
    display: block;
  }

  .fx-toggles {
    margin-left: auto;
  }

  .fx-toggle .q-suffix {
    display: none;
  }

  .nav {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--paper-raised);
    border-bottom: 1px solid var(--rule);
    padding: var(--space-3);
    flex-direction: column;
    gap: var(--space-1);
  }

  .nav.open {
    display: flex;
  }

  .nav-link {
    width: 100%;
    padding: var(--space-2) var(--space-3);
  }
}
</style>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useForumStore } from '@/stores/forum'
import { useCRT } from '@/composables/useCRT'
import { useSound } from '@/composables/useSound'
import { useQuality3D } from '@/composables/useQuality3D'

const store = useForumStore()
const mobileOpen = ref(false)

const { crtEnabled, toggleCRT } = useCRT()
const { soundEnabled, toggleSound } = useSound()
const { setting: quality3D, cycleSetting: cycle3D } = useQuality3D()

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

onMounted(() => {
  void store.fetchBoards()
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
        </nav>

        <div class="fx-toggles">
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
            class="fx-toggle"
            :class="{ active: soundEnabled }"
            :aria-pressed="soundEnabled"
            :title="soundEnabled ? 'Звук включён' : 'Звук выключен'"
            @click="toggleSound"
          >
            {{ soundEnabled ? '♪' : '∅' }}
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
  background: var(--bg-raised);
  border-bottom: 1px solid var(--border-subtle);
  backdrop-filter: blur(12px);
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
  align-items: center;
  gap: var(--space-2);
  text-decoration: none;
  flex-shrink: 0;
}

.brand-text {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.brand-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
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
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart),
    background var(--duration-fast) var(--ease-out-quart),
    box-shadow var(--duration-fast) var(--ease-out-quart);
}

.fx-toggle:hover {
  color: var(--text-primary);
  border-color: var(--border-medium);
}

.fx-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.fx-toggle.active {
  color: var(--accent);
  border-color: var(--border-accent);
  background: var(--accent-glow);
  box-shadow: 0 0 10px var(--accent-glow);
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
  font-family: var(--font-display);
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-muted);
  text-decoration: none;
  border-radius: var(--radius-sm);
  transition:
    color var(--duration-fast) var(--ease-out-quart),
    background var(--duration-fast) var(--ease-out-quart);
}

.nav-link:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
}

.nav-link.router-link-active {
  color: var(--accent);
  background: var(--accent-glow);
}

.nav-accent {
  color: var(--accent-dim);
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
  background: var(--text-secondary);
  border-radius: 1px;
  transition:
    transform var(--duration-normal) var(--ease-out-quart),
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
    background: var(--bg-raised);
    border-bottom: 1px solid var(--border-subtle);
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

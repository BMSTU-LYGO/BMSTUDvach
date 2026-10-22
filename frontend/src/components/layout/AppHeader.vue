<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

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
  () => store.boards.boards,
  (boards) =>
    syncBoards(
      boards.map((b) => ({
        slug: b.slug,
        threadCount: b.thread_count,
        order: b.order,
        name: b.name,
        description: b.description,
      })),
    ),
  { deep: true },
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
  void staffMe()
    .then((me) => {
      isStaff.value = me.is_staff
    })
    .catch(() => {})
})

function closeMobile() {
  mobileOpen.value = false
}

/**
 * Разделы в навигации.
 *
 * Список приходит с сервера, поэтому он может быть пустым — и раньше шапка
 * тогда теряла половину ссылок и меняла высоту. Стор даёт состав меню по
 * данным, а ширина строки зарезервирована (см. `.nav`): пустой список
 * оставляет пустое место, а не перестраивает всю шапку.
 */
const sections = computed(() => store.boards.boards)
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <RouterLink to="/" class="brand" @click="closeMobile">
        <span class="brand-text">BMSTUDvach</span>
        <span class="brand-dot"></span>
      </RouterLink>

      <!-- Панель шапки. На широком экране её содержимое встаёт в ячейки
           сетки (имя — слева, эффекты — справа, разделы — строкой под ними);
           на узком — раскрывается списком под шапкой. -->
      <div id="header-panel" class="panel" :class="{ open: mobileOpen }">
        <nav class="nav" aria-label="Разделы">
          <RouterLink
            v-for="board in sections"
            :key="board.slug"
            :to="`/boards/${board.slug}`"
            class="nav-link motion-quiet react-ink"
            @click="closeMobile"
          >
            /{{ board.slug }}/
          </RouterLink>
          <RouterLink
            to="/platinum"
            class="nav-link motion-quiet react-ink nav-accent"
            @click="closeMobile"
          >
            /platinum/
          </RouterLink>
          <RouterLink
            to="/about"
            class="nav-link motion-quiet react-ink"
            @click="closeMobile"
          >
            /about/
          </RouterLink>
          <RouterLink
            v-if="isStaff"
            to="/moderation"
            class="nav-link motion-quiet react-ink nav-accent"
            @click="closeMobile"
          >
            /mod/
          </RouterLink>
        </nav>

        <div class="fx-toggles">
          <button
            class="fx-toggle react-press"
            :class="{ active: quality3D !== 'off' }"
            :aria-label="QUALITY_HINTS[quality3D]"
            :title="QUALITY_HINTS[quality3D]"
            @click="cycle3D"
          >
            3D<span class="q-suffix">·{{ QUALITY_LABELS[quality3D] }}</span>
          </button>
          <button
            class="fx-toggle react-press"
            :class="{ active: crtEnabled }"
            :aria-pressed="crtEnabled"
            title="CRT-эффекты (сканлайны, виньетка)"
            @click="toggleCRT"
          >
            CRT
          </button>
          <button
            class="fx-toggle fx-toggle--sound react-press"
            :class="{ active: soundEnabled }"
            :aria-pressed="soundEnabled"
            :aria-label="soundEnabled ? 'Выключить звук' : 'Включить звук'"
            :title="soundEnabled ? 'Звук включён' : 'Звук выключен'"
            @click="toggleSound"
          >
            <NetworkIcon :name="soundEnabled ? 'sound' : 'mute'" :size="16" />
          </button>
        </div>
      </div>

      <div class="header-controls">
        <button
          class="fx-toggle fx-toggle--scan react-press"
          aria-label="Поиск по сети (Cmd/Ctrl+K)"
          title="Поиск по сети — Cmd/Ctrl+K"
          @click="$emit('scan')"
        >
          <NetworkIcon name="report" :size="16" />
          <span class="scan-label">Поиск</span>
        </button>
        <button
          class="mobile-toggle"
          :aria-expanded="mobileOpen"
          aria-controls="header-panel"
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

/* Шапка стоит на той же колонке, что и текст страницы: тот же предел
   ширины (1000px) и те же поля. Глаз находит одну вертикаль, а не три. */
.header-inner {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  grid-template-areas:
    'brand .      controls fx'
    'nav   nav    nav     nav';
  align-items: center;
  column-gap: var(--space-2);
  row-gap: var(--space-2);
  max-width: 1000px;
  margin: 0 auto;
  padding: var(--space-3) var(--space-4);
}

/* На широком экране панель — не коробка, а содержимое сетки: её дети
   (список разделов и ряд эффектов) встают в свои ячейки. На узком экране
   панель становится выпадающим списком под шапкой. */
.panel {
  display: contents;
}

.brand {
  grid-area: brand;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  text-decoration: none;
  flex-shrink: 0;
  min-width: 0;
}

.brand-text {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--ink);
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.header-controls {
  grid-area: controls;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.fx-toggles {
  grid-area: fx;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* Кнопки шапки реагируют как бумага: тихий цвет на наведении и вмятина на
   нажатии. Наведение и нажатие — две роли на одном элементе, а `transition`
   не складывается, поэтому тайминги собраны вручную из motion.css. */
.fx-toggle {
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--ink-secondary);
  background: transparent;
  border: 1px solid var(--rule);
  border-radius: 0;
  padding: var(--space-1) var(--space-2);
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    color var(--motion-hover),
    background var(--motion-hover),
    border-color var(--motion-hover),
    box-shadow var(--motion-press),
    transform var(--motion-press);
}

.fx-toggle:hover {
  color: var(--ink);
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
  min-width: 32px;
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

/* Ряд разделов — тир под именем. Строка зарезервирована по высоте, поэтому
   пустой список (сервер недоступен) не перестраивает шапку. */
.nav {
  grid-area: nav;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
  min-height: 32px;
  padding-top: var(--space-1);
  border-top: 1px solid var(--rule);
}

/* Пункты навигации: тихая реакция — чернильная линия проявляется от левого
   края, а не заливка и не сдвиг. Тайминги даёт `motion-quiet`. */
.nav-link {
  padding: var(--space-1) var(--space-2);
  font-family: var(--font-body);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--ink-secondary);
  text-decoration: none;
  border-radius: 0;
}

.nav-link:hover {
  color: var(--ink);
}

.nav-link.router-link-active {
  color: var(--accent);
}

/* Линия идёт по ширине подписи, а не по всей кнопке. */
.nav-link::after {
  left: var(--space-2);
  right: var(--space-2);
}

/* Активный пункт держит линию на постоянной — это и есть его состояние. */
.nav-link.router-link-active::after {
  transform: scaleX(1);
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
  min-width: 44px;
  min-height: 44px;
}

.hamburger {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 20px;
  margin: 0 auto;
}

.hamburger span {
  display: block;
  height: 2px;
  background: var(--ink-secondary);
  border-radius: 1px;
  transition:
    transform var(--motion-press),
    opacity var(--motion-hover);
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
  /* Узкий экран: один ряд — имя, поиск и меню; разделы и эффекты
     раскрываются списком под шапкой. */
  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    position: relative;
    padding: var(--space-2) var(--space-4);
  }

  .panel {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: var(--paper-raised);
    border-bottom: 1px solid var(--rule);
    box-shadow: var(--shadow-md);
  }

  .panel.open {
    display: flex;
  }

  .mobile-toggle {
    display: block;
  }

  .fx-toggle .q-suffix {
    display: none;
  }

  .nav {
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    min-height: 0;
    padding-top: 0;
    border-top: none;
  }

  /* Палец попадает в строку: у пункта меню своя высота, а не только
     отступы вокруг текста. */
  .nav-link {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--rule);
  }

  .fx-toggles {
    justify-self: stretch;
    padding-top: var(--space-3);
    border-top: 1px solid var(--rule);
  }
}

/* Тач: палец не различает мелкие кнопки, поэтому на тач-экране
   минимальная цель — 44px. */
@media (pointer: coarse) {
  .fx-toggle {
    min-height: 44px;
  }

  .fx-toggle--sound {
    min-width: 44px;
  }

  .brand {
    min-height: 44px;
  }
}

@media (max-width: 767px) {
  .brand-text {
    font-size: 1.25rem;
  }

  .fx-toggle--scan .scan-label {
    display: none;
  }
}
</style>

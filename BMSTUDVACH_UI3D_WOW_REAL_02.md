# BMSTUDvach — UI 3D WOW REAL — Phase 02

## 0. Цель

Довести UI до уровня «wow» — когда человек открывает форум и думает «это не просто
форум, это experiência». Каждый экран должен вызывать желание скроллить, кликать,
изучать. 3D-эффекты должны быть осмысленными, а не декоративными.

---

## 1. Философия второго прохода

Первый проход заложил тёмную тему, токены и базовые анимации. Второй проход — про
**глубину**, **интерактивность** и **атмосферу**:

- Каждый элемент реагирует на курсор
- Пространство имеет физическую глубину (ближе/дальше)
- Переходы между страницами — как перемещение в пространстве
- Текст — как интерфейс терминала, а не просто буквы
- Частицы — живые, реагируют на мышь

---

## 2. Блоки реализации

### 2.1. WOW-01: Hero — 3D Perspective Grid

**Что:**
Главная страница получает полноценный hero-блок:

```
┌─────────────────────────────────────────────┐
│                                             │
│          BMSTUDvach  ← glitch-текст         │
│          Форум МГТУ  ← typing-анимация      │
│                                             │
│     ╔═══╗   ╔═══╗   ╔═══╗   ╔═══╗          │
│     ║ b ║   ║   ║   ║   ║   ║   ║          │
│     ╚═══╝   ╚═══╝   ╚═══╝   ╚═══╝          │
│        перспективная сетка карточек          │
│                                             │
└─────────────────────────────────────────────┘
```

- CSS `perspective: 1200px` на hero-контейнере
- Board-карточки расположены в 3D-пространстве (rotateX/Y)
- При скролле — сетка «уходит вдаль» (translateZ через ScrollTrigger)
- Glitch-эффект на тексте «BMSTUDvach» (CSS clip-path анимация)
- Scanline-оверлей (полупрозрачные горизонтальные линии)

**Файлы:**
- `views/HomeView.vue` — rewrite hero section
- `components/ui/ScanlineOverlay.vue` — NEW
- `components/ui/GlitchText.vue` — NEW (заменяет TypewriterText на hero)

**Коммит:** `WOW-01: add 3D perspective grid hero with glitch text`

---

### 2.2. WOW-02: Interactive Particle System v2

**Что:**
Переработка ParticleField:

- Частицы соединяются линиями при proximity (distance < threshold)
- Реагируют на курсор: притяжение/отталкивание
- Canvas2D → WebGL (Three.js Points или чистый WebGL) для производительности
- Fallback на Canvas2D если WebGL недоступен
- Цвет частиц зависит от позиции курсора (hue shift)

**Архитектура:**
```
components/ui/ParticleField.vue — обёртка, выбирает renderer
composables/useParticleWebGL.ts — WebGL renderer (NEW)
composables/useParticleCanvas.ts — Canvas2D fallback (NEW)
```

**Производительность:**
- WebGL: 200+ частиц при 60fps
- Canvas2D: 50+ частиц
- Mobile: reduce count by 50%

**Коммит:** `WOW-02: upgrade particle system with proximity lines and mouse reactivity`

---

### 2.3. WOW-03: 3D Board Cards — Real Depth

**Что:**
Board-карточки на главной получают настоящий 3D-эффект:

- Каждая карточка — `transform: perspective(800px) rotateX(Y)`
- При hover — карточка «поднимается» (translateZ) + увеличение тени
- Glow-подсветка следует за курсором (радиальный градиент)
- Stagger-анимация появления: карточки «вылетают» из глубины
- Иконки/эмодзи для каждого раздела (генеративные на основе slug)

**Компонент:**
```
components/ui/BoardCard3D.vue — NEW
  - props: board, index
  - useTilt composable
  - CSS perspective + translateZ
  - GlowBorder integration
```

**Коммит:** `WOW-03: add 3D board cards with depth hover effects`

---

### 2.4. WOW-04: Thread View — Cinematic Posts

**Что:**
Thread-страница становится кинематографичной:

- OP-пост: полноэкранная карточка с parallax-фоном
- Reply-посты: появляются с stagger (каждый следующий чуть позже)
- Линии связи между постами (SVG линия от reply к quoted post)
- Hover на посте — подсветка связанных постов
- Generative avatars: SVG-паттерн на основе fingerprint hash
  - Геометрические формы (круги, линии, точки)
  - Уникальная цветовая палитра для каждого пользователя
  - Генерация через Canvas → data URL

**Архитектура:**
```
components/forum/PostItem.vue — rewrite с3D-эффектами
components/forum/GenerativeAvatar.vue — NEW
components/ui/ConnectionLine.vue — NEW (SVG связи)
composables/usePostReveal.ts — NEW (GSAP stagger reveal)
```

**Коммит:** `WOW-04: add cinematic post reveals and generative avatars`

---

### 2.5. WOW-05: Scroll-Driven Parallax Layers

**Что:**
Глубина через параллакс-слои при скролле:

```
┌─ z-index: 0 ─── ParticleField (медленный, дальний слой)
├─ z-index: 1 ─── Grid pattern (средний слой)
├─ z-index: 2 ─── Content (основной слой)
└─ z-index: 3 ─── Glow effects (ближний слой)
```

- Каждый слой движется с разной скоростью
- `transform: translateZ()` + `scale()` для создания глубины
- ScrollTrigger для управления parallax
- Grid pattern: CSS `background-image` с тонкой сеткой (инженерная эстетика)

**Компонент:**
```
components/ui/ParallaxLayer.vue — NEW
  - props: speed (0.1-1.0), zOffset
  - ScrollTrigger integration
components/ui/GridPattern.vue — NEW
  - CSS grid background
  - Parallax integration
```

**Коммит:** `WOW-05: add scroll-driven parallax depth layers`

---

### 2.6. WOW-06: CRT / Terminal Effects

**Что:**
Атмосфера инженерного терминала:

- Scanline overlay: полупрозрачные горизонтальные линии
- Subtle flicker: микро-мерцание (opacity 0.98-1.0)
- Chromatic aberration на hover: RGB-сдвиг на тексте
- Phosphor glow: текст слегка светится
- Vignette: затемнение по краям экрана

**Реализация:**
- CSS `mix-blend-mode` для chromatic aberration
- CSS `background: repeating-linear-gradient` для scanlines
- `animation: flicker` с random keyframes
- `box-shadow: inset` для vignette

**Переключатель:**
```ts
// composables/useCRT.ts
const crtEnabled = ref(true) // можно отключить в настройках
```

**Коммит:** `WOW-06: add CRT terminal effects (scanlines, flicker, vignette)`

---

### 2.7. WOW-07: Magnetic Buttons & Ripple Effects

**Что:**
Интерактивные кнопки:

- **Magnetic effect**: кнопка «притягивается» к курсору при приближении
  - `transform: translate()` на основе расстояния до курсора
  - Радиус притяжения: 100px
- **Ripple effect**: круговая волна при клике
  - CSS `@keyframes ripple` + `overflow: hidden`
  - Позиция ripple = точка клика
- **Glow pulse**: акцентные кнопки пульсируют

**Компонент:**
```
components/ui/MagneticButton.vue — NEW
  - props: strength (0.1-1.0), ripple (boolean)
  - useMouseProximity composable
```

**Коммит:** `WOW-07: add magnetic buttons with ripple effects`

---

### 2.8. WOW-08: Page Transitions — Morphing Elements

**Что:**
Переходы между страницами — не просто fade, а морфинг:

- При клике на board-карточку → карточка «разворачивается» в страницу раздела
- Заголовок раздела «вырастает» из карточки
- Thread title «выезжает» из строки списка
- GSAP Flip plugin для морфинга между состояниями

**Архитектура:**
```
composables/usePageMorph.ts — NEW
  - GSAP Flip integration
  - Element tracking between routes
layouts/DefaultLayout.vue — rewrite transitions
```

**Ограничения:**
- Flip требует одинаковые элементы в DOM до и после
- На mobile — упрощённый fade (flip тяжёлый)
- `prefers-reduced-motion` → мгновенный переход

**Коммит:** `WOW-08: add morphing page transitions with GSAP Flip`

---

### 2.9. WOW-09: Generative Board Icons

**Что:**
Каждый раздел получает уникальную генеративную иконку:

- Алгоритм: hash(slug) → seed → геометрический паттерн
- Паттерн: пересекающиеся линии, круги, точки
- Цвета: из акцентной палитры с вариациями
- Canvas → SVG → inline component
- Анимация: паттерн «рисуется» при hover (SVG stroke-dasharray)

**Компонент:**
```
components/ui/GenerativeIcon.vue — NEW
  - props: seed (string), size (number)
  - Canvas generation → SVG output
  - Hover animation (stroke drawing)
```

**Коммит:** `WOW-09: add generative board icons`

---

### 2.10. WOW-10: Ambient Sound (Optional)

**Что:**
Опциональные звуковые эффекты:

- Hover на карточке — мягкий «click»
- Отправка поста — «whoosh»
- Ошибка — «buzz»
- Toggle в header (выключен по умолчанию)

**Реализация:**
- Web Audio API
- Short audio samples (< 10KB each)
- `composables/useSound.ts`
- Не загружать если `prefers-reduced-motion` или `prefers-reduced-transparency`

**Коммит:** `WOW-10: add optional ambient sound effects`

---

### 2.11. WOW-11: Performance & WebGL Optimization

**Что:**
- ParticleField → WebGL renderer (Three.js Points или raw WebGL)
- `requestAnimationFrame` throttle для mouse events
- `will-change` только на анимируемые элементы
- Lazy load GSAP plugins (dynamic import)
- Image lazy loading для attachments
- IntersectionObserver для off-screen animations
- Bundle analysis: target < 100KB gzipped (без шрифтов)

**Коммит:** `WOW-11: optimize performance and add WebGL renderer`

---

### 2.12. WOW-12: Polish & Accessibility

**Что:**
- Все3D-эффекты отключаются при `prefers-reduced-motion: reduce`
- Фокус-видимость на всех интерактивных элементах
- ARIA-атрибуты на кастомных компонентах
- Skip-to-content link
- Keyboard navigation для модальных окон
- Contrast check: все тексты ≥ 4.5:1
- Mobile: отключить тяжёлые эффекты (particles, tilt, flip)
- Lighthouse audit: Performance ≥ 85, Accessibility ≥ 95

**Коммит:** `WOW-12: final polish and accessibility audit`

---

## 3. Новые зависимости

```json
{
  "dependencies": {
    "gsap": "^3.12.5"  // уже установлен
  }
}
```

Three.js НЕ нужен — WebGL через чистый Canvas API для частиц.
GSAP Flip входит в gsap (нужен registerPlugin).

---

## 4. Порядок коммитов

| # | Коммит | Риск | Сложность |
|---|---|---|---|
| WOW-01 | `add 3D perspective grid hero with glitch text` | Low | Medium |
| WOW-02 | `upgrade particle system with proximity lines` | High | High |
| WOW-03 | `add 3D board cards with depth hover effects` | Low | Medium |
| WOW-04 | `add cinematic post reveals and generative avatars` | Medium | High |
| WOW-05 | `add scroll-driven parallax depth layers` | Medium | Medium |
| WOW-06 | `add CRT terminal effects` | Low | Low |
| WOW-07 | `add magnetic buttons with ripple effects` | Low | Low |
| WOW-08 | `add morphing page transitions with GSAP Flip` | High | High |
| WOW-09 | `add generative board icons` | Low | Medium |
| WOW-10 | `add optional ambient sound effects` | Medium | Medium |
| WOW-11 | `optimize performance and add WebGL renderer` | High | High |
| WOW-12 | `final polish and accessibility audit` | Low | Low |

---

## 5. Файловая структура (новые/изменённые)

```
frontend/src/
├── components/
│   ├── ui/
│   │   ├── GlitchText.vue          # NEW
│   │   ├── ScanlineOverlay.vue     # NEW
│   │   ├── BoardCard3D.vue         # NEW
│   │   ├── MagneticButton.vue      # NEW
│   │   ├── GenerativeIcon.vue      # NEW
│   │   ├── ParallaxLayer.vue       # NEW
│   │   ├── GridPattern.vue         # NEW
│   │   ├── ConnectionLine.vue      # NEW
│   │   ├── ParticleField.vue       # REWRITE
│   │   ├── GlowBorder.vue          # ENHANCE
│   │   └── DepthCard.vue           # ENHANCE
│   └── forum/
│       ├── GenerativeAvatar.vue    # NEW
│       └── PostItem.vue            # NEW (replaces inline post markup)
├── composables/
│   ├── useParticleWebGL.ts         # NEW
│   ├── useParticleCanvas.ts        # NEW
│   ├── usePageMorph.ts             # NEW
│   ├── usePostReveal.ts            # NEW
│   ├── useCRT.ts                   # NEW
│   ├── useSound.ts                 # NEW
│   ├── useMouseProximity.ts        # NEW
│   └── useGsap.ts                  # ENHANCE (add Flip plugin)
├── views/
│   ├── HomeView.vue                # REWRITE
│   ├── BoardView.vue               # ENHANCE
│   └── ThreadView.vue              # REWRITE
└── assets/
    └── sounds/                     # NEW (optional audio files)
```

---

## 6. Definition of Done

- [ ] Hero: 3D perspective grid с glitch-текстом работает плавно
- [ ] Particles: proximity lines + mouse reactivity на Canvas/WebGL
- [ ] Board cards: настоящий 3D hover с глубиной
- [ ] Posts: stagger reveal + generative avatars
- [ ] Parallax: многослойная глубина при скролле
- [ ] CRT-эффекты: scanlines, flicker, vignette (с toggle)
- [ ] Buttons: magnetic + ripple на primary actions
- [ ] Page transitions: morphing между маршрутами
- [ ] Generative icons: уникальные для каждого раздела
- [ ] Sound: опциональные hover/click звуки
- [ ] Performance: 60fps на desktop, 30fps на mobile
- [ ] `prefers-reduced-motion` отключает ВСЕ эффекты
- [ ] Mobile: тяжёлые эффекты отключены автоматически
- [ ] Lighthouse: Performance ≥ 85, Accessibility ≥ 95
- [ ] `npm run build` без ошибок
- [ ] `npm run lint` без предупреждений
- [ ] Существующие API-интеграции работают без изменений

---

## 7. Технические риски

| Риск | Митигация |
|---|---|
| WebGL не поддерживается | Canvas2D fallback |
| GSAP Flip сложен в интеграции | Начать с простых morphs, расширять |
| Sound раздражает пользователей | Выключен по умолчанию, toggle |
| Performance на mobile | UA detection + reduce effects |
| Bundle size растёт | Dynamic imports, tree-shaking |
| 3D effects вызывают motion sickness | prefers-reduced-motion + toggle |

---

## 8. Что НЕ делать

- Не добавлять Three.js / Babylon.js — слишком тяжело
- Не делать full-screen 3D-сцену — это форум, не презентация
- Не включать звук по умолчанию
- Не применять heavy effects на mobile
- Не менять API-слой, типы, store
- Не копировать конкретные сайты
- Не добавлять анимации ради анимаций

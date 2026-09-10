# BMSTUDvach — UI/3D Redesign Plan

## 0. Цель

Превратить текущий минималистичный форум в визуально уникальный, атмосферный интерфейс с
3D-эффектами и микроанимациями, который передаёт дух МГТУ — инженерная школа, техническая
эстетика, строгая геометрия. При этом сохранить всю существующую логику API, роутинг и
архитектуру Vue-приложения.

---

## 1. Концепция дизайна

### 1.1. Физическая сцена

Студент МГТУ поздно вечером в общежитии или библиотеке, экран ноутбука — единственный
источник света. Форум — тёмный, с глубиной, как интерфейс инженерного терминала. Тёплые
акценты (янтарь / оранжевый) на холодном тёмном фоне — как подсветка приборной панели.

### 1.2. Цветовая стратегия

Тёмная тема, committed — один насыщенный цвет несёт 30–40% поверхности. Палитра на базе
OKLCH:

| Token | OKLCH | Hex (approx) | Назначение |
|---|---|---|---|
| `--bg-deep` | `0.10 0.01 260` | `#0d0f14` | Фон страницы |
| `--bg-surface` | `0.14 0.012 260` | `#161922` | Карточки, панели |
| `--bg-raised` | `0.18 0.015 260` | `#1e2230` | Хедер, модалки |
| `--border-subtle` | `0.25 0.02 260` | `#2d3348` | Разделители |
| `--text-primary` | `0.90 0.01 80` | `#e8e0d0` | Основной текст |
| `--text-muted` | `0.60 0.02 260` | `#7a8098` | Вторичный текст |
| `--accent` | `0.72 0.16 65` | `#d4882a` | Акцент (янтарь) |
| `--accent-glow` | `0.72 0.16 65 / 0.3` | `#d4882a4d` | Свечение акцента |
| `--danger` | `0.55 0.20 25` | `#c43a3a` | Ошибки, жалобы |
| `--success` | `0.65 0.18 155` | `#3aaa6a` | Успех |

### 1.3. Типографика

Шрифты (Google Fonts):
- **Display / headings**: `JetBrains Mono` — моноширинный, инженерная эстетика
- **Body**: `Inter` — чистый sans-serif, хорошая читаемость

Иерархия:
- H1: `clamp(2rem, 4vw, 3rem)` / weight 700 / letter-spacing -0.02em
- H2: `clamp(1.5rem, 3vw, 2rem)` / weight 700
- H3: `1.25rem` / weight 600
- Body: `1rem` / weight 400 / line-height 1.6
- Caption/meta: `0.8rem` / weight 500 / text-transform uppercase / letter-spacing 0.08em

### 1.4. 3D-подход

Не «3D-модели на сцене», а глубина через:
- Parallax-слои при скролле
- TranslateZ + perspective на карточках
- Плавные entrance-анимации с «вылетом из глубины»
- Hover-эффекты с tilt/rotate (CSS perspective + JS mouse tracking)
- Floating-элементы с лёгким дрейфом
- Glow-подсветка на интерактивных элементах

---

## 2. Новые зависимости

### 2.1. NPM (frontend)

```json
{
  "dependencies": {
    "gsap": "^3.12.5"
  },
  "devDependencies": {
    "@fontsource/inter": "^5.0.0",
    "@fontsource/jetbrains-mono": "^5.0.0"
  }
}
```

GSAP — для ScrollTrigger, параллакса, tilt-эффектов, timeline-анимаций.
Шрифты — self-hosted через fontsource (без Google CDN).

### 2.2. Backend

Никаких новых зависимостей. Дизайн — чисто frontend.

---

## 3. Структура файлов (новые / изменённые)

```
frontend/src/
├── assets/
│   ├── main.css              # ← ПОЛНАЯ ЗАМЕНА: CSS custom properties + reset
│   ├── fonts.css              # NEW: @font-face declarations
│   └── animations.css         # NEW: keyframes, transition utilities
├── composables/
│   ├── useParallax.ts         # NEW: mouse-tracking parallax
│   ├── useScrollReveal.ts     # NEW: GSAP ScrollTrigger wrapper
│   └── useTilt.ts             # NEW: 3D tilt on hover
├── components/
│   ├── ui/
│   │   ├── GlowBorder.vue     # NEW: animated glow border wrapper
│   │   ├── ParticleField.vue  # NEW: floating particles background
│   │   ├── TypewriterText.vue # NEW: typewriter animation for headings
│   │   └── DepthCard.vue      # NEW: card with perspective + tilt
│   ├── layout/
│   │   ├── AppHeader.vue      # NEW: replaces DefaultLayout header
│   │   ├── AppFooter.vue      # NEW: footer component
│   │   └── SideNav.vue        # NEW: collapsible board navigation
│   ├── forum/
│   │   ├── BoardCard.vue      # NEW: replaces BoardList items
│   │   ├── ThreadRow.vue      # NEW: replaces ThreadCard
│   │   ├── PostItem.vue       # NEW: replaces PostCard
│   │   ├── ReplyComposer.vue  # NEW: replaces CreatePostForm
│   │   └── ThreadComposer.vue # NEW: replaces CreateThreadForm
│   └── (existing state components kept: LoadingState, ErrorState, EmptyState)
├── layouts/
│   └── DefaultLayout.vue      # ← ПОЛНАЯ ЗАМЕНА
├── views/
│   ├── HomeView.vue           # ← ПОЛНАЯ ЗАМЕНА
│   ├── BoardView.vue          # ← ПОЛНАЯ ЗАМЕНА
│   ├── ThreadView.vue         # ← ПОЛНАЯ ЗАМЕНА
│   ├── PlatinumView.vue       # ← ПОЛНАЯ ЗАМЕНА
│   ├── AboutView.vue          # ← ПОЛНАЯ ЗАМЕНА
│   └── NotFoundView.vue       # ← ПОЛНАЯ ЗАМЕНА
└── stores/
    └── forum.ts               # БЕЗ ИЗМЕНЕНИЙ (API layer untouched)
```

---

## 4. Блоки реализации

### 4.1. UI-01: Design Tokens & Foundation

**Что:**
- Замена `main.css` на систему CSS custom properties (все токены выше)
- Добавление `fonts.css` с @font-face для Inter и JetBrains Mono
- CSS reset (modern normalize)
- Базовые utility-классы: `.text-muted`, `.glow`, `.depth-1/2/3`
- `@media (prefers-reduced-motion: reduce)` — отключение всех анимаций

**Коммит:** `UI-01: add design tokens and foundation styles`

---

### 4.2. UI-02: Composables & Motion Utilities

**Что:**
- `useParallax.ts` — отслеживание мыши, возвращает `{ x, y }` для transform
- `useScrollReveal.ts` — обёртка над GSAP ScrollTrigger, fadeIn + translateY
- `useTilt.ts` — 3D-наклон карточки при hover (perspective + rotateX/Y)
- `animations.css` — keyframes: `fadeInUp`, `glowPulse`, `float`, `slideIn`
- Utility-классы: `.reveal`, `.tilt`, `.float`

**Зависимости:** `npm install gsap`

**Коммит:** `UI-02: add composables and GSAP motion utilities`

---

### 4.3. UI-03: UI Primitives (новые компоненты)

**Что:**

`GlowBorder.vue` — обёртка с анимированной подсветкой border при hover:
```vue
<!-- Usage: <GlowBorder color="accent"><div>...</div></GlowBorder> -->
```
Реализация: CSS `box-shadow` с transition + mouse-tracking для направления свечения.

`ParticleField.vue` — фон с floating частицами (GSAP timeline, requestAnimationFrame):
```vue
<!-- Usage: <ParticleField :count="30" /> -->
```
Canvas или DOM-элементы с абсолютным позиционированием. Лёгкие, не мешают кликам.

`TypewriterText.vue` — анимация набора текста для заголовков:
```vue
<!-- Usage: <TypewriterText text="BMSTUDvach" /> -->
```
GSAP timeline с посимвольным появлением + мигающий курсор.

`DepthCard.vue` — карточка с 3D-перспективой:
```vue
<!-- Usage: <DepthCard :depth="1">content</DepthCard> -->
```
CSS `transform: perspective(800px) rotateX/Y` + тень, зависящая от наклона.

**Коммит:** `UI-03: add UI primitive components`

---

### 4.4. UI-04: Layout Redesign

**Что:**

`AppHeader.vue`:
- Тёмная панель (`--bg-raised`)
- Логотип BMSTUDvach с TypewriterText анимацией при первом показе
- Навигация по разделам с hover-underline эффектом (GSAP)
- Мобильное меню (hamburger → slide-in panel)
- Glow-подсветка активного раздела

`AppFooter.vue`:
- Минималистичный, `--text-muted`
- Ссылки: о проекте, github (placeholder)

`SideNav.vue` (опционально):
- Для широких экранов: фиксированная боковая навигация по разделам
- Collapsible, remembers state

`DefaultLayout.vue`:
- Собирает Header + SideNav + content + Footer
- ParticleField как фоновый слой (z-index: -1)
- Content area с `perspective` для 3D-эффектов дочерних элементов

**Коммит:** `UI-04: redesign layout with header, footer, and navigation`

---

### 4.5. UI-05: Home Page Redesign

**Что:**
- Hero-секция с TypewriterText «BMSTUDvach» + подзаголовок
- ParticleField на фоне
- BoardCard — вместо плоских карточек:
  - DepthCard с tilt-эффектом
  - GlowBorder при hover
  - Slug — крупный, моноширинный, с `--accent` цветом
  - Анимация появления: staggered fadeInUp при скролле (ScrollTrigger)
- Кнопка «Все разделы» если разделов > 6

**Коммит:** `UI-05: redesign home page with 3D board cards`

---

### 4.6. UI-06: Board Page Redesign

**Что:**
- Заголовок раздела `/b/` — крупный, моноширинный, с glow-эффектом
- ThreadRow (заменяет ThreadCard):
  - Горизонтальная строка с depth-эффектом при hover
  - Reply count badge с accent-glow
  - Pinned indicator — amber glow icon
  - Locked indicator — muted
  - Staggered entrance анимация
- ThreadComposer (заменяет CreateThreadForm):
  - Expandable panel (collapsed → expanded с GSAP height animation)
  - GlowBorder на focused state
  - Drag-and-drop zone для attachments

**Коммит:** `UI-06: redesign board page with depth thread rows`

---

### 4.7. UI-07: Thread Page Redesign

**Что:**
- Заголовок треда — с breadcrumb-навигацией (board → thread)
- PostItem (заменяет PostCard):
  - OP-пост: accent border-left (1px, не запрещённый side-stripe т.к. это 1px), выделен фоном
  - Reply-посты: чередующийся фон `--bg-surface` / `--bg-raised`
  - Hover: лёгкий translateX + glow на всю строку
  - Timestamp — relative time («5 мин назад»)
  - Аватар: геометрический паттерн на основе хеша fingerprint (unique per anon)
- ReplyComposer:
  - Sticky внизу экрана на мобильных
  - Textarea с auto-resize
  - Кнопка отправки с glow-эффектом
  - Drag-and-drop attachments

**Коммит:** `UI-07: redesign thread page with post items`

---

### 4.8. UI-08: Platinum & About Pages

**Что:**
- PlatinumView:
  - Hero-секция с ParticleField
  - «Скоро» — анимированный текст с glow
  - Placeholder для будущих platinum stories
- AboutView:
  - Информация о проекте в DepthCard
  - Анимированная timeline (GSAP ScrollTrigger)

**Коммит:** `UI-08: redesign platinum and about pages`

---

### 4.9. UI-09: Report Dialog & Forms Polish

**Что:**
- ReportDialog: переработка в модальное окно с backdrop-blur
- Анимация появления: scale + fadeIn
- Формы: единый стиль полей (тёмный фон, glow при focus)
- Валидация: inline-ошибки с shake-анимацией
- Toast-уведомления вместо текстовых «Жалоба отправлена»

**Коммит:** `UI-09: polish forms and dialog styling`

---

### 4.10. UI-10: Responsive & Accessibility

**Что:**
- Mobile-first responsive breakpoints:
  - `sm`: 640px
  - `md`: 768px
  - `lg`: 1024px
- Mobile: single column, hamburger menu, full-width cards
- Tablet: 2-column board grid
- Desktop: side nav + content
- `prefers-reduced-motion`: отключает все GSAP анимации, оставляет мгновенные переходы
- `prefers-color-scheme: light` — можно добавить позже, пока только dark
- Focus-visible стили для клавиатурной навигации
- ARIA-атрибуты на всех интерактивных элементах

**Коммит:** `UI-10: add responsive design and accessibility`

---

### 4.11. UI-11: 404 Page & Error States

**Что:**
- NotFoundView: анимированная 404 с glitch-эффектом на тексте
- ErrorState: переработка с иконкой и анимацией
- EmptyState: анимированная иллюстрация (CSS-only или SVG)
- LoadingState: пульсирующий glow вместо spinner

**Коммит:** `UI-11: redesign error and empty states`

---

### 4.12. UI-12: Final Polish & Performance

**Что:**
- Проверка Lighthouse scores (цель: Performance ≥ 90, Accessibility ≥ 95)
- Lazy-loading для ParticleField и GSAP (dynamic import)
- `will-change` только на анимируемые элементы
- Проверка всех hover/focus/active состояний
- Финальный проход по цветам — проверка контраста (4.5:1 body text)
- Удаление неиспользуемых старых компонентов (BoardList, ThreadCard, PostCard и т.д.)

**Коммит:** `UI-12: final polish and performance audit`

---

## 5. Архитектурные решения

### 5.1. GSAP — глобальная инициализация

```ts
// composables/useGsap.ts
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }
```

Один `registerPlugin` в приложении, dynamic import для code-splitting.

### 5.2. CSS Custom Properties вместо SCSS

Все токены в `:root {}` в `main.css`. Компоненты используют `var(--token)`.
Нет препроцессоров — чистый CSS + scoped `<style>` в Vue SFC.

### 5.3. Анимации — progressive enhancement

Все анимации обёрнуты в проверку:
```css
@media (prefers-reduced-motion: no-preference) {
  .reveal { animation: fadeInUp 0.6s ease-out both; }
}
```

Или в composables:
```ts
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
if (!prefersReducedMotion) { /* GSAP анимации */ }
```

### 5.4. API-слой нетронут

`stores/forum.ts`, `api/client.ts`, `api/*.ts` — НЕ ИЗМЕНЯЮТСЯ. Все API-вызовы,
форматы данных, типы — остаются как есть. Редизайн затрагивает только presentation layer.

---

## 6. Порядок коммитов

| # | Коммит | Описание |
|---|---|---|
| UI-01 | `add design tokens and foundation styles` | CSS tokens, fonts, reset |
| UI-02 | `add composables and GSAP motion utilities` | Composables + GSAP setup |
| UI-03 | `add UI primitive components` | GlowBorder, ParticleField, etc. |
| UI-04 | `redesign layout with header, footer, and navigation` | Layout components |
| UI-05 | `redesign home page with 3D board cards` | HomeView |
| UI-06 | `redesign board page with depth thread rows` | BoardView |
| UI-07 | `redesign thread page with post items` | ThreadView |
| UI-08 | `redesign platinum and about pages` | PlatinumView, AboutView |
| UI-09 | `polish forms and dialog styling` | ReportDialog, forms |
| UI-10 | `add responsive design and accessibility` | Responsive + a11y |
| UI-11 | `redesign error and empty states` | 404, error, empty |
| UI-12 | `final polish and performance audit` | Cleanup + perf |

---

## 7. Definition of Done

Редизайн считается завершённым, если:

- [ ] Все существующие API-интеграции работают без изменений
- [ ] Тёмная тема с заданной палитрой OKLCH применена ко всем страницам
- [ ] GSAP анимации работают на десктопе и мобильных
- [ ] `prefers-reduced-motion: reduce` отключает все анимации
- [ ] 3D-эффекты (tilt, parallax, depth) работают плавно (60fps)
- [ ] Typography: JetBrains Mono для заголовков, Inter для текста
- [ ] Responsive: корректно на 320px–2560px
- [ ] Контраст текста ≥ 4.5:1 (проверено)
- [ ] Все старые компоненты удалены, дубликатов нет
- [ ] `npm run build` без ошибок
- [ ] `npm run lint` без предупреждений
- [ ] Lighthouse: Performance ≥ 90, Accessibility ≥ 95
- [ ] Фронтенд запускается через `make up` без дополнительных команд

---

## 8. Что НЕ делать

- Не добавлять Three.js / WebGL — слишком тяжело для форума
- Не делать full-page 3D-сцены — это инструмент, не презентация
- Не менять API-слой, типы, store, роутинг
- Не добавлять light theme на этом этапе
- Не использовать Tailwind / UnoCSS — чистый CSS с custom properties
- Не копировать конкретные дизайны других сайтов
- Не добавлять анимации ради анимаций — каждая должна нести смысл

---

## 9. Технические риски

| Риск | Митигация |
|---|---|
| GSAP bundle size (~45KB gzip) | Dynamic import, tree-shake plugins |
| ParticleField performance на слабых устройствах | Reduce particle count on mobile, `will-change` |
| 3D tilt не работает на тач-устройствах | Disable tilt on touch, use tap-highlight вместо |
| Шрифты не загрузились | System font stack fallback |
| ScrollTrigger конфликтует с Vue Router | Kill triggers on route change (onBeforeUnmount) |

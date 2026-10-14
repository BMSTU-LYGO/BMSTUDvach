# Арт-дирекция BMSTUDvach: «Редакционный архив»

## Визуальный аудит текущей системы

**Что есть сейчас:**
- Тёмная кибер-палитра: `bg-deep` oklch(0.10) — почти чёрный с синим оттенком
- Неоновый акцент: amber oklch(0.72 0.16 65) с glow-эффектами
- Моно-шрифт как дисплей: JetBrains Mono для заголовков
- CRT-эффекты, vignette, flicker
- Uppercase micro-labels с letter-spacing
- Glow-тени, неоновые hover-эффекты
- Общая эстетика: киберпанк/техно-сеть

**Проблемы:**
- Шаблонный AI/SaaS/cyberpunk вид (не уникальный)
- Моно-шрифт для заголовков — нет иерархии, нет редакционности
- Неоновые эффекты утомляют, не подходят для чтения
- Нет типографической культуры (заголовки = body по весу)
- Не подходит для long-form чтения (платиновые истории)

## Новая концепция: «Редакционный архив»

**Метафора:** BMSTUDvach — не кибер-сеть и не SaaS-дашборд. Это живой студенческий архив: смесь научного журнала, кампусной газеты и технического альманаха. Как у изысканного академического издания — типографика как главный герой, тёплая бумага как фон, один сдержанный акцент.

**Референсы (Awwwards 2024-2026):**
- Terminal Industries (SOTY 2025): тёплые нейтралы, типографика, щедрое пространство
- Siena Film Foundation (SOTM 2025): редакционная типографика, serif + sans
- Cartier Watches & Wonders (SOTM 2025): restrained palette, editorial layout
- Kellerstöckl: editorial typography, justified text

**Ключевые принципы:**
1. **Тёплая палитра бумаги** — кремовый/слоновая кость фон, глубокие чернила текст
2. **Типографика — звезда** — serif-дисплей для заголовков, sans для тела, mono только для данных
3. **Сдержанность** — один акцент, никаких glow и неоновых эффектов
4. **Щедрое пространство** — широкие поля, воздух вокруг элементов
5. **Асимметрия** — редакционные сетки, pull-цитаты, иерархия через масштаб
6. **Без uppercase+letter-spacing** — это киберпанк, уходим от этого

## Палитра

### Фоны (тёплая бумага)
```css
--paper: #F2EDE0;              /* основной фон, тёплая слоновая кость */
--paper-raised: #EAE4D4;       /* карточки, слегка темнее */
--paper-sunken: #F7F3E8;       /* впадины, светлее */
```

### Текст (глубокие чернила)
```css
--ink: #1C1A14;                /* основной текст, тёплый чёрный */
--ink-secondary: #5B5547;      /* вторичный текст */
--ink-tertiary: #8A8273;       /* третичный, muted */
```

### Границы и акценты
```css
--rule: #D4CEB8;               /* hairline-бордеры, почти невидимо */
--accent: #2F4F4E;             /* глубокий приглушённый teal */
--accent-hover: #244140;       /* hover-состояние */
--danger: #9C2A1F;             /* приглушённый rust (только для ошибок) */
```

**Почему teal?** Необычно для imageboard (обычно bright red/blue), технический (как старые осциллографы/приборы), сдержанный, не кричит. Отличает от типичных red/orange accent'ов.

## Типографика

### Шрифты
- **Display (заголовки):** Cormorant Garamond — редакционный serif, есть кириллица, утончённый, variable font
  - `@fontsource/cormorant-garamond` (npm)
  - Weights: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Body (основной текст):** Inter (уже есть) — 400, 500, 600, 700
- **Mono (данные, коды):** JetBrains Mono (уже есть) — только для технических элементов (номера постов, коды, данные)

### Type scale
```css
/* Базовый размер */
--text-base: 1rem;             /* 16px */
--text-sm: 0.875rem;           /* 14px */
--text-lg: 1.125rem;           /* 18px */

/* Заголовки (clamp для fluid typography) */
--text-h1: clamp(2.5rem, 5vw, 4rem);   /* 40-64px */
--text-h2: clamp(2rem, 4vw, 3rem);     /* 32-48px */
--text-h3: clamp(1.5rem, 3vw, 2rem);   /* 24-32px */
--text-h4: 1.25rem;                     /* 20px */
```

### Line-height
```css
--leading-tight: 1.3;          /* заголовки, компактный текст */
--leading-normal: 1.6;         /* body text */
--leading-loose: 1.8;          /* long-form reading */
```

### Правила
- Заголовки: `font-family: var(--font-display)` (Cormorant Garamond), `font-weight: 600`, `line-height: 1.3`
- Body: `font-family: var(--font-body)` (Inter), `font-weight: 400`, `line-height: 1.6`
- Mono: `font-family: var(--font-mono)` (JetBrains Mono) — только для: номера постов, коды, технические данные
- **НЕТ uppercase для micro-labels** — если нужен small text, используем `font-size: 0.875rem` без uppercase/letter-spacing
- **НЕТ mono для заголовков** — заголовки только serif

## Motion

### Timing
```css
--duration-fast: 150ms;
--duration-normal: 200ms;      /* было 300ms, теперь быстрее */
--duration-slow: 280ms;        /* было 500ms, теперь быстрее */
```

### Easing
```css
--ease-out: cubic-bezier(0.33, 1, 0.68, 1);  /* только ease-out, никаких bounce */
```

### Принципы
- Motion = "бумага смещается", не "UI прыгает"
- НЕТ bounce, НЕТ spring, НЕТ neon flicker
- Hover: subtle background shift (paper-sunken), НЕ glow
- Focus: 2px solid var(--accent), outline-offset: 2px
- Selection: var(--accent) background, var(--paper) color

## Поверхности

### Cards
```css
background: var(--paper-raised);
border: 1px solid var(--rule);
border-radius: 0;              /* острые углы, редакционный стиль */
/* НЕТ теней, НЕТ glow */
```

### Buttons
```css
/* Default (ghost) */
background: transparent;
border: 1px solid var(--rule);
color: var(--ink);

/* Hover */
background: var(--paper-sunken);
border-color: var(--ink-tertiary);

/* Primary */
background: var(--accent);
color: var(--paper);
/* Hover */
background: var(--accent-hover);

/* НЕТ glow-теней на hover */
```

### Inputs
```css
background: var(--paper);
border: 1px solid var(--rule);
/* Focus: НЕ glow, а underline */
border-bottom: 2px solid var(--accent);
```

### Modals
```css
background: var(--paper);
border: 1px solid var(--rule);
box-shadow: 0 4px 12px rgba(28, 26, 20, 0.08);  /* subtle, не glow */
/* НЕТ backdrop-blur (или очень subtle) */
```

## Детали

### Focus states
```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

### Hover states
```css
/* Subtle background shift, НЕ glow */
:hover {
  background: var(--paper-sunken);
}
```

### Scrollbar
```css
::-webkit-scrollbar-track {
  background: var(--paper-raised);
}
::-webkit-scrollbar-thumb {
  background: var(--ink-tertiary);
}
```

### Selection
```css
::selection {
  background: var(--accent);
  color: var(--paper);
}
```

## Антипаттерны (ЗАПРЕЩЕНО)

- ❌ Uppercase + letter-spacing (киберпанк)
- ❌ Glow / shadow-glow / neon effects
- ❌ Градиенты (кроме тонких hairline)
- ❌ Uppercase micro-labels
- ❌ Mono для заголовков (только serif)
- ❌ CRT effects (vignette, flicker) — убрать или отключить
- ❌ Neon hover (glow box-shadow)
- ❌ Spring/bounce animations
- ❌ Backdrop-blur на модалках (или очень subtle)

## Разрешено

- ✅ Тёплая бумага (cream/ivory)
- ✅ Deep ink текст
- ✅ Hairline бордеры (1px solid var(--rule))
- ✅ Serif заголовки (Cormorant Garamond)
- ✅ Mono только для данных (номера, коды)
- ✅ Щедрое пространство
- ✅ Асимметричные сетки
- ✅ Pull-цитаты (serif, italic)
- ✅ Subtle hover (paper-sunken background)
- ✅ Restrained accent (teal)

## 3D сцена

3D сцена (NetworkCanvas) читает CSS-переменные. При смене `--accent` цвета частиц/линий обновятся автоматически. Однако:
- Тёмно-синий фон 3D (`bg-deep`) не подходит к тёплой бумаге
- **Решение для этого раунда:** фокус на 2D дизайн-систему. 3D сцена останется как есть, но может выглядеть несоответствующе. Адаптация 3D — отдельная задача.
- Альтернатива: сделать 3D опциональным (по умолчанию off), фокус на типографику и 2D.

## Реализация

### Что меняем в этом раунде
1. **Дизайн-система (Agent 1):** main.css, fonts.css, package.json — новые токены, шрифты, базовые стили
2. **Layout (Agent 2):** DefaultLayout, AppHeader, AppFooter — редакционная оболочка
3. **Home (Agent 3):** HomeView + ключевые секции (TelemetryRail, MentionsBeacon, WatchPanel) — новый hero, редакционный ритм
4. **Browse (Agent 4):** BoardView, ThreadRow, CatalogCard — редакционные списки
5. **Reading (Agent 5):** ThreadView, PostBody, PostPreview — редакционная типографика для чтения
6. **Composer (Agent 6):** SignalDock, ScanLens, Report — редакционные формы и оверлеи

### Что НЕ меняем
- 3D сцена (NetworkCanvas, WarpCanvas) — отдельная задача
- Логика компонентов (только стили)
- API, stores, роутер
- Тесты (если не ломаются из-за изменений разметки)

### Верификация
- Все агенты: `npm run lint`, `npm test`, `npm run build`
- Интегратор: полный прогон тестов, visual check (если возможно), коммит+пуш

## Примечания

**Ограничения:**
- Скриншоты до/после не делаем (нет browser-инструмента в окружении)
- 3D сцена не адаптируется в этом раунде (отдельная задача)
- Некоторые компоненты могут выглядеть несоответствующе до полной адаптации

**Успех:**
- Сайт выглядит как редакционное издание, не как киберпанк/SaaS
- Типографика — главный герой
- Тёплая, спокойная палитра
- Читаемость улучшена
- Уникальный визуальный стиль

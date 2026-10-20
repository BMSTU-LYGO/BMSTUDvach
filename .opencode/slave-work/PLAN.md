# Slave Work Plan — Motion Design System BMSTUDvach: премиальная полировка всех взаимодействий

- Статус: in progress
- Модель субагентов: `opencode-go/minimax-m3.1-flash-free`
- Запуск: 2026-10-20 (волна 2; волна 1 «Archive Space» завершена и заархивирована)
- Engine: cli (`opencode run --model opencode-go/minimax-m3.1-flash-free --agent build --auto`), parallel: 6, waves: 1

## Цель (одной строкой)

Собрать премиальную систему motion design для всего продукта: единые токены и примитивы
(kinetic typography, material reactions, magnetic interactions, reactive lighting), оригинальные
состояния loading/error/empty, shader-акценты в 3D — и вычистить дублирующиеся стандартные
hover/fade/scale так, чтобы страницы стали легче, а не тяжелее.

## Художественный закон (обязателен для всех задач)

Метафора продукта — **«редакционный архив»**: тёплая бумага, чернила, один печатный акцент.
Значит и движение должно быть материальным, а не «конфетным»:

- **Движение = реакция материала, а не украшение.** Бумага не «прыгает» — она отзывается на свет,
  впитывает чернила при нажатии, слегка приподнимается под пальцем.
- **Никакого масштаба ради масштаба.** Hover не должен увеличивать элемент. Реакция = свет по краю,
  тень, чернильный акцент, сдвиг на 1–2px максимум. `transform: scale(1.05)` — запрещённый приём.
- **Один акцент на взаимодействие.** За один момент времени в кадре — максимум один акцентный цвет
  (`--accent` #2F4F4E) и максимум один янтарный (`--amber` #d4882a) «отклик».
- **Тишина важнее эффекта.** Если анимация не читается как «бумага/чернила/свет» — её убрать.
- **Никакого неона, CRT-эффектов и sci-fi свечения** (CRT в проекте есть, но он opt-in и по умолчанию выключен).
- **Бюджет внимания:** magnetic — максимум 1 элемент в зоне видимости; kinetic-типографика — максимум
  3 места в приложении; pointer-light — только на «герой»-поверхностях; длинные списки — только opacity.
- **Каждый элемент, который двигается, обязан иметь статичный эквивалент** (final frame) для
  `prefers-reduced-motion: reduce` и для первого кадра до запуска анимации (никакого FOUC/«засвеченного» текста).

## Контекст для субагентов

- **Стек:** Vue 3 + TS + Vite + Pinia + GSAP 3.15 (+ ScrollTrigger, Flip) + Three.js 0.186.
  Работа только во `frontend/` (+ `docs/` для документации). Backend не трогаем. **Новые зависимости запрещены** —
  `package.json` не менять.
- **Дизайн-система:** `frontend/src/assets/main.css` (токены: палитра, типографика, spacing, motion-токены),
  `frontend/src/assets/animations.css` (keyframes + utility-классы), `frontend/src/assets/fonts.css`.
  Стили подключаются в `frontend/src/main.ts` (`import './assets/main.css'`, `import './assets/animations.css'`).
- **Палитра:** бумага `--paper #F2EDE0`, `--paper-raised #EAE4D4`, `--paper-sunken #F7F3E8`;
  чернила `--ink #1C1A14`, `--ink-secondary #5B5547`, `--ink-tertiary #8A8273`; правило `--rule #D4CEB8`;
  акцент `--accent #2F4F4E` (+`--accent-hover #244140`); янтарь в 3D — `AMBER 0xd4882a` (в DOM-токенах
  янтаря пока нет — его можно завести как `--amber #d4882a`); опасность `--danger #9C2A1F`, успех `--success #3D7A5A`.
  Шрифты: Cormorant Garamond (display), Inter (body), JetBrains Mono (micro-labels).
- **Существующие motion-примитивы (НЕ дублировать, а переиспользовать/развивать):**
  `composables/useGsap.ts` (`gsap`, `ScrollTrigger`, `Flip`, `prefersReducedMotion()`, `isTouchDevice()`),
  `useScrollReveal.ts` (GSAP + ScrollTrigger.batch, `.reveal`), `usePostReveal.ts` (GSAP stagger по новым постам),
  `usePageMorph.ts` (shared-element переходы), `useTilt.ts` (наклон по курсору — это уже 3D-tilt, не magnetic),
  `useParallax.ts` (координаты мыши), `useQuality3D.ts` (качество 3D: `off|low|high`), `useSound.ts`.
- **Состояния:** `components/LoadingState.vue` (225 стр., «ПОИСК СИГНАЛА»), `components/ErrorState.vue` (211),
  `components/EmptyState.vue` (96, «ПУСТОЙ УЗЕЛ»), `components/platinum/ArchiveEmpty.vue` (язык архива).
  Стабильные `data-testid`: `loading`, `state-loading`, `empty`, `state-empty`, `error` (проверь в файлах), `archive-empty`.
- **3D:** `src/three/archive/{layout,materials,space}.ts` (архив платинума: кольца-эпохи, пластины-истории,
  процедурные материалы с GLSL), `src/three/network.ts` (сеть: доски/посты/сигналы), `src/three/warps.ts`
  (шейдерные переходы), `src/three/sceneState.ts` (режимы `home|board|thread|platinum|error` + шина событий),
  `src/composables/useThreeScene.ts` (ленивый `import('three')`, `MAX_ACTIVE_CONTEXTS = 2`, пауза по
  visibility/IntersectionObserver, деградация по FPS, `dispose()`), `src/components/three/*Canvas.vue`.
  Конвенция: `three/`-модули — чистые билдеры + юнит-тесты; канвасы — тонкие Vue-обёртки.
- **Масштаб проблемы (инвентаризация):** 99 `:hover`-правил в 40 .vue-файлах, 151 `transition:`, 35 `@keyframes`,
  23 «сырых» `transition: ... Nms`, 15 «сырых» `cubic-bezier(...)` в .vue, 2 `transition: all 220ms`
  (`components/launch/LaunchBay.vue`, `components/composer/SignalDock.vue`). Токены `--ease-out`,
  `--ease-out-quart`, `--ease-out-expo` объявлены ОДИНАКОВО (`cubic-bezier(0.33, 1, 0.68, 1)`) — смысла в трёх
  именах нет. `views/HomeView.vue` дублирует все токены локально в `.home { --paper: ...; }` — дублирование
  надо убрать. `components/composer/SignalDock.vue` — 1480 строк, `views/ThreadView.vue` — 1273: правки точечные.
- **Команды верификации (запускать из `frontend/`):**
  - `npm run verify:3d` (116 структурных проверок — НЕ должны падать; новые пилюли добавляем в M-T13/M-T14)
  - `npm run lint` (`eslint --max-warnings 0`)
  - `npm run build` (`vue-tsc --noEmit` + `vite build`; three в отдельном чанке)
  - `npm run test` (vitest; сейчас 60 файлов / 898 тестов — покрытие только растить)
  - `npm run format:check` (prettier) — не забывать формат
- **Грабли:**
  - `verify-3d.mjs` жёстко проверяет: `network.ts` содержит `TorusGeometry` + `setStoryCount` + `Raycaster` +
    `lostNode` + `pulseAt`/`sendReply`; `sceneState.ts` — все 5 режимов + `onSceneEvent`/`emitSceneEvent`;
    `PlatinumView.vue` — `setStoryCount` + `listPlatinumStories`; роуты — `scene: 'platinum'`; three в manualChunks.
    Эти проверки НЕЛЬЗЯ ломать.
  - `sceneState.ts` — общий файл: новые поля/события добавлять АДИТИВНО, существующие экспорты
    (`setStoryCount`, `syncBoards`, `highlightBoard`, `setSceneMode`) не удалять и не переименовывать.
  - Тип `SceneEvent` — union: новые варианты дописывать в конец.
  - Тесты завязаны на `data-testid` — сохранять: `fragment-row`, `platinum-empty`, `platinum-story`,
    `loading`, `state-loading`, `empty`, `state-empty`, `error`, `archive-live`, `archive-mode-toggle`.
  - `prefersReducedMotion()` + `@media (prefers-reduced-motion: reduce)` — обязательны во всех новых анимациях.
  - Mobile 320px+: 3D и motion не должны съедать контент; тач-устройства — без hover-зависимостей.
  - `gsap.context(fn, scope)` + `revert()` при unmount — конвенция проекта для GSAP-анимаций.
  - Мок `defineAsyncComponent` в vitest требует `__esModule: true` (см. `components/three/__tests__/AmbientField.spec.ts`).
  - Файлы сцен обязаны чистить: `keep()`/dispose-паттерн, как в `network.ts`.
  - Мусорка `transition: all` ломает анимации неожиданных свойств — запрещено.

## Общие правила для каждого субагента

- Работать автономно, вопросы не задавать. Неизвестное решать самому по конвенциям проекта.
- Сначала прочитать этот PLAN.md (разделы «Художественный закон», «Контекст», «Общие правила»), затем целевые
  файлы И СОСЕДНИЕ с ними — чтобы соблюсти стиль (комментарии в коде объясняют ПОЧЕМУ, а не ЧТО).
- Следовать конвенциям: `three/`-модули — чистые билдеры + юнит-тесты; канвасы — тонкие Vue-обёртки;
  Vue-компоненты — `<script setup lang="ts">` + `<template>` + `<style scoped>`.
- НЕ коммитить и НЕ пушить. Не трогать файлы вне списка своей задачи. Не трогать PLAN.md и `results/` других задач.
- Один файл = один владелец в батче: не редактировать файл задачи, идущей параллельно.
- После правок прогнать (из `frontend/`): `npm run verify:3d && npm run lint && npm run build && npm run test`
  и починить последствия СВОИХ правок (pre-existing/конкурентные падения — зафиксировать в отчёте, НЕ чинить чужие файлы).
- Не расширять scope; идеи — в FOLLOWUPS.
- Отчёт строго по формату промпта, обязательно записать `results/<TASK-ID>.md`.
- Комментарии в коде — по-русски, в стиле проекта; объясняют «почему», а не «что».

## Задачи

### Фаза 1 — Фундамент: токены, примитивы, кинетическая типографика

- [x] M-T1. Motion-токены и шкала времени — `src/assets/motion.css` (new) + правки `src/assets/main.css`
      и `src/main.ts` (импорт). Ввести СЕМАНТИЧЕСКИЕ РОЛИ (не «fast/medium/slow», а по смыслу):
      `--motion-hover` (150ms, стандартная кривая), `--motion-press` (120ms, кривая входа),
      `--motion-reveal` (600ms, entrance), `--motion-kinetic` (per-word 28ms), `--motion-magnetic` (spring 480ms),
      `--motion-cinematic` (900ms) + 4 кривые с РАЗНЫМИ характерами: `--ease-standard` (cubic-bezier(0.2,0,0,1)),
      `--ease-emphasized` (0.33,1,0.68,1), `--ease-entrance` (0.16,1,0.3,1), `--ease-exit` (0.4,0,1,1).
      Старые `--ease-out/--ease-out-quart/--ease-out-expo` оставить как алиасы (их используют 100+ мест),
      но развести по смыслу: `--ease-out` → standard, `--ease-out-quart` → emphasized, `--ease-out-expo` → entrance.
      Убрать локальные копии токенов из `views/HomeView.vue` (`.home { --paper: ... }`) и подобных мест —
      токены живут в `main.css`. Добавить в `motion.css` базовые классы-хелперы: `.motion-press`,
      `.motion-reveal` (появление без FOUC: стартовое состояние + финальный кадр), `.motion-quiet`.
      | Файлы: `src/assets/motion.css` (new), `src/assets/main.css`, `src/main.ts`, `src/views/HomeView.vue` | deps: none | size: M
- [ ] M-T2. Motion-примитивы — `src/composables/useMotion.ts` (new). Экспортируемые хуки:
      `usePointerLight(el, opts)` — реактивное освещение: пишет в CSS custom properties `--mx/--my` (в %),
      обновление через rAF-throttle, без аллокаций в кадре, отключено при reduced-motion/тач-устройстве;
      `useMagnetic(el, opts)` — magnetic interaction: элемент смещается к курсору (порог + радиус + сила),
      плавный возврат, `pointer: fine` only, reduced-motion → выключено;
      `usePress(el)` — материальная реакция нажатия (data-атрибут `--pressed` + короткий импульс);
      `useMotionEnabled()` — единая проверка «можно ли двигать» (reduced-motion + тач + `useQuality3D`).
      Обязательно: подписки снимаются в `onUnmounted`, никаких глобальных слушателей без разбора.
      | Файлы: `src/composables/useMotion.ts` (new), `src/composables/__tests__/useMotion.spec.ts` (new) | deps: M-T1 | size: M
- [ ] M-T3. Kinetic typography — `src/components/ui/KineticText.vue` (new) + тест. Кинетический текст
      как МАСКА: строка/слово выезжает из-под «бумажной» маски (clip/overflow) с лёгким смещением и
      blur-остатком; props: `text`, `mode: 'lines'|'words'`, `delay`, `stagger`, `as` (тег), `ease`.
      A11y: на контейнере `aria-label` с полным текстом, визуальные куски `aria-hidden`, без дублей для скринридера.
      Reduced-motion: текст виден сразу, без `opacity: 0` в DOM. Без FOUC: до запуска — финальный кадр,
      анимация только при появлении в вью. Компонент НЕ применяется массово — он будет использован в M-T5.
      | Файлы: `src/components/ui/KineticText.vue` (new), `src/components/ui/__tests__/KineticText.spec.ts` (new) | deps: M-T1 | size: M

### Фаза 2 — Материальные реакции и реактивное освещение (DOM)

- [ ] M-T4. Material layer — `src/assets/material.css` (new) + импорт в `src/main.ts`. Единый язык
      реакций поверхностей: `.surface-paper` (бумага: очень мягкая тень + 1px кромка `--rule`),
      `.react-lift` (наведение: тень растёт, кромка светлеет, сдвиг 0 — БЕЗ scale),
      `.react-press` (нажатие: элемент «впитывается» — тень сжимается, кромка темнеет, 1px вниз),
      `.react-edge` (свет по кромке со стороны курсора через `--mx/--my`),
      `.react-ink` (чернильный акцент: тонкая линия/подчёркивание, проявляющаяся от края).
      Токены: `--material-shadow-1/2`, `--material-edge`, `--material-press-delta`.
      Всё без `transform: scale`, без `transition: all`; только transition/opacity/box-shadow/border-color.
      | Файлы: `src/assets/material.css` (new), `src/main.ts` | deps: M-T1 | size: S
- [ ] M-T5. Применение: главная и карточки — `src/views/HomeView.vue`, `src/components/ui/BoardCard3D.vue`,
      `src/components/ui/DepthCard.vue`, `src/components/layout/AppHeader.vue`, `src/components/ui/DepthCard.vue`.
      Что делать: (а) hero-CTA получает material-реакцию + pointer-light (реактивное освещение бумаги),
      (б) карточки досок — `.react-lift` + `.react-edge` вместо текущих ad-hoc hover (убери `transform: scale`
      и дублирующие `transition`), (в) `KineticText` — на ОДНОМ заголовке (hero-kicker или заголовок раздела
      «Разделы»), (г) шапка — тихая реакция, без параллакса. Обязательно: `useTilt` в карточках оставить
      (это наклон, а не magnetic) — не дублировать наклон через material-классы.
      | Файлы: `src/views/HomeView.vue`, `src/components/ui/BoardCard3D.vue`, `src/components/ui/DepthCard.vue`, `src/components/layout/AppHeader.vue` | deps: M-T2, M-T3, M-T4 | size: M
- [ ] M-T6. Применение: тред и композер — `src/views/ThreadView.vue`, `src/components/thread/ThreadRow.vue`,
      `src/components/thread/PostBody.vue`, `src/components/composer/SignalDock.vue`.
      Что делать: (а) строки треда и посты — material-реакция (кромка/тень), никакого scale;
      (б) `SignalDock` (1480 стр.) — точечно: убрать `transition: all 220ms`, заменить на семантические
      токены, добавить press-реакцию на `TransmitControl`; (в) на длинных списках — только opacity-появление,
      без per-row transform (иначе страница «перегрузится»).
      | Файлы: `src/views/ThreadView.vue`, `src/components/thread/ThreadRow.vue`, `src/components/thread/PostBody.vue`, `src/components/composer/SignalDock.vue` | deps: M-T2, M-T4 | size: M
- [ ] M-T7. Применение: остальные поверхности — `src/components/launch/LaunchBay.vue`,
      `src/components/report/ReportProbe.vue`, `src/components/scan/ScanLens.vue`,
      `src/components/watch/WatchPanel.vue`, `src/views/AboutView.vue`, `src/views/StatsView.vue`,
      `src/views/ModerationView.vue`, `src/components/composer/TransmitControl.vue`.
      Что делать: заменить ad-hoc hover/transition на material-слой; в `LaunchBay` — magnetic на главной
      кнопке запуска (единственный magnetic в приложении!) + `.react-press`; в `ReportProbe` — реакция
      «чернила» на выборе причины; в `StatsView/AboutView/ModerationView` — тихие реакции, без анимации
      длинных списков.
      | Файлы: перечисленные 8 файлов | deps: M-T2, M-T4 | size: M

### Фаза 3 — Shader accents (3D) и свет

- [x] M-T8. Shader accents архива — `src/three/archive/materials.ts`, `src/three/archive/space.ts`.
      Что делать: (а) «бумажный просвет» — мягкий backlight/пропускание света у пластин (subsurface-lite
      в шейдере, без неона); (б) янтарная кромка, загорающаяся только в фокусе (уже есть частично — довести
      до «одного акцента»); (в) пыль с параллаксом относительно камеры (глубина без тяжести);
      (г) `quality: 'low'` — отключить дорогие октавы/подсветку, бюджет ниже.
      Шейдеры остаются с `gl_FragColor` (это проверяет `verify:3d`), uniform-контракт `uTime/uFocus/uDim`
      НЕ ЛОМАТЬ (проверяется тестами), публичные фабрики `fragmentMaterial/ringMaterial/vaultMaterial/
      dustMaterial/emptyHaloMaterial` и `disposeArchiveMaterials` — сохранить сигнатуры.
      | Файлы: `src/three/archive/materials.ts`, `src/three/archive/space.ts` | deps: none | size: M
- [x] M-T9. Shader accents сети и переходов — `src/three/network.ts`, `src/three/warps.ts`.
      Что делать: (а) accent sweep (проходящий по узлу свет) — вместо равномерного свечения;
      (б) «чернильный» шум в шейдерах — мизерная неоднородность, чтобы плоскость не была мёртвой;
      (в) реакция на указатель: узел рядом с курсором чуть теплее (amber) — «тепло», а не «неон»;
      (г) бюджет: `quality: 'low'` — без шума/свечения; `TorusGeometry`, `setStoryCount`, `Raycaster`,
      `lostNode`, `pulseAt`, `sendReply` НЕ ТРОГАТЬ (на них guard'ы `verify:3d`).
      | Файлы: `src/three/network.ts`, `src/three/warps.ts` | deps: none | size: M

### Фаза 4 — Оригинальные состояния loading / error / empty

- [x] M-T10. Единый язык состояний — `src/components/LoadingState.vue`, `src/components/ErrorState.vue`,
      `src/components/EmptyState.vue`. Переработать ТРИ состояния в ОДИН визуальный язык (сейчас они
      стилистически разные): общая «сигнальная» графика на бумаге, одна иконографика, одна типографика
      (mono-подпись + строка сообщения), один акцент на состояние (loading — accent, error — danger,
      empty — приглушённый accent). Сохранить `data-testid`: `loading`, `state-loading`, `empty`, `state-empty`,
      `error` (сверься по файлам) и существующие пропсы (`label`, `message`, `on-retry`).
      Плюс: состояния должны честно показывать прогресс/повтор, а не «серый текст».
      | Файлы: `src/components/LoadingState.vue`, `src/components/ErrorState.vue`, `src/components/EmptyState.vue`, `src/components/__tests__/States.spec.ts` | deps: M-T1, M-T4 | size: M
- [ ] M-T11. Новые состояния — `src/components/NotFoundState.vue` (new) + подключение в
      `src/views/NotFoundView.vue`, `src/views/ModerationView.vue`, `src/views/StatsView.vue`.
      Что делать: (а) «оригинальное» 404-состояние в том же языке (след потерянного фрагмента);
      (б) оффлайн-состояние — если есть `components/ui/OfflineBadge.vue`, привести к тому же языку;
      (в) состояние «доступ закрыт» для модерации — вежливое, без страха.
      Все состояния — без layout shift, reduced-motion safe, с `role="status"`/`aria-live` там, где уместно.
      | Файлы: `src/components/NotFoundState.vue` (new), `src/views/NotFoundView.vue`, `src/views/ModerationView.vue`, `src/views/StatsView.vue`, `src/components/ui/OfflineBadge.vue` | deps: M-T10 | size: M
- [ ] M-T12. 3D-хореография состояний — `src/three/archive/space.ts`, `src/components/three/ArchiveSpaceCanvas.vue`,
      `src/views/PlatinumView.vue`. Что делать: сцена должна одинаково говорить «загружаю / ошибка / пусто»:
      (а) loading — кольца светятся по очереди (мягкое ожидание), (б) error — сцена «гаснет»/остаётся
      статичной, (в) empty — медленный дрейф без пыли. Не ломать `buildArchiveSpace` API и сигнатуры
      `setStories/focus/travelToFocus/releaseFocus/openStory/orbitBy/setPointer/pointerStoryId/update/dispose`
      (на них guard'ы и тесты). Публичный `data-testid` вью не менять.
      | Файлы: `src/three/archive/space.ts`, `src/components/three/ArchiveSpaceCanvas.vue`, `src/views/PlatinumView.vue` | deps: M-T8 | size: M

### Фаза 5 — Дедупликация, перф, a11y, guard'ы, документация

- [ ] M-T13. Motion guard — `src/scripts/verify-motion.mjs` (new, рядом с `verify-3d.mjs`) + npm-скрипт
      `verify:motion` в `package.json` (единственное разрешённое изменение package.json). Проверки:
      запрет `transition: all`; запрет «сырых» `cubic-bezier(...)` и `NNms` в `.vue` (кроме самого motion.css
      и точечных исключений, перечисленных явным списком); запрет `transform: scale(...)` в `:hover`-правилах
      .vue; запрет дублирующихся `@keyframes` с одинаковым именем в разных файлах; проверка, что
      `motion.css` и `material.css` подключены в `main.ts`; проверка, что `--motion-*` роли объявлены.
      Все проверки — по КОДУ (комментарии вырезать), с внятными английскими именами, в стиле `verify-3d.mjs`.
      | Файлы: `src/scripts/verify-motion.mjs` (new), `package.json` | deps: M-T1, M-T5, M-T6, M-T7 | size: M
- [ ] M-T14. Финальная дедупликация — по всему `frontend/src` (`.vue` + `.css`): убрать оставшиеся
      `transition: all`, «сырые» `cubic-bezier`/`ms`, дублирующиеся keyframes с одинаковым именем, дубли
      hover-правил, локальные копии токенов. Каждую замену — на семантический токен из `motion.css`.
      Проверяемо: `npm run verify:motion` зелёный, `npm run verify:3d` не сломана, тесты зелёные.
      Затрагивать можно ТОЛЬКО `.vue`/`.css` файлы, уже переработанные в M-T5..M-T7 и M-T10..M-T12,
      плюс `src/components/thread/*`, `src/components/composer/*` — НЕ трогать `src/three/*` и `src/views/PlatinumView.vue`
      (они в M-T12) и не трогать `src/components/platinum/ArchiveEmpty.vue`.
      | Файлы: `frontend/src/**` (.vue/.css, кроме исключений выше) | deps: M-T13 | size: L
- [ ] M-T15. Перф-дисциплина motion — `src/composables/useMotion.ts`, `src/composables/useGsap.ts`,
      `src/assets/motion.css`, `src/assets/material.css`. Правила: только compositor-свойства
      (transform/opacity) в анимациях; `box-shadow`/`filter` — не в горячем пути; `will-change` — только
      на время анимации, не «навсегда на элементе»; кап одновременных анимаций (магнит — 1, pointer-light — 2);
      отключение всего при `prefers-reduced-motion` и при `quality: 'off'|'low'` (3D); никаких
      `setInterval`/`requestAnimationFrame` без остановки; замер: зафиксируй в отчёте, сколько слушателей
      и rAF-циклов добавляет новая система на страницу.
      | Файлы: `src/composables/useMotion.ts`, `src/composables/useGsap.ts`, `src/assets/motion.css`, `src/assets/material.css` | deps: M-T2, M-T5 | size: M
- [ ] M-T16. A11y-аудит motion — `src/components/__tests__/States.spec.ts`,
      `src/composables/__tests__/useMotion.spec.ts`, `src/components/ui/__tests__/KineticText.spec.ts`
      + точечные правки найденного. Проверить: (а) при `prefers-reduced-motion: reduce` в DOM нет
      `opacity: 0` для контента (текст виден всегда); (б) фокус виден и не теряется; (в) `aria-live`
      не спамит; (г) контраст подписей ≥ 4.5:1; (д) клавиатура работает без мыши; (е) `aria-busy`
      на загрузке, где уместно. Тесты — на реальных поведениях, не на снапшотах классов.
      | Файлы: перечисленные 3 тест-файла + точечные правки по результатам аудита | deps: M-T5, M-T6, M-T7, M-T10, M-T11 | size: M
- [ ] M-T17. Документация — `docs/ART_DIRECTION.md` (раздел «Motion system»: роли и кривые, материальные
      реакции, кинетическая типографика и где она ДОПУСТИМА, magnetic, реактивное освещение, состояния,
      shader-акценты, бюджет внимания, reduced-motion, «как добавить новую реакцию»),
      `docs/PROJECT_NEXT_AUDIT.md` (запись раунда: что было/стало, решения, проверки, ограничения, следующие шаги).
      Числа — только из кода и отчётов, ничего не выдумывать.
      | Файлы: `docs/ART_DIRECTION.md`, `docs/PROJECT_NEXT_AUDIT.md` | deps: M-T13, M-T14, M-T15, M-T16 | size: S

## Прогресс

- 2026-10-20 21:30 старт волны 2; волна 1 «Archive Space» закрыта (19/19, коммиты `a0aedfd`…`51713e8`) и заархивирована
- 2026-10-20 21:30 Гейты Фазы 0: каталоги ✅, slug `opencode-go/minimax-m3.1-flash-free` ✅, smoke CLI ✅ (SMOKE_OK)
- 2026-10-20 21:30 батч 1 запущен: M-T1 (motion-токены), M-T8 (shader-акценты архива), M-T9 (shader-акценты сети/переходов), M-T10 (единый язык состояний) — файлы не пересекаются
- 2026-10-20 23:58 батч 1 DONE + верификация зелёная (verify:3d 116/116, lint 0, build OK, test 61 файлов/952 теста) → коммит ниже. `format:check` падает и на baseline (82 исходных файла, включая main.css с uppercase-hex конвенцией) — регрессии нет
- 2026-10-20 23:58 батч 2 запущен: M-T2 (useMotion), M-T3 (KineticText), M-T4 (material.css), M-T11 (NotFound/оффлайн-состояния), M-T12 (3D-хореография состояний) — файлы не пересекаются

## Проблемы / заблокировано

# Slave Work Plan — Platinum BMSTUDvach как самостоятельный интерактивный Three.js Archive Space

- Статус: in progress
- Модель субагентов: `opencode-go/minimax-m3.1-flash-free`
- Запуск: 2026-10-20
- Engine: cli (`opencode run --model opencode-go/minimax-m3.1-flash-free --agent build --auto`), parallel: 6, waves: 1

## Цель (одной строкой)

Превратить `/platinum/` из «списка под общим фоном» в самостоятельное интерактивное
Three.js Archive Space: пространственная структура историй (rings + 3D fragments),
camera focus, кинематографичное открытие истории, процедурные материалы, красивый
empty state — с полным сохранением удобства чтения (типографика, measure, a11y) и
существующего API (`listPlatinumStories`, `getPlatinumStory`, без изменений backend).

## Контекст для субагентов

- **Стек:** Vue 3 + TS + Vite + Pinia + GSAP + Three.js 0.186. Работа только во `frontend/`;
  backend не трогаем (API-контракт читается как данность).
- **Точка входа в 3D:** один персистентный WebGL-сцен `src/three/network.ts`
  (`buildNetwork`) живёт в `src/components/three/NetworkCanvas.vue`, вешается
  `AmbientField.vue` (quality `off` → `ParticleField.vue` fallback). Режим сцены —
  `src/three/sceneState.ts` (`SceneMode = home|board|thread|platinum|error`),
  route→scene биндит `src/composables/useRouteScene.ts`, переходы — `transitionDirector.ts`
  + `scenarios.ts` + `warps.ts` (`WarpCanvas.vue`).
- **Ресурсный бюджет:** `src/composables/useThreeScene.ts` — ленивый `import('three')`,
  `MAX_ACTIVE_CONTEXTS = 2`, pause по visibilitychange/IntersectionObserver, деградация
  по FPS (`degrade()`), полный `dispose()`. Новый самостоятельный канвас обязан вписаться:
  на маршруте платинума NetworkCanvas должен уступить слот (см. P2-T4).
- **Нынешний «архив» в network.ts (строки ~1002–1070):** 3 орбиты `TorusGeometry`
  (radii 3.0/4.8/6.6), `vault` (DodecahedronGeometry, AMBER), glow-сфера, `fragments` —
  `EdgesGeometry(BoxGeometry)` по `setStoryCount(count)` с жёстким `Math.min(count, 18)`,
  presence-lerp `presence.archive`, morph-складывание нод в архив. Всё `LineBasicMaterial` —
  никаких процедурных шейдеров, ни одна грань не привязана к реальной истории.
- **Нынешние вью:** `src/views/PlatinumView.vue` (503 стр.) — DOM-список «instrument panel»,
  дебаунс-поиск, `loadMore`, `setStoryCount(result.count)`, `data-testid="fragment-row"`,
  `data-testid="platinum-empty"`. `src/views/PlatinumStoryView.vue` (252 стр.) — чистое
  редакционное чтение (`story-in` keyframes, `data-testid="platinum-story"`).
- **API (читать, не менять):** `src/api/platinum.ts` → `listPlatinumStories({page, search})
  : Promise<Paginated<PlatinumStory>>`, `getPlatinumStory(id)`. `PlatinumStory =
  {id, title, body, source_type, status, generation_metadata, created_at, published_at}`.
- **Художественный язык:** docs/ART_DIRECTION.md «Редакционный архив» — тёплая бумага
  (`--paper #F2EDE0`, `--paper-raised #EAE4D4`), чернила (`--ink #1C1A14`), один акцент
  `--accent #2F4F4E` + amber `#d4882a` (в 3D уже: `AMBER 0xd4882a`, `STEEL 0x5a6480`,
  `GLOW 0xffcc66`, `DEEP 0x1a1e2e`), JetBrains Mono / Cormorant Garamond / Inter.
  Никакого неона/CRT по умолчанию; uppercase-micro-labels не раздувать.
- **Команды верификации (запускать из `frontend/`):**
  - `npm run verify:3d` (46 структурных проверок — не должны падать; новые пилюли добавляем в P4-T3)
  - `npm run lint` (eslint --max-warnings 0)
  - `npm run build` (vue-tsc --noEmit + vite build; three в отдельном чанке)
  - `npm run test` (vitest, сейчас 53 файла / 636 тестов — покрытие только растить)
- **Грабли:**
  - `verify-3d.mjs` жёстко проверяет: `network.ts` содержит `TorusGeometry` + `setStoryCount`
    + `Raycaster` + `lostNode` + `pulseAt`/`sendReply`; `sceneState.ts` все 5 режимов +
    `onSceneEvent`/`emitSceneEvent`; `PlatinumView.vue` содержит `setStoryCount` И
    `listPlatinumStories`; роуты содержат `scene: 'platinum'`; `three` в manualChunks.
    Перенос архива из network.ts делать ТОЛЬКО вместе с правкой guard'а (P2-T5 + P4-T3),
    иначе батч красный.
  - `sceneState.ts` — общий файл: новые поля/события добавлять аддитивно, существующие
    экспорты (`setStoryCount`, `syncBoards`, `highlightBoard`, `setSceneMode`, типы событий)
    не удалять и не переименовывать: их читают ThreadView/BoardView/HomeView/AppHeader/tests.
  - Тип `SceneEvent` — union: новые варианты дописывать в конец; все потребители
    (`NetworkCanvas.vue`, тесты) сверяются по `ev.type`.
  - Тесты завязаны на `data-testid` — сохранить: `fragment-row`, `platinum-empty`,
    `platinum-story`; новые testid добавлять можно.
  - `prefersReducedMotion()` (`composables/useGsap.ts`) + `@media (prefers-reduced-motion: reduce)`
    — обязательны во всех новых анимациях. Mobile 320px+: 3D не должен съедать контент.
  - Новые зависимости запрещены (`package.json` не менять).
  - Файлы сцен обязано чистить: `keep()`-паттерн/`dispose()` как в network.ts, иначе утечка.

## Общие правила для каждого субагента

- Работать автономно, вопросы не задавать.
- Сначала прочитать этот PLAN.md (разделы «Контекст» и «Общие правила»), затем целевые
  файлы и соседние с ними; следовать конвенциям (`three/` модули пишутся как чистые
  билдеры + юнит-тесты, канвасы — как тонкие Vue-обёртки).
- НЕ коммитить и НЕ пушить. Не трогать файлы вне списка задачи. Не менять PLAN.md и
  `results/` других задач.
- Один файл = один владелец в батче: не трогать файл задачи, идущей параллельно.
- После правок прогнать: `cd frontend && npm run verify:3d && npm run lint && npm run build && npm run test`
  и починить последствия СВОИХ правок (pre-existing падения — зафиксировать в отчёте).
- Не расширять scope; идеи — в FOLLOWUPS.
- Отчёт строго по формату промпта, обязательно записать `results/<TASK-ID>.md`.

## Задачи

### Фаза 1 — Фундамент: геометрия, процедурные материалы, состояние архива

- [x] P1-T1. Чистая раскладка архива `src/three/archive/layout.ts` — детерминированная
      расстановка фрагментов по реальным историям: кольца по «эпохе» (год `published_at` →
      кольцо), угол по hash(id), радиус/высота/наклон по `source_type`, лимиты
      (`maxFragments`), функции `ringsFor(stories)`, `placeFragments(stories, opts)`,
      `fragmentById(id)`; никаких three-объектов (только числа) → тестируется без WebGL;
      кейсы: 0/1/17/60 историй, одинаковые даты, отсутствующий `published_at`.
      | Файлы: `src/three/archive/layout.ts` (new), `src/three/archive/__tests__/layout.spec.ts` (new) | deps: none | size: M
- [x] P1-T2. Процедурные материалы `src/three/archive/materials.ts` — фабрики
      `fragmentMaterial(three, {quality})`, `ringMaterial(...)`, `vaultMaterial(...)`,
      `dustMaterial(...)`: GLSL (fresnel-кромка, «бумажное» зерно через хеш-шум,
      time-uniform, accent #2F4F4E + amber #d4882a, additive glow только на focus),
      единый `uniforms`-контракт `uTime/uFocus/uDim`; учёт quality `high|low`;
      юнит-тесты: компилируемость строк шейдеров (содержат `gl_FragColor`), унициформы,
      отсутствие утечек (`dispose`).
      | Файлы: `src/three/archive/materials.ts` (new), `src/three/archive/__tests__/materials.spec.ts` (new) | deps: none | size: M
- [x] P1-T3. Состояние архива в `sceneState.ts` — аддитивно: `ArchiveStoryRef
      {id, title, year, ring, sourceType}`, поля `archiveStories: ArchiveStoryRef[]`,
      `focusedStory: number|null`, `selectedStory: number|null`; сеттеры
      `setArchiveStories(refs)`, `focusStory(id|null)`, `selectStory(id|null)`;
      события union'а `archive-focus`, `archive-open`, `archive-clear` (+ doc-комменты);
      существующее поведение `setStoryCount` сохранить ( internally может обновлять
      `archiveStories.length`-логикой, но подпись и эффект не меняются); тесты расширить.
      | Файлы: `src/three/sceneState.ts`, `src/three/__tests__/sceneState.spec.ts` | deps: none | size: M

### Фаза 2 — Самостоятельная сцена Archive Space

- [ ] P2-T1. Сборка сцены `src/three/archive/space.ts` — `buildArchiveSpace(three, quality):
      ArchiveSpaceController`: граф сцены из layout (P1-T1) + материалов (P1-T2):
      орбиты-кольца, фрагменты-пластинки (по одной на историю, `userData.storyId`),
      ядро-хранилище, ambient dust, режим `empty` (нет историй — голые кольца + dust +
      медленный breath-дрейф); `update(dt, snap)`, `setStories(refs)`, `presence`
      fade-in; dispose по конвенции network.ts. Юнит-смоук на fake-three объекте.
      | Файлы: `src/three/archive/space.ts` (new), `src/three/archive/__tests__/space.spec.ts` (new) | deps: P1-T1, P1-T2, P1-T3 | size: L (включает камеру+указатель из P2-T2)
- [ ] P2-T2. (ОБЪЕДИНЕНА В P2-T1 — один владелец файла `archive/space.ts`; камера/pointer
      делаются в рамках P2-T1 по её же спецификации ниже.)
      | Файлы: — | deps: — | size: —
- [ ] P2-T3. Канвас `src/components/three/ArchiveSpaceCanvas.vue` — тонкая обёртка над
      `useThreeScene`: build → `buildArchiveSpace`, watch `sceneState.archiveStories/
      focusedStory` → `setStories/focusStory`, слушатель `onSceneEvent`
      (`archive-focus`/`archive-open`/`archive-clear`), pointermove/pointerdown →
      `setPointer`/hover → `focusStory`+`emitSceneEvent`, `aria-hidden` канвас,
      DOM-fallback слой при quality `off`/нет WebGL; `pointer-events` только на канвасе.
      | Файлы: `src/components/three/ArchiveSpaceCanvas.vue` (new), `src/components/three/__tests__/ArchiveSpaceCanvas.spec.ts` (new) | deps: P2-T1, P1-T3 | size: M
- [ ] P2-T4. Роут-свитч в `AmbientField.vue` — на режиме сцены `platinum` рендерить
      `ArchiveSpaceCanvas` (defineAsyncComponent) ВМЕСТО `NetworkCanvas` (освободить слот
      контекста; `MAX_ACTIVE_CONTEXTS` не поднимать), при `quality=off` прежний
      `ParticleField`; тесты обновить. `NetworkCanvas.vue` НЕ менять.
      | Файлы: `src/components/three/AmbientField.vue`, `src/components/three/__tests__/AmbientField.spec.ts` (new/обновить) | deps: P2-T3 | size: S
- [ ] P2-T5. Перенос веса архива из `network.ts` + честный guard — в network.ts оставить
      контракт (`setStoryCount`, `TorusGeometry`-орбиты) как «отдалённый фон», но убрать
      дублирующую детализацию фрагментов (кап 18 → декоративные пылинки), а в
      `scripts/verify-3d.mjs` добавить блок проверок archive-space: `archive/space.ts`
      существует и содержит `buildArchiveSpace`, `materials.ts` содержит `gl_FragColor`,
      `ArchiveSpaceCanvas.vue` содержит `buildArchiveSpace`, layout-файл содержит
      `placeFragments`, PlatinumView содержит `ArchiveSpaceCanvas`. Все прежние проверки
      продолжают проходить.
      | Файлы: `src/three/network.ts`, `scripts/verify-3d.mjs` | deps: P2-T4 | size: M

### Фаза 3 — Кинематографичное открытие и живой список

- [ ] P3-T1. Двусторонняя связь список↔фрагмент в `PlatinumView.vue` — hover/focus
      строки → `focusStory(id)` + `emitSceneEvent('archive-focus')`; hover 3D →
      подсветка строки (атрибут `data-focused`, scroll-into-view без рывка); клик по
      3D-фрагменту → `selectStory` + родовой переход на `/platinum/:id`; поиск/`loadMore`
      обновляют `setArchiveStories` (полный набор загруженных историй, а не только count);
      сохранение markup/typography и всех `data-testid`; mobile: 3D-слой не мешает чтению
      (canvas `pointer-events:auto` только в своей зоне).
      | Файлы: `src/views/PlatinumView.vue`, `src/views/__tests__/PlatinumView.spec.ts` | deps: P2-T4, P1-T3 | size: L
- [ ] P3-T2a. Компонент `src/components/platinum/ArchiveEmpty.vue` — editorial-панель
      пустого/молчащего архива (props: `mode: 'empty'|'search'|'error'|'loading'`,
      `query`, `total`; слот для действия; mono-подпись + serif-строка, один amber
      акцент, без layout shift, reduced-motion safe, `data-testid="archive-empty"` +
      сохранение внешнего `platinum-empty` через consumer). Юнит-тесты.
      | Файлы: `src/components/platinum/ArchiveEmpty.vue` (new), `src/components/platinum/__tests__/ArchiveEmpty.spec.ts` (new) | deps: none | size: S
- [ ] P3-T2b. Empty/loading/error-хореография в `PlatinumView.vue` — подключить
      `ArchiveEmpty` (P3-T2a), сценовая часть: при пустом наборе сцена уходит в
      empty-режим (голые кольца + dust + halo), skeleton-свечение колец при загрузке,
      «архив молчит» при ошибке; без layout shift, с `prefersReducedMotion`.
      | Файлы: `src/views/PlatinumView.vue`, `src/views/__tests__/PlatinumView.spec.ts` | deps: P3-T1, P3-T2a | size: M
- [ ] P3-T3. Сценарий перехода `platinum↔story` — в `scenarios.ts` новый сценарий
      `archive-reveal` (из `platinum` в `platinum` c открытой историей: shared-элемент —
      фрагмент, камера не «перескакивает»), подключить в `transitionDirector`/`useRouteScene`
      без изменения длительностей остальных; уважать reduced-motion.
      | Файлы: `src/three/scenarios.ts`, `src/composables/useRouteScene.ts`, `src/three/__tests__/scenarios.spec.ts` (new/обновить) | deps: P3-T1 | size: M
- [ ] P3-T4. Открытие истории (`PlatinumStoryView.vue`) — кинематографичный вход:
      camera-focus на «свой» фрагмент + разворот читаемого слоя (GSAP `story-in` →
      многоступенчатый: затемнение орбит, raise title, measure-типографика как сейчас),
      кнопка/жест «назад в архив» снимает `selectStory`; при reduced-motion — мгновенный
      финальный кадр; чтение (70ch, ритм параграфов, `platinum-story`) НЕ трогать.
      | Файлы: `src/views/PlatinumStoryView.vue`, `src/views/__tests__/PlatinumStoryView.spec.ts` | deps: P3-T2b, P3-T3 | size: M

### Фаза 4 — Перф, a11y, guard'ы, документация

- [ ] P4-T1. A11y и клавиатура архива — список остаётся источником правды:
      `Tab`/стрелки по строкам двигают `focusStory` (3D лишь следует), `Enter` открывает,
      `aria-live` объявление «фрагмент #N · <title>», переключатель «3D/только текст»
      (persist в localStorage, по умолчанию 3D) с `aria-pressed`; фокус-ловушки нет;
      контраст подписей ≥ 4.5:1.
      | Файлы: `src/views/PlatinumView.vue`, `src/components/three/ArchiveSpaceCanvas.vue`, `src/views/__tests__/PlatinumView.spec.ts` | deps: P3-T4 | size: M
- [ ] P4-T2. Перф-проход Archive Space — переиспользование геометрий/материалов
      (общие BufferGeometry на кольцо, instancing/merge где возможно), бюджет фрагментов
      (cap + LOD по quality), отключение dust при `low`, `will-change`/blend-пракики,
      замер: нет утечек после unmount (`renderer.dispose()` путь), нет лишних
      rerender-волн; документировать числа в отчёте.
      | Файлы: `src/three/archive/space.ts`, `src/three/archive/materials.ts`, `src/three/archive/layout.ts` | deps: P2-T5, P3-T1 | size: M
- [ ] P4-T3. Тесты и структурные guard'ы — расширить `verify:3d` (если P2-T5 не закрыл всё):
      проверка что на platinum рендерится ArchiveSpaceCanvas; юнит-тесты coverage для
      `archive/*` (layout/materials/space) и интеграционный сценарный тест вью;
      удалить мёртвые проверки; `npm run test` зелёный, покрытие не упало.
      | Файлы: `scripts/verify-3d.mjs`, `src/three/archive/__tests__/*.spec.ts`, `src/views/__tests__/PlatinumView.spec.ts` | deps: P4-T1, P4-T2 | size: M
- [ ] P4-T4. Документация — раздел «Archive Space» в docs/ART_DIRECTION.md (метафора
      колец/фрагментов, палитра, правило «один accent на взаимодействие», reduced-motion),
      запись раунда в docs/PROJECT_NEXT_AUDIT.md (что сделано, какие проверки, след. шаги).
      | Файлы: `docs/ART_DIRECTION.md`, `docs/PROJECT_NEXT_AUDIT.md` | deps: P4-T3 | size: S

## Прогресс

- 2026-10-20 16:14 старт; baseline `4e0b301` закоммичен и запушен; smoke OK (task engine, minimax-m3.1-flash-free)
- 2026-10-20 16:14 батч 1 запущен: P1-T1, P1-T2, P1-T3 (параллельно, разные файлы)
- 2026-10-20 17:56 батч 1 DONE + верификация зелёная (verify:3d 46/46, lint 0, build OK, test 55 файлов/701 тестов). Engine переключён на cli (`opencode run --model opencode-go/minimax-m3.1-flash-free`), коммит `af9d70f` запушен. FOLLOWUPS из отчётов учтены в P2/P3. P2-T2 объединена в P2-T1, P3-T2 разделена на P3-T2a/P3-T2b.
- 2026-10-20 18:05 батч 2 запущен: P2-T1 (сцена+камера, L), P3-T2a (ArchiveEmpty) — разные файлы, параллельно

## Проблемы / заблокировано

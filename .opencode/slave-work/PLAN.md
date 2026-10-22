# Slave Work Plan — Visual QA & Performance Audit BMSTUDvach (desktop + mobile)

- Статус: in progress
- Модель субагентов: `opencode-go/minimax-m3.1-flash-free`
- Запуск: 2026-10-21 (волна 3; волны 1 «Archive Space» и 2 «Motion system» завершены и заархивированы)
- Engine: cli (`opencode run --model opencode-go/minimax-m3.1-flash-free --agent build --auto`), parallel: 6, waves: 1

## Цель (одной строкой)

Провести настоящий визуальный QA и performance-аудит всего продукта в реальном браузере
(desktop + mobile): снять все страницы и состояния, найти визуальную непоследовательность,
слабую композицию, дешёвые эффекты, разрывы анимаций, проблемы WebGL/FPS/памяти — исправить
их и закрепить воспроизводимыми visual regression checks.

## Контекст для субагентов

- **Стек:** Vue 3 + TS + Vite 5 + Pinia + GSAP 3.15 (+ScrollTrigger, Flip) + Three.js 0.186.
  Работа только во `frontend/` (+ `docs/`). Backend не трогать. **Новые зависимости запрещены** —
  `package.json` не менять, кроме ОДНОГО владельца (см. Q-T10).
- **Дизайн-система:** `src/assets/main.css` (палитра/типографика/spacing), `src/assets/motion.css`
  (роли движения), `src/assets/material.css` (материальные реакции). Арт-дирекшн — `docs/ART_DIRECTION.md`.
- **Маршруты (src/router/index.ts):** `/` (home), `/boards/:boardSlug`, `/threads/:threadId`,
  `/platinum`, `/platinum/:storyId`, `/about`, `/moderation`, `/stats`, `*` (404).
  Сцена 3D меняется по `meta.scene`: `home|board|thread|platinum|error`.
- **API:** фронт ходит в `http://localhost:8000/api/v1` (`src/api/client.ts`, `API_BASE_URL`).
  Эндпоинты: `/boards/`, `/boards/:slug/`, `/boards/:slug/threads/`, `/threads/recent/?limit=`,
  `/threads/:id/`, `/posts/:id/`, `/posts/:id/reports/`, `/platinum/`, `/platinum/:id/`,
  `/telemetry/`, `/telemetry/activity/?days=`, `/mentions/`, `/announcements/`, `/search/?`,
  `/staff/...`. **Бэкенд в QA не поднимаем** — данные подменяются перехватом запросов в браузере
  (см. Q-T1/Q-T2): это даёт ДЕТЕРМИНИРОВАННЫЕ снимки (нужно для visual regression).
- **3D:** `src/three/archive/{layout,materials,space}.ts`, `src/three/network.ts`, `src/three/warps.ts`,
  `src/composables/useThreeScene.ts` (ленивый `import('three')`, `MAX_ACTIVE_CONTEXTS = 2`,
  пауза по visibilitychange/IntersectionObserver, деградация по FPS, `dispose()`),
  `src/components/three/*Canvas.vue`. Конвенция: `three/` — чистые билдеры + юнит-тесты,
  канвасы — тонкие Vue-обёртки.
- **Состояния:** `components/{LoadingState,ErrorState,EmptyState,NotFoundState}.vue`,
  `components/platinum/ArchiveEmpty.vue`; стабильные `data-testid`: `loading`, `state-loading`,
  `empty`, `state-empty`, `error`, `not-found`, `archive-empty`, `fragment-row`, `platinum-story`.
- **Команды верификации (из `frontend/`):**
  - `npm run verify:3d` (116 структурных проверок — не должны падать)
  - `npm run verify:motion` (47 проверок motion-системы — не должны падать)
  - `npm run lint` (`eslint --max-warnings 0`)
  - `npm run build` (`vue-tsc --noEmit` + `vite build`)
  - `npm run test` (vitest; сейчас 69 файлов / 1074 теста — покрытие только растить)
- **Грабли:**
  - `verify:3d` жёстко проверяет `network.ts` (`TorusGeometry`, `setStoryCount`, `Raycaster`,
    `lostNode`, `pulseAt`, `sendReply`), `sceneState.ts` (5 режимов + `onSceneEvent`/`emitSceneEvent`),
    `PlatinumView.vue` (`setStoryCount` + `listPlatinumStories`), роуты (`scene: 'platinum'`), three в manualChunks.
  - `verify:motion` запрещает: `transition: all`, сырые `cubic-bezier(...)`/`NNms`, `transform: scale(...)`
    в `:hover`, дубли `@keyframes`, локальные копии токенов палитры, вечный `will-change`,
    локальные объявления ритмов. Любая правка CSS обязана это учитывать.
  - `sceneState.ts` — общий файл: новые поля/события только АДИТИВНО, существующие экспорты не переименовывать.
  - `prefersReducedMotion()` + `@media (prefers-reduced-motion: reduce)` — обязательны.
  - Мок `defineAsyncComponent` в vitest требует `__esModule: true`.
  - `data-testid` не удалять и не переименовывать.

## Железные правила QA (для всех задач)

1. **Никаких правок UI «на глаз».** Сначала снимок/замер → потом вывод → потом правка.
   Каждое замечание должно иметь: маршрут, вьюпорт, координаты/селектор, что именно не так, как
   исправлено, чем проверено.
2. **Реальный браузер обязателен.** Правка считается проверенной только если: (а) сделана в реальном
   Chrome через CDP-харнесс (Q-T1), (б) сделан новый снимок ДО/ПОСЛЕ, (в) дефект на новом снимке исчез,
   (г) остальные проверки зелёные. «На глаз по коду» — не проверка.
3. **Фикстуры детерминированы.** Никаких дат «сейчас», случайных id, Math.random в фикстурах —
   иначе снимки нельзя сравнивать.
4. **Ничего не «для галочки».** Мёртвый код, заглушки и «зелёные» проверки, которые ничего не
   проверяют, — хуже, чем их отсутствие. Guard должен ловить реальный дефект (проверяй мутацией).
5. **Бюджет ресурсов:** не добавлять ни одного постоянного слушателя/таймера/rAF-цикла;
   3D-контексты — в рамках `MAX_ACTIVE_CONTEXTS = 2`.

## Общие правила для каждого субагента

- Работать автономно, вопросы не задавать. Сначала прочитать этот PLAN.md, потом целевые файлы
  и соседние с ними — чтобы соблюсти стиль (комментарии по-русски объясняют «почему»).
- НЕ коммитить и НЕ пушить. Не трогать файлы вне списка своей задачи. Не трогать PLAN.md и
  `results/` других задач. Один файл = один владелец в батче.
- После правок прогнать (из `frontend/`): `npm run verify:3d && npm run verify:motion && npm run lint
  && npm run build && npm run test` и починить последствия СВОИХ правок.
- Не расширять scope; идеи — в FOLLOWUPS.
- Отчёт строго по формату промпта + обязательно `results/<TASK-ID>.md`.

## Задачи

### Фаза 1 — Харнесс: реальный браузер, фикстуры, перф-проба

- [ ] Q-T1. Browser QA харнесс — `frontend/scripts/browser-qa.mjs` (new), `frontend/scripts/qa-fixtures.mjs` (new).
      Сделать РАБОЧИЙ, воспроизводимый инструмент на голом Node (зависимости не добавлять!):
      (1) **CDP-клиент:** встроенный в Node `WebSocket` (Node ≥ 22) + `fetch` к `http://127.0.0.1:<port>/json/*`.
      Подключение к уже запущенному Chrome ИЛИ запуск своего: ищи Chrome в
      `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `google-chrome`, `chromium`,
      `CHROME_PATH` из env. Флаги для 3D в headless: `--headless=new --hide-scrollbars
      --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader --remote-debugging-port=0`
      (проверено: WebGL 2.0 работает через SwiftShader).
      (2) **Перехват API:** через CDP `Fetch.enable` подменять запросы на `http://localhost:8000/api/v1/*`
      ответами из `qa-fixtures.mjs` (детерминированные данные: доски, треды, посты, платинум,
      телеметрия, упоминания, анонсы, поиск). Режимы фикстур: `ok` (данные есть), `empty` (пустые
      списки), `error` (500 на выбранных эндпоинтах), `offline` (сетевая ошибка).
      (3) **Обход маршрутов:** CLI-флаги `--routes=/,/platinum,...`, `--viewport=desktop|mobile|narrow`
      (1440×900, 390×844, 320×720), `--out=<dir>`, `--mode=ok|empty|error|offline`, `--wait=ms`.
      Для каждого маршрута: скриншот PNG, console-ошибки/варнинги, page errors, неудачные запросы,
      тайминги (DOMContentLoaded, load), «первый кадр» (когда в DOM появился контент вью).
      (4) **Артефакты:** `frontend/.qa-artifacts/` (добавить в `.gitignore`!), структура
      `<out>/<viewport>/<route-slug>[-<mode>].png` + `report.json` (сводка по всем маршрутам).
      (5) Скрипт обязан работать: `node scripts/browser-qa.mjs --routes=/ --viewport=desktop` →
      PNG на диске + `report.json`; при отсутствии Chrome — понятная ошибка и код выхода 1.
      (6) Никаких изменений в `src/` на этом этапе (инструмент — отдельный слой).
      | Файлы: `frontend/scripts/browser-qa.mjs` (new), `frontend/scripts/qa-fixtures.mjs` (new), `.gitignore` | deps: none | size: L
- [ ] Q-T2. Перф-проба — `frontend/scripts/perf-audit.mjs` (new) на том же CDP-клиенте:
      (1) **FPS/frame-time:** измерять в реальном времени (НЕ virtual-time) окном ≥ 3 с: считать
      кадры через `requestAnimationFrame`, отсчитывать время до первого содержательного кадра
      (появление вью-контента), p50/p95 frame-time; снимать при переходе между маршрутами.
      ВАЖНО: headless идёт на SwiftShader (программный рендер) — FPS там НЕ показателен для реального
      железа; измерять относительные вещи (стабильность, деградация, отсутствие «провалов»),
      а абсолютные числа помечать как software-renderer.
      (2) **Память:** `performance.memory` (usedJSHeapSize) — снимок после каждого маршрута;
      «утечка» = рост heap при 5–10 повторных переходах назад и вперёд (порог зафиксировать в отчёте).
      (3) **WebGL:** через `WEBGL_debug_renderer_info` — renderer/версия/DPR; плюс счётчики three.js:
      добавить в приложение НЕЛЬЗЯ без согласования — вместо этого снимать `renderer.info` через
      публичный доступ? Если публичного доступа нет — считать через перехват `WebGLRenderingContext`
      вызовов (drawElements/drawArrays/createTexture/createBuffer) с подсчётом: это честный и внешний
      способ, не требующий правок приложения.
      (4) **Контексты:** считать `WEBGL_lose_context`/активные контексты (Chrome: `chrome://gpu` недоступен —
      использовать перехват `getContext('webgl2')`), фиксировать, сколько контекстов создаётся при
      навигации (лимит проекта — `MAX_ACTIVE_CONTEXTS = 2`).
      (5) Вывод: `frontend/.qa-artifacts/perf/report.json` + человекочитаемый отчёт в консоли.
      | Файлы: `frontend/scripts/perf-audit.mjs` (new) | deps: Q-T1 | size: M

### Фаза 2 — Съёмка и анализ (правок в `src/` на этом этапе НЕТ)

- [ ] Q-T3. Desktop-съёмка и визуальный разбор — артефакты + находки.
      Снять ВСЕ маршруты и состояния в desktop (1440×900) и wide (1920×1080): home, board, thread,
      platinum, platinum story, about, stats, moderation, 404, плюс состояния loading/error/empty
      (через режимы фикстур Q-T1) и оверлеи (Command Lens, Launch Bay, Report Probe, Scan Lens,
      Watch Panel, Drafts). Каждый снимок ПРОСМОТРЕТЬ (Read по PNG) и разобрать по чек-листу:
      композиция и иерархия, выравнивание и ритм отступов, типографика (кегль/трекинг/мера/контраст),
      цвет и «один акцент», плотность, дешёвые эффекты (лишние тени/свечения/градиенты/«эффекты ради
      эффекта»), разрывы анимаций (элемент, застрявший в стартовом состоянии — `opacity: 0`,
      съехавший transform), переполнения, обрезанный текст, «плавающая» вёрстка.
      Результат: `frontend/.qa-artifacts/findings/Q-T3-desktop.md` — нумерованный список находок
      (ID, маршрут, вьюпорт, селектор, суть, severity: blocker|major|minor, предложение).
      | Файлы: `frontend/.qa-artifacts/findings/Q-T3-desktop.md` (new) | deps: Q-T1 | size: L
- [ ] Q-T4. Mobile-съёмка и визуальный разбор (390×844 и 320×720): те же маршруты и состояния.
      Чек-лист: горизонтальные переполнения (скролл по X), тач-таргеты (< 44px — отметить),
      читаемость (кегль, мера строки, длинные слова), 3D-слой не перекрывает контент,
      шапка/подвал на узком экране, модалки (Launch Bay, Command Lens) на 320px, composer (Signal Dock)
      на мобильном, кегль mono-микро-лейблов, состояния без layout shift.
      Результат: `frontend/.qa-artifacts/findings/Q-T4-mobile.md` — тот же формат.
      | Файлы: `frontend/.qa-artifacts/findings/Q-T4-mobile.md` (new) | deps: Q-T1 | size: L
- [ ] Q-T5. Аудит 3D/WebGL — `frontend/.qa-artifacts/findings/Q-T5-webgl.md`.
      По маршрутам: сколько контекстов, сколько draw calls/текстур/геометрий, растёт ли счётчик при
      навигации (утечка), есть ли `dispose()` на unmount, что происходит при `quality: low|off`,
      как ведёт себя сцена при быстрой навигации (гонка инициализации), «прыгает» ли камера,
      читается ли архив без указателя, не «мигает» ли фон. Плюс: «дешёвые эффекты» в 3D
      (однотонкие материалы, отсутствие тени/глубины, шум ценой кадров, additive-глоу без причины).
      Использовать перф-пробу Q-T2. Результат — находки того же формата + числа.
      | Файлы: `frontend/.qa-artifacts/findings/Q-T5-webgl.md` (new) | deps: Q-T1, Q-T2 | size: L
- [ ] Q-T6. Аудит анимаций и консистентности — `frontend/.qa-artifacts/findings/Q-T6-motion.md`.
      (1) Снять серию кадров (0/100/300/600/1200 мс) на ключевых переходах (появление треда, открытие
      модалки, переход маршрута, раскрытие панели) и проверить: нет ли «прыжка» в финальном кадре,
      нет ли элемента, застрявшего вне маски/за `opacity: 0`, нет ли двойной анимации одного свойства
      (CSS + GSAP), нет ли `transition: all` (проверка guard'ом), нет ли анимации `box-shadow` на крупных
      поверхностях, нет ли вечных `will-change`, все ли `prefers-reduced-motion` ветки дают статичный кадр.
      (2) Консистентность: одинаковые ли отступы/радиусы/рамки у кнопок и панелей на всех вью,
      одинаковы ли микро-лейблы, единый ли «приборный» язык состояний, не разъезжаются ли заголовки.
      | Файлы: `frontend/.qa-artifacts/findings/Q-T6-motion.md` (new) | deps: Q-T1 | size: L

### Фаза 3 — Исправления находок (по отчётам Q-T3…Q-T6)

- [ ] Q-T7. Правки: главная, разделы, шапка/подвал — по находкам Q-T3/Q-T4/Q-T6.
      Композиция, иерархия, ритм отступов, типографика, «дешёвые» эффекты, мобильная вёрстка.
      Каждая правка — с пометкой, какой ID находки закрывает; после правок — новый снимок ДО/ПОСЛЕ.
      | Файлы: `frontend/src/views/HomeView.vue`, `frontend/src/views/BoardView.vue`, `frontend/src/components/layout/AppHeader.vue`, `frontend/src/components/layout/AppFooter.vue`, `frontend/src/components/ui/BoardCard3D.vue`, `frontend/src/components/ui/DepthCard.vue` | deps: Q-T3, Q-T4, Q-T6 | size: L
- [ ] Q-T8. Правки: тред, композер, запуск, жалоба, сканер — по находкам Q-T3/Q-T4/Q-T6.
      | Файлы: `frontend/src/views/ThreadView.vue`, `frontend/src/components/thread/*.vue`, `frontend/src/components/composer/*.vue`, `frontend/src/components/launch/LaunchBay.vue`, `frontend/src/components/report/ReportProbe.vue`, `frontend/src/components/scan/ScanLens.vue` | deps: Q-T3, Q-T4, Q-T6 | size: L
- [ ] Q-T9. Правки: платинум, 3D-сцена, WebGL/память — по находкам Q-T5 + Q-T3/Q-T4.
      ВАЖНО: публичный API `buildArchiveSpace` и контроллера НЕ ЛОМАТЬ (guard'ы и тесты),
      `verify:3d`/`verify:motion` должны остаться зелёными. Проверить: утечки геометрий/материалов,
      число контекстов, деградация по FPS, поведение при быстрой навигации.
      | Файлы: `frontend/src/three/archive/*.ts`, `frontend/src/three/network.ts`, `frontend/src/three/warps.ts`, `frontend/src/components/three/*.vue`, `frontend/src/composables/useThreeScene.ts`, `frontend/src/views/PlatinumView.vue`, `frontend/src/views/PlatinumStoryView.vue` | deps: Q-T5 | size: L
- [ ] Q-T10. Правки: состояния, модалки, служебные вью — по находкам Q-T3/Q-T4/Q-T6.
      Единый язык состояний (loading/error/empty/404/оффлайн), модалки на мобильном,
      about/stats/moderation — композиция и консистентность.
      | Файлы: `frontend/src/components/{LoadingState,ErrorState,EmptyState,NotFoundState}.vue`, `frontend/src/components/ui/*.vue`, `frontend/src/views/{AboutView,StatsView,ModerationView,NotFoundView}.vue` | deps: Q-T3, Q-T4, Q-T6 | size: L

### Фаза 4 — Visual regression + перф-бюджет

- [ ] Q-T11. Воспроизводимые visual regression checks — `frontend/scripts/visual-regression.mjs` (new),
      `frontend/scripts/png.mjs` (new — свой PNG-декодер/энкодер на `node:zlib`, без зависимостей!),
      базовые снимки `frontend/tests/visual/baselines/<viewport>/<route>.png`,
      npm-скрипты в `frontend/package.json` (`verify:visual`, `verify:visual:update`).
      Требования: (1) свой PNG-ридер (IHDR/IDAT, unfilter 0–4) и писатель; (2) сравнение по пикселям
      с порогом «доля изменившихся пикселей» (по умолчанию 0.1%) и допуском по цвету; (3) при расхождении
      писать `diff-картинку` (подсветка изменившихся пикселей) рядом с отчётом; (4) отчёт: список
      маршрутов, что разошлось, сколько пикселей; (5) `--update` перезаписывает базу;
      (6) режим без Chrome → понятный exit code 1 и объяснение, а не «зелёный» прогон;
      (7) базовые снимки — ДЕТЕРМИНИРОВАННЫЕ (фикстуры Q-T1, без анимаций в моменте съёмки:
      снимать ПОСЛЕ завершения анимаций или в reduced-motion-режиме, иначе diff будет шумным).
      ВАЖНО: `package.json` в этой задаче — твой; больше никто его в этом батче не трогает.
      | Файлы: `frontend/scripts/visual-regression.mjs` (new), `frontend/scripts/png.mjs` (new), `frontend/tests/visual/baselines/**` (new), `frontend/package.json` | deps: Q-T1, Q-T3, Q-T4 | size: L
- [ ] Q-T12. Перф-бюджет и его проверка — `frontend/scripts/perf-budget.mjs` (new):
      читает `frontend/.qa-artifacts/perf/report.json` (из Q-T2) и проверяет пороги, объявленные
      как константы в самом скрипте и продублированные в `docs/ART_DIRECTION.md`:
      (1) память: рост heap за цикл навигации ≤ порога; (2) 3D: число активных WebGL-контекстов ≤ 2;
      (3) draw calls/текстуры — не растут при повторных переходах; (4) «первый содержательный кадр»
      ≤ порога (мс) на software-рендерере — с явной пометкой, что это software-рендерер;
      (5) отсутствие ошибок/исключений в консоли на всех маршрутах.
      Вывод: PASS/FAIL по каждому порогу с числами. `package.json` НЕ трогать (владелец — Q-T11).
      | Файлы: `frontend/scripts/perf-budget.mjs` (new) | deps: Q-T2, Q-T9 | size: M
- [ ] Q-T13. Тесты харнесса — `frontend/scripts/__tests__/` (или `frontend/src/**/__tests__` по конвенции
      проекта) на чистые части: PNG-декодер (свой round-trip), порог сравнения, разбор `report.json`,
      фикстуры (детерминированность: два вызова дают одинаковые данные; нет `Date.now()`/`Math.random()`),
      разбор аргументов CLI. Тесты БЕЗ браузера (юнит), чтобы `npm run test` не зависел от Chrome.
      | Файлы: `frontend/scripts/__tests__/*.spec.ts` (new) | deps: Q-T11, Q-T12 | size: M
- [ ] Q-T14. Документация и финальная приёмка — `docs/ART_DIRECTION.md` (раздел «Visual QA»:
      как снимать, как читать находки, что считается дефектом), `docs/PROJECT_NEXT_AUDIT.md`
      (запись раунда: что нашли, что исправили, какие числа до/после, что осталось).
      Плюс: инструкция в `README.md` или `docs/` — как запустить QA локально (команды).
      | Файлы: `docs/ART_DIRECTION.md`, `docs/PROJECT_NEXT_AUDIT.md`, `README.md` | deps: Q-T7, Q-T8, Q-T9, Q-T10, Q-T11, Q-T12 | size: M

## Прогресс

- 2026-10-21 11:50 старт волны 3; волны 1 («Archive Space») и 2 («Motion system») закрыты и заархивированы
- 2026-10-21 11:50 Гейты Фазы 0: каталоги ✅, slug `opencode-go/minimax-m3.1-flash-free` ✅, Chrome найден ✅,
  WebGL 2.0 в headless через SwiftShader ✅ (проверено вручную), smoke CLI — запущен
- 2026-10-21 11:50 батч 1 запущен: Q-T1 (харнесс + фикстуры)
- 2026-10-21 12:05 батч 1 DONE (Q-T1): рабочий харнесс на голом Node (CDP + встроенный WebSocket), детерминированные фикстуры, 4 режима, 4 вьюпорта, счётчик WebGL-контекстов. Побочные сигналы: 3 WebGL-контекста на главной при лимите 2; ширина документа 456 px при вьюпорте 390 (переполнение)
- 2026-10-21 12:10 батч 2 запущен: Q-T2 (перф-проба), Q-T3 (desktop-аудит), Q-T4 (mobile-аудит), Q-T6 (анимации/консистентность)
- 2026-10-21 14:05 батч 2: Q-T2 DONE (перф-отчёт: +7.9 текстуры/цикл — утечка, 6 холстов «рисуют пустоту», heap +211 КБ/цикл, 3 контекста на `/`), Q-T4 DONE (38 мобильных находок), Q-T6 DONE (9 находок по анимациям). Q-T3 УПАЛ на таймауте провайдера (300 с) ДО записи отчёта — снимки уже сняты, повтор без пересъёмки
- 2026-10-21 14:05 батч 3 запущен: Q-T5 (аудит 3D/WebGL) + повтор Q-T3 (только разбор готовых снимков)
- 2026-10-21 23:20 батч 3 DONE: Q-T5 нашёл 12 находок по 3D/WebGL, из них blocker'ы: клик по строке архива намертво вешает вкладку (бесконечный router.push из beforeEach) и «инженерная сеть»/«архивное пространство» вообще не рисуются (buildNetwork создаёт свои Scene/Camera, а useThreeScene рисует свои — 0 draw-call'ов). Q-T3 (повтор) закрыт: находки по desktop
- 2026-10-21 23:22 батч 4 запущен: Q-T9 (правки 3D/WebGL), Q-T7 (правки главной/разделов/шапки), Q-T8 (правки треда/композера/инструментов), Q-T10 (правки состояний/модалок/служебных вью) — файлы не пересекаются
- 2026-10-22 10:05 ИНЦИДЕНТ: машина перегружена (пик load 118: 6 vitest-воркеров на агента + restart-loop чужих docker-контейнеров) — три из четырёх агентов (Q-T7, Q-T9, Q-T10) упали с «Failed to execute statement»/SSE-timeout, не дописав отчёты. Q-T8 продолжает работу. Решение: дальше по одному агенту, тесты запускать с `--maxWorkers=2 --minWorkers=1`; сиротские vitest-процессы (PPID=1) убиты
- 2026-10-22 10:05 чекпоинт: правки Q-T7/Q-T9/Q-T10 (частично) в дереве; verify:3d 116/116, verify:motion 47/47, lint 0, build OK, test 69 файлов / 1084 теста. Тест «opens the story the space asked for» кодировал дефект Q-W-01 (навигация из сцены) — переписан главным агентом на новый контракт: сцена только помечает фрагмент, навигацией владеет вью

## Проблемы / заблокировано

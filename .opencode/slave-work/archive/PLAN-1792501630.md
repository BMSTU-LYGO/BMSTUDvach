# Slave Work Plan — Переосмысление основных форм: Signal Dock / Launch Bay / Report Probe

- Статус: complete
- Модель субагентов: `opencode-go/step-5-preview-free`
- Запуск: 2026-10-15 (волна 4)
- Engine: task, parallel: 6, waves: 1

## Цель (одной строкой)

Довести три основные пользовательские формы (ответ = Signal Dock, создание треда = Launch Bay, жалоба = Report Probe) до авторского UX: убрать остатки accordion/dropdown/прямоугольных controls/стандартных dropzone, выстроить безупречную классификацию и отображение API-ошибок, гарантировать сохранение черновиков во всех трёх формах.

## Контекст для субагентов

- **Стек:** Vue 3 + TS + Vite + Pinia + GSAP + Three.js. Frontend-only работа (backend не трогаем, но читаем для контракта ошибок).
- **Текущее состояние форм (построено волнами 1–2, контракт SIGNAL-01):**
  - `components/composer/SignalDock.vue` (~900 строк) — ответ в треде. Пишит в `useDraft('signal-<threadId>')`. Родитель (ThreadView) ждёт API и отвечает props `submitting/submitError/successToken`. Есть CommandLens (⌘K, `/`), AttachmentRail (cargo), DraftBeacon, SignalMeter, TransmitControl, ContextFiber (нить пост→док), drag-intake «вуаль» (УБРАТЬ).
  - `components/launch/LaunchBay.vue` (~500 строк) — создание треда в BoardView, morph trigger→bay через `captureMorph/playMorph` (`composables/usePageMorph.ts`). Черновик `draft:launch-<slug>` (title+body). СЕЙЧАС тёмная скруглённая «карточка» — вне paper/ink направления, пере-шкурить.
  - `components/report/ReportProbe.vue` + `ReasonConstellation.vue` — жалоба: радиальная консителляция 5 причин (арка+нити), stage2 с ГОЛЫМ `<textarea>` (заменить на SignalSurface), без черновика (ДОБАВИТЬ).
  - `views/ThreadView.vue` (~1135 строк) — reply/report оркестрация: `postError/reportError` строки, `apiErrorMessage()` из `api/client.ts`. ВАЖНО: `emitSceneEvent({ type: 'reply' })` и события `composer-focus/composer-blur/report-open/report-submit/thread-launch` — не ломать (guard в verify:3d).
  - `views/BoardView.vue` — создание: `handleCreate` + createdError строка; правила раздела с аккордеон-кнопкой «показать/свернуть» (УБРАТЬ); `view-switch` — два одинаковых прямоугольных toggle (ПЕРЕОСМЫСЛИТЬ); `SortLens` уже кастомный.
  - `composables/useDraft.ts` — localStorage-буфер, debounce 500ms, `listDrafts()` видит ТОЛЬКО `draft:signal-<digits>`; файлы не сериализуются (files всегда []); нет flush при закрытии вкладки.
  - `api/client.ts` — `ApiRequestError{status, errors}`, `apiErrorMessage()` (поле detail+errors).
- **Бэкенд-контракт ошибок (прочитать перед классификацией):** DRF throttle 429 с `detail: "Request was throttled. Expected available in N seconds."` (scopes: post_create 120/hour, thread_create 30/hour, report_create 60/hour — `backend/config/settings/base.py`); 400 `{detail:"Validation error", errors:{field:[msgs]}}`; блокировка треда/auto-lock — проверить `backend/api` на 403/409; загрузка файлов — magic-bytes rejection приходит как 400 field-сообщение.
- **Палитра/художественный язык:** engineering network, paper/ink: `--paper-raised`, `--ink`, `--accent` (#2F4F4E), `--danger`, `#d4882a` amber, JetBrains Mono / Cormorant Garamond / Inter. LaunchBay сейчас использует тёмные токены (`--bg-deep`) — это дрейф, унифицировать под paper/ink.
- **Команды верификации (запускать из `frontend/`):**
  - `npm run verify:3d` (46 checks, статические)
  - `npm run lint` (eslint --max-warnings 0)
  - `npm run build` (vue-tsc + vite build)
  - `npm run test` (vitest run; существующие specs в `*/__tests__/` — обновлять под свои изменения, не удалять покрытие)
- **Грабли:**
  - Три формы уже используют контракт `submitting/submitError/successToken` — менять его аккуратно и последовательно (сначала foundation-задачи, потом потребители).
  - ThreadView.vue — общий файл для reply и report; не переписывать целиком, точечные правки.
  - Tests в `frontend/src/**/__tests__/` завязаны на data-testid — сохраняй существующие testid (`signal-dock`, `dock-error`, `launch-bay`, `launch-error`, `report-probe`, `probe-error`, `probe-stage-2`, `launch-title`).
  - Files нельзя хранить в localStorage — храним только метаданные (имя/размер) и честно показываем, что вложения при восстановлении нужно приложить заново.
  - `prefers-reduced-motion` — уважать во всех новых анимациях. Mobile 320px+ — проверять layout.

## Общие правила для каждого субагента

- Работать автономно, вопросы не задавать.
- Сначала прочитать PLAN.md (этот файл) и затронутые файлы + соседние; следовать конвенциям.
- Не коммитить и не пушить. Не трогать файлы вне списка задачи. Не менять PLAN.md и `results/` других задач.
- Не добавлять зависимостей — только `package.json` как есть.
- После правок прогнать: `cd frontend && npm run verify:3d && npm run lint && npm run build && npm run test` — и починить последствия СВОИХ правок (pre-existing падения — зафиксировать в отчёте).
- Отчёт строго по формату промпта, обязательно записать `results/<TASK-ID>.md`.
- Не расширять scope; идеи — в FOLLOWUPS.

## Задачи

### Фаза 1 — Фундамент: классификация ошибок и целостность черновиков

- [x] P1-T1. Таксономия ошибок `api/errors.ts` — `classifyError(err) → TransmitError{kind:'offline'|'throttle'|'validation'|'tooLarge'|'locked'|'notFound'|'server'|'unknown', messageRu, retryAfterSec?, fields?}`; парсинг DRF-throttle секунд; offline-детект; русские сообщения; unit-тесты таблицей. | Файлы: `src/api/errors.ts` (new), `src/api/client.ts` (ре-экспорт/мелкая правка), `src/api/__tests__/errors.spec.ts` (new) | Приёмка: тесты зелёные; ни один kind не «Failed to fetch» | deps: none | size: M
- [x] P1-T2. `useTransmit` + `TransmitNotice` — composable оркестрации submit (submitting/error/successToken/lastInput/retry(), авто-retry при возврате в сеть) + единый inline-узел ошибки с kind-специфичным UI (countdown 429 «повтор через Nс», offline «сеть недоступна…», validation — по полям, retry-кнопка); a11y role=alert/aria-live. | Файлы: `src/composables/useTransmit.ts` (new), `src/components/composer/TransmitNotice.vue` (new), тесты useTransmit (new) | deps: P1-T1 | size: M
- [x] P1-T3. Wiring ошибок в ThreadView+SignalDock+ReportProbe — заменить строковые postError/reportError на useTransmit+TransmitNotice; SignalDock принимает структурированную ошибку; ReportProbe получает `error: TransmitError|null` (временный pass-through до P3-T3); не трогать scene-события. | Файлы: `views/ThreadView.vue`, `components/composer/SignalDock.vue`, `components/report/ReportProbe.vue`, specs composer/report | deps: P1-T2, P3-T1a | size: M
- [x] P1-T4. Wiring ошибок в BoardView+LaunchBay — зеркало P1-T3 для создания треда: useTransmit, структурированная ошибка, field-mapping на title/body поверхности, авто-retry offline. | Файлы: `views/BoardView.vue`, `components/launch/LaunchBay.vue`, specs launch | deps: P1-T2 | size: M
- [x] P2-T1. Усиление `useDraft` — flush на `pagehide`, хранение метаданных файлов `files:[{name,size}]`, честный статус восстановления «текст восстановлен, вложения заново», тип-уточнения; тесты (debounce, flush, quota). | Файлы: `src/composables/useDraft.ts`, `src/composables/__tests__/useDraft.spec.ts` (создать/дополнить) | deps: none | size: M
- [x] P2-T2. Черновик жалобы — `draft:report-<postId>` (reason+comment), дебаунс-сохранение, silent restore (восстановил reason → сразу stage 2), очистка после success; DraftBeacon в пробе. | Файлы: `components/report/ReportProbe.vue`, spec report | deps: none | size: M

### Фаза 2 — (включена в фазу 1 как P2-*. Задачи идут общим потоком.)

### Фаза 3 — Переосмысление форм

- [x] P3-T1a. Интейк без dropzone — убрать «вуаль» `signal-dock__intake` и стандартные drag-состояния; вместо них: cargo-rail «раскрывается» при перетаскивании (узел растягивается, капсулы влетают с анимацией), тонкая кромка дока подсвечивается; paste/drop туда же. | Файлы: `components/composer/SignalDock.vue`, `components/composer/AttachmentRail.vue`, `components/composer/AttachmentCapsule.vue` | deps: none | size: M
- [x] P3-T1b. Инструментальный кластер дока — убрать 4 одинаковых rail-action кнопки (файлы/предпросмотр/sage/команды): команды/файлы живут в CommandLens (⌘K, `/`, кнопка-линза), sage — физический тумблер у маркера, preview — переключатель в углу поверхности; все aria + keyboard. | Файлы: `components/composer/SignalDock.vue`, `components/composer/CommandLens.vue`, specs | deps: P3-T1a, P1-T3 | size: M
- [x] P3-T1c. Пространственный док — док+нить как одна система: контекстный узел ответа живёт НА нити ContextFiber; при скролле к источнику док «причаливает» (edge-glow, desktop ≥1100px — dock смещён к левому краю колонки тред-ридера, mobile остаётся sheet); убрать ощущение «полосы снизу». | Файлы: `components/composer/SignalDock.vue`, `components/composer/ContextFiber.vue`, `views/ThreadView.vue` (только layout-обвязка дока) | deps: P3-T1b | size: L
- [x] P3-T2. Launch Bay: полнотеневая сцена — re-skin с тёмной карточки на paper/ink-направление; список доски «отходит» (opacity/blur/scale) когда бей открыт; kicker бей-сцены наследуется от кнопки триггера (shared-element morph усилить); onOpen emit scene-событие; без скруглённой модальной рамки на desktop. | Файлы: `components/launch/LaunchBay.vue`, `views/BoardView.vue`, spec launch | deps: P1-T4 | size: L
- [x] P3-T3. Морф «узел→анкер» в пробе — выбор причины не v-if-свчок: узел летит по нити в анкер stage2, остальные гаснут; textarea → SignalSurface; TransmitNotice встроен в сцену пробы; черновик (из P2-T2) трогать только чтобы не сломать. | Файлы: `components/report/ReportProbe.vue`, `components/report/ReasonConstellation.vue`, specs report | deps: P2-T2, P1-T3 | size: M
- [x] P3-T5. Причал без перекрытия — из FOLLOWUPS P3-T1c: на 1100–1500px sticky-колонка дока (~500px) может накрывать нижний левый угол ридера (max-width ридера 1000px). Зарезервировать левый жёлоб (grid-колонка/отступ контейнера) или сдвинуть колонку, чтобы док никогда не перекрывал посты; тесты-классы не ломать. | Файлы: ThreadView.vue (+DefaultLayout при необходимости) | deps: P3-T1c | size: S
- [x] P3-T4. Правила и коммутатор вида — убрать аккордеон «показать/свернуть»: правила — «rule sheet» (краевая заметка у /slug/, раскрывается линейной маской, один авторский жест, aria-expanded ок); view-switch: две прямоугольные кнопки → один узел-коммутатор list↔cluster с морфом формы и aria-pressed. | Файлы: `views/BoardView.vue`, (`components/thread/CatalogCard.vue` — только если нужен хук) | deps: P2-T3 | size: M
- [x] P2-T3. Черновики видны везде — `listDrafts` обобщить: сигналы + `draft:launch-<slug>` (title-превью, ссылка `/b/<slug>/?launch=1`); BoardView открывает бей по `?launch=1` (router.replace очистка); DraftsPanel показывает оба типа, delete работает по ключу. | Файлы: `src/composables/useDraft.ts`, `components/composer/DraftsPanel.vue`, `views/HomeView.vue`, `views/BoardView.vue`, specs | deps: P2-T1, P1-T4 | size: M

### Фаза 4 — Верификация и закрепление

- [x] P4-T1. Полный прогон и регрессии — verify:3d 46/46, lint 0, build, test все зелёные; досадить спеков на новое (throttle countdown, offline auto-retry, draft flush, restore честный лейбл); починить всё, что разъехалось между задачами. | Файлы: любые frontend (консолидация) | deps: P3-T1c, P3-T2, P3-T3, P3-T4, P2-T3, P1-T3, P1-T4 | size: M
- [x] P4-T2. Аудит-лог и финальный отчёт — запись раунда в `docs/` (аудит-лог, формат как в прошлых раундах) + `results/FINAL_SUMMARY.md`. | Файлы: `docs/…` (аудит-лог), results | deps: P4-T1 | size: S

## Порядок батчей (parallel ≤6)

- A: P1-T1, P2-T1, P3-T1a, P2-T2 (файлы не пересекаются)
- B: P1-T2 (после P1-T1), P1-T4, — P1-T3 ждёт P3-T1a (уже в A)
  B фактически: P1-T2 → затем C-начало; см. деппы, планировщик живой.
- Ориентир: A → B: P1-T2 → C: P1-T3, P1-T4, P3-T1a✅(уже) → D: P3-T1b, P3-T2, P3-T3, P2-T3 → E: P3-T1c, P3-T4 → F: P4-T1 → G: P4-T2

## Прогресс
- 2026-10-15 батч G/F: P3-T5, P4-T1, P4-T2 DONE главным агентом (модель субагентов вышла из доступа; согласовано с пользователем). Финал: verify:3d 46/46, lint 0, build OK, test 636/636. PLAN complete.
- 2026-10-15 батч F: P3-T4 DONE- 2026-10-15 батч F: P3-T4 DONE (код от прерванного агента + починка 5 спеков главной сессией; 632/632)
- 2026-10-15 батч E- 2026-10-15 батч E: P3-T1c, P2-T3 DONE (610/610, verify 46/46). FOLLOWUP P3-T1c → новая задача P3-T5.
- 2026-10-15 батч D- 2026-10-15 батч D: P3-T1b/T2/T3 DONE (часть кода прилетела от прерванных связей, принятые агенты проаудировали и докрепили; главная сессия верифицировала: 592/592, verify:3d 46/46, критерии-греены чистые)
- 2026-10-15 батч C- 2026-10-15 батч C: P1-T3, P1-T4 DONE (562 теста, verify:3d 46/46). Из FOLLOWUPS: run() возвращает неразличимый undefined; retry без side-effects; notice дока в свёрнутом стеке недостижим — учтено в P3-T1b.
- 2026-10-15 батч B- 2026-10-15 батч B: P1-T2 DONE (обрыв на отчёте, верифицировано: 546 тестов)
- 2026-10-15 батч A: P1-T1, P2-T1, P2-T2 DONE; P3-T1a DONE (субагент оборвался на отчёте, работа проверена главной сессией: 516/516, verify:3d 46/46)

- 2026-10-15 12:20 старт, Фаза 0 пройдена (engine=task, smoke OK), план создан

## Проблемы / заблокировано

- (пусто)

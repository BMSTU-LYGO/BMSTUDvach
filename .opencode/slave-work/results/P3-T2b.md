STATUS: DONE

FILES_CHANGED:
- frontend/src/views/PlatinumView.vue
- frontend/src/views/__tests__/PlatinumView.spec.ts

VERIFICATION:
- `npm run verify:3d` → OK, 46/46 structural 3D checks passed (включая `platinum feeds archive` = PlatinumView содержит `setStoryCount` и `platinum fetches stories` = содержит `listPlatinumStories`)
- `npm run lint` → OK, eslint --max-warnings 0, без замечаний
- `npm run build` → OK, `vue-tsc --noEmit` + `vite build` успешно (three в своём чанке, осталось только пред-существующее уведомление «chunks larger than 500 kB» для three)
- `npm run test` → OK, 59 test-файлов / 806 тестов passed (вью-спека: 22 теста, +7 новых кейсов; старые кейсы не удалены)
- `npx prettier --check` по обоим изменённым файлам → OK

SUMMARY:
`/platinum/` больше не переключает три разных generic-стейта (`LoadingState` / `ErrorState` / `EmptyState`) — все четыре тихих состояния архива теперь говорит один голос: `ArchiveEmpty` (P3-T2a) внутри сохранённой обёртки `div.archive-empty[data-testid="platinum-empty"]`.

1) Импорты и разметка. `LoadingState.vue`, `ErrorState.vue`, `EmptyState.vue` из вью убраны (неиспользуемый импорт = lint error), добавлен `import ArchiveEmpty from '@/components/platinum/ArchiveEmpty.vue'`. `computed` из списка импортов vue тоже убран — `emptyMessage` больше не существует. Четыре состояния:
   - loading → `<ArchiveEmpty mode="loading" :total="0" />`
   - error → `<ArchiveEmpty mode="error" :detail="error" @retry="load" />`
   - пустой результат при непустом `search` → `<ArchiveEmpty mode="search" :query="search" :total="total" @reset="resetSearch" />`
   - пустой результат без поиска → `<ArchiveEmpty mode="empty" :total="total" />`
   Обёртка `div.archive-empty[data-testid="platinum-empty"]` сохранена и теперь одинакова для всех четырёх состояний (единый архивный регистр); у списка историй обёртки нет, как и раньше. Ветка списка (`fragment-row`, `ol.fragments`, `archive-more`) не тронута.

2) Сцена отражает состояния (трёхмерные модули не правились):
   - loading → `setArchiveStories([])` в начале `load()` (уже было из P3-T1 — сверено, не продублировано): кольца дышат вхолостую;
   - error → `setArchiveStories([])` + новое `emitSceneEvent({ type: 'archive-clear' })` (событие из P1-T3), чтобы сцена забыла, что в ней было;
   - пустой набор после успешной загрузки → `setArchiveStories([])` через `syncArchive(result.results)` + `setStoryCount(0)` (было из P3-T1);
   - вход в `mode="search"` ничего не эмитит — только DOM-слой (reset вызывает обычный `load()`, который чистит набор, но не эмитит событий).

3) Сброс поиска. Новая функция `resetSearch()`: чистит `query` и `search`, сбрасывает `page` в 1 и заново зовёт `load()`. Чтобы `@reset` не превращался в двойной запрос, дебаунс-watch на `query` теперь сверяет обрезанное значение с текущим `search` и, если регистр тот же, не переспрашивает архив (`if (next === search.value) return`). Побочный эффект: очистка поля до значения, по которому уже спрашивали, больше не гоняет лишний запрос.

4) Без layout shift. `min-height` задан в scoped-стилях самого вью (`.archive-empty { min-height: 288px }` + мобильный `240px` в `@media (max-width: 640px)`), а не в компоненте — смена loading→empty/search не двигает страницу. Собственная паддинг-геометрия `ArchiveEmpty` не дублируется (прежний `padding: var(--space-10) 0 var(--space-12)` обёртки убран в пользу ровного контейнера).

5) Доступность сохранена. `ArchiveEmpty` сам ставит `role="status"` + `aria-live="polite"` в тихих состояниях, `role="alert"` в ошибке, `aria-busy="true"` при загрузке и `aria-labelledby` на свой заголовок — те же политики, что давали `LoadingState`/`ErrorState`/`EmptyState`. `archive-stats` с его `aria-live="polite"` не тронут. `@media (prefers-reduced-motion: reduce)` в вью сохранён без изменений (кольца/анимации `ArchiveEmpty` глушит собственный reduced-motion).

6) Не тронуто: `archive-stats`, поиск (`archive-search`, `#archive-search`), `loadMore` (+`archive-more`), `data-testid="fragment-row"`, focus-синхронизация из P3-T1 (`focusRow`/`releaseRow`/`revealRow`, `data-focused`), типографика чтения, мобильные брейкпоинты.

Тесты (новый блок «PlatinumView — the quiet states of the archive (P3-T2b)», 7 кейсов): loading-регистр (`archive-empty--loading`, `aria-busy`, нет строк); search-регистр (`archive-empty--search`, запрос в панели, есть кнопка сброса); `@reset` чистит поле, зовёт архив с `{ search: '' }` и перезапускает список с первой страницы (следующий load-more просит `page: 2`, а не `page: 3`); `@retry` переспрашивает архив и показывает строки; ошибка → событие `archive-clear` + пустой `archiveStories`; обёртка `platinum-empty` всегда на месте и содержит `archive-empty`. Старые кейсы «empty archive» / «failed request» переписаны под новый регистр (проверяют `archive-empty--empty` / `archive-empty--error`, `role="alert"` и текст ошибки) — сами сценарии не ослаблены, проверки стали строже. Ни один `data-testid` не потерялся: `fragment-row` и `platinum-empty` на месте, `empty`/`error` принадлежали удалённым из вью компонентам и заменены на `archive-empty*`.

BLOCKERS: нет

FOLLOWUPS:
- `archive-stats` и `ArchiveEmpty` в состоянии загрузки дублируют текст «Синхронизация архива…» в двух `aria-live`-регионах — при желании в P4-T1 (a11y) оставить объявление только в панели или развести формулировки.
- `setArchiveStories([])` на старте каждого `load()` сбрасывает `focusedStory`/`selectedStory` (сеттер чистит id, которых больше нет в наборе) — при поиске фокус 3D теряется до прихода ответа; можно чистить набор по флагу «первичная загрузка».
- `ArchiveEmpty` в режиме `empty` показывает только подсказку «Создай историю — она встанет в кольцо», но в роутере нет публичного маршрута создания истории; если такой маршрут появится, панельу стоит кормить слотом-действием (`#slot`).
- Пока сцена живёт в `network.ts` (P2-T4/P2-T5), реальные кольца рисует старый архив, а `archive/space.ts` использует `ringIndex` только в своей раскладке — после переезда стоит проверить, что `ringsFor` во вью и в сцене дают один порядок колец (сейчас — да, оба считают через `ringsFor`).
- Кейста «reduced motion → без плавного скролла» в вью-спеке по-прежнему нет (мок `prefersReducedMotion: () => false`); добавить его стоит вместе с P4-T1.

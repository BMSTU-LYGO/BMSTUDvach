ЗАДАЧА: P3-T2b. Empty/loading/error-хореография архива в `src/views/PlatinumView.vue`
ЦЕЛЬ ПРОЕКТА: `/platinum/` как самостоятельное интерактивное Three.js Archive Space,
включая красивый empty state; чтение и API-интеграция сохранены.
ПРОЕКТ: /Users/timofey/Developer/Личные_проекты/BMSTUDvach, стек: Vue 3 + TS + Vite + Three.js + GSAP.

КОНТЕКСТ: прочитай `.opencode/slave-work/PLAN.md` (разделы «Контекст для субагентов»,
«Общие правила», P3-T1/P3-T2a/P3-T2b). Затем прочитай:
- `src/views/PlatinumView.vue` (после P3-T1: уже есть `setArchiveStories`, focus-синхронизация,
  `data-testid="fragment-row"`, `platinum-empty`, `emptyMessage`, `LoadingState/ErrorState/EmptyState`);
- `src/components/platinum/ArchiveEmpty.vue` (готовый presentational-компонент из P3-T2a:
  props `mode/query/total/detail`, emits `retry/reset`, testid'ы `archive-empty*`);
- `src/components/LoadingState.vue`, `ErrorState.vue`, `EmptyState.vue` (что именно они
  рисуют — чтобы замена не потеряла a11y и текст);
- `src/three/sceneState.ts` (событие `archive-clear`, `setArchiveStories`, `focusStory`);
- `src/views/__tests__/PlatinumView.spec.ts` (нынешние тесты вью, их не удалять).

ЧТО СДЕЛАТЬ (править только `PlatinumView.vue` + его spec):
1. Заменить три generic-стейта архива на единый архивный регистр:
   - `loading` → `<ArchiveEmpty mode="loading" :total="0" />` (вместо `LoadingState`);
   - `error` → `<ArchiveEmpty mode="error" :detail="error" @retry="load" />` (вместо `ErrorState`);
   - пустой результат: `mode="search"` если `search.value` непустой (с `@reset` —
     очистить `query`/`search`, сбросить страницу и перезагрузить), иначе `mode="empty"`;
   - сохранить обёртку `div.archive-empty[data-testid="platinum-empty"]` (её проверяют
     тесты и `verify:3d` не проверяет, но смежные спеки — да) и положить компонент внутрь;
   - если `LoadingState/ErrorState/EmptyState` больше не используются в этом вью — убери
     импорты (unused import = lint error в этом проекте).
2. Сцена обязана отражать состояния (без правок трёхмерных модулей):
   - `loading` → `setArchiveStories([])` (голые дежурные кольца уже рисуются сценой);
   - `error` → `setArchiveStories([])` + `emitSceneEvent({ type: 'archive-clear' })`;
   - пустой набор после успешной загрузки → `setArchiveStories([])` (уже может быть сделано
     в P3-T1 — сверься и не дублируй);
   - при входе в `mode="search"` ничего не эмити, только DOM-слой.
3. Без layout shift: панель состояний занимает `min-height` (задать в scoped-стилях
   `.archive-empty`, не в компоненте), чтобы смена loading→empty не двигала страницу;
   `aria-live`-политей сохранены там, где он уже есть (`archive-stats` остаётся как есть).
4. Сохранить и не трогать: `archive-stats`, поиск (`archive-search`), `loadMore`,
   `data-testid="fragment-row"`, focus-синхронизацию из P3-T1, всю типографику чтения,
   mobile-брейкпоинты, `@media (prefers-reduced-motion: reduce)`.
5. Тесты (spec): `mode`-привязки (loading/error/search/empty рендерятся в нужном состоянии
   mock'ов `listPlatinumStories`), `@retry` вызывает повторную загрузку, `@reset` чистит
   поиск и перезагружает, `setArchiveStories([])` вызывается при ошибке, прежние кейсы
   зелёные, ни один `data-testid` не потерялся.

КРИТЕРИИ ПРИЁМКИ:
- `LoadingState/ErrorState/EmptyState` больше не импортируются вью архива; вместо них
  `ArchiveEmpty` во всех четырёх состояниях.
- `npm run verify:3d && npm run lint && npm run build && npm run test` зелёные.
- Изменены ровно 2 файла.

ВЕРИФИКАЦИЯ (из `frontend/`): `npm run verify:3d && npm run lint && npm run build && npm run test`

ГРАНИЦЫ: только `src/views/PlatinumView.vue` и `src/views/__tests__/PlatinumView.spec.ts`.
`ArchiveEmpty.vue`, `src/three/**`, канвасы, `verify-3d.mjs` — не трогать. Не коммитить.
PLAN.md не менять, вопросы не задавать, работай компактно.

ОТЧЁТ: финальное сообщение + полностью запиши в `.opencode/slave-work/results/P3-T2b.md`:
STATUS / FILES_CHANGED / VERIFICATION / SUMMARY / BLOCKERS / FOLLOWUPS.

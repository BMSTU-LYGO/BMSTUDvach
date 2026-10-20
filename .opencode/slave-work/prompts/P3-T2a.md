ЗАДАЧА: P3-T2a. Компонент `src/components/platinum/ArchiveEmpty.vue`
ЦЕЛЬ ПРОЕКТА: превратить `/platinum/` в самостоятельное интерактивное Three.js Archive Space (в том числе красивый empty state) с сохранением удобства чтения и текущего API.
ПРОЕКТ: /Users/timofey/Developer/Личные_проекты/BMSTUDvach, стек: Vue 3 + TS + Vite (работа только в `frontend/`).

КОНТЕКСТ: прочитай `.opencode/slave-work/PLAN.md` (разделы «Контекст для субагентов»,
«Общие правила», задачи P3-*). Затем прочитай: `src/views/PlatinumView.vue` (нынешний
empty/loading/error-рендер, `emptyMessage`-computed, `data-testid="platinum-empty"`,
классы `archive-*`), `src/components/EmptyState.vue`, `src/components/LoadingState.vue`,
`src/components/ErrorState.vue` (общие state-экраны и их props),
`src/components/report/ReasonConstellation.vue` и `src/components/composer/DraftBeacon.vue`
(если есть) — как в проекте делают самодостаточные presentational-компоненты с
`data-testid` и scoped-стилями на CSS-переменных, `docs/ART_DIRECTION.md` (регистр
«Редакционный архив»), соседние `__tests__/*.spec.ts` (формат тестов через @vue/test-utils).

ЧТО СДЕЛАТЬ:
1. Создать `frontend/src/components/platinum/ArchiveEmpty.vue` — presentational-панель
   состояний архива (без походов в API, без three-импортов, без store):
   - props: `mode: 'empty' | 'search' | 'error' | 'loading'` (дефолт `'empty'`),
     `query?: string` (дефолт `''`), `total?: number` (дефолт `0`), `detail?: string`
     (для error/loading — текст ошибки/подсказки);
   - emits: `retry` (кнопка «попробовать снова» видна только в `mode: 'error'`),
     `reset` (сброс поиска — видна в `mode: 'search'`);
   - содержимое по mode (русский текст в регистре архивного инструмента, без
     восклицаний, без emoji):
     - `empty`: заголовок-строка «Кольца вращаются вхолостую» + под строкой
       mono-подпись `fragments: 0 · orbits: 3 · vault: idle`; слот по умолчанию
       (для подсказки «создай историю»);
     - `search`: `По запросу «<query>» архив молчит.` + кнопка-ссылка «сбросить поиск»
       (эмит `reset`);
     - `loading`: заголовок «Синхронизация архива…» + три «орбиты» из CSS (concentric
       hairline-кольца с медленным вращением), aria-busy;
     - `error`: `detail || 'Архив недоступен.'` + кнопка «попробовать снова» (эмит `retry`);
   - a11y: `role="status"` (+ `aria-live="polite"`) для empty/search/loading,
     `role="alert"` для error; заголовки — `h2` c осмысленным id; кнопка — `<button
     type="button">` с `min-height: 44px` и `:focus-visible` outline (по образцу
     `.archive-more` в PlatinumView).
2. Стили — scoped, ТОЛЬКО на существующих CSS-переменных проекта (`--paper`, `--ink`,
   `--ink-secondary`, `--ink-tertiary`, `--rule`, `--accent`, `--accent-hover`,
   `--font-display`, `--font-body`, `--font-mono`, `--space-*`, `--duration-*`,
   `--ease-out`); НЕ вводить новых токенов и НЕ хардкодить цвета кроме уже
   используемых в архивном регистре (`#d4882a` amber — можно, он уже в проекте).
   Никаких скруглений «SaaS-карточка», никаких glow-теней кроме hairline.
   Layout shift: панель занимает фиксированную минимальную высоту (min-height) во всех
   режимах; кольца loading анимируются transform-ом (не size/position).
3. `@media (prefers-reduced-motion: reduce)` — отключить вращение колец и transition'ы.
4. `@media (max-width: 640px)` — панель читаема на 320px (перенос query-строки).
5. testid: корень `data-testid="archive-empty"`, плюс `archive-empty-title`,
   `archive-empty-caption`, `archive-empty-retry`, `archive-empty-reset`,
   `archive-empty-rings`.
6. Создать `frontend/src/components/platinum/__tests__/ArchiveEmpty.spec.ts` — тесты:
   каждый mode рендерит ожидаемый заголовок/подпись; `query` попадает в текст search;
   `retry`/`reset` эмитятся только в своих mode и только по клику; a11y-роли
   (`role=alert` на error, `role=status` на остальных); `slot` рендерится;
   `min-height`-класс присутствует (можно через `classes()`/computed style);
   отсутствие импорта three/store (проверка исходника: `readFileSync` + `expect(not contains)`).

КРИТЕРИИ ПРИЁМКИ:
- Файл самодостаточен: ни одного похода в сеть/стор/роутер; только props/emits/slot.
- Ни один существующий файл не изменён (P3-T2b подключит компонент позже).
- `npm run test`, `npm run lint`, `npm run build`, `npm run verify:3d` зелёные.

ВЕРИФИКАЦИЯ (из `frontend/`):
- `npm run verify:3d`
- `npm run lint`
- `npm run build`
- `npm run test`

ГРАНИЦЫ: создать только `src/components/platinum/ArchiveEmpty.vue` и
`src/components/platinum/__tests__/ArchiveEmpty.spec.ts` (+ каталог `__tests__`).
Не трогать `PlatinumView.vue`, `src/three/**`, `scripts/verify-3d.mjs`. Не коммитить/не пушить.
Не менять PLAN.md и чужие results. Вопросы не задавать.

ОТЧЁТ: выведи отчёт в финальном сообщении И запиши его целиком в
`.opencode/slave-work/results/P3-T2a.md`:
STATUS / FILES_CHANGED / VERIFICATION / SUMMARY / BLOCKERS / FOLLOWUPS.

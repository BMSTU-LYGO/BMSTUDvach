STATUS: DONE

FILES_CHANGED:
- frontend/src/components/platinum/ArchiveEmpty.vue (new)
- frontend/src/components/platinum/__tests__/ArchiveEmpty.spec.ts (new)
- frontend/src/components/platinum/__tests__/ (new dir)

VERIFICATION:
- `npm run verify:3d` → OK, 46/46 структурных 3D-проверок (архивные guard'ы не задеты: `PlatinumView.vue`, `src/three/**`, `scripts/verify-3d.mjs` не тронуты)
- `npm run lint` → OK, `eslint . --max-warnings 0`, без вывода
- `npm run build` → OK, `vue-tsc --noEmit` + `vite build` успешно (three остался в своём чанке `dist/assets/three-DVI_j9-M.js`; только пред-existing notice «chunks larger than 500 kB» для three)
- `npm run test` → OK, 56 файлов / 728 тестов passed (было 55/701 — +1 файл, +27 тестов, ничего не удалено)
- `npx prettier --check` по обоим новым файлам → «All matched files use Prettier code style»
- ручной прогон git status: изменены только два новых файла (+ каталог `__tests__`), ни один существующий файл проекта не тронут

SUMMARY:
Собран самодостаточный presentational-компонент `ArchiveEmpty.vue` — панель состояний архива в регистре «Редакционный архив» (docs/ART_DIRECTION.md), без походов в API/стор/роутер/three: единственный импорт — `computed` и `useId` из `vue`.

API компонента: props `mode: 'empty' | 'search' | 'error' | 'loading'` (дефолт `'empty'`), `query?: string` (дефолт `''`), `total?: number` (дефолт `0`), `detail?: string` (дефолт `''`); emits `retry` (только в `mode: 'error'`) и `reset` (только в `mode: 'search'`); слот по умолчанию — подсказка «Создай историю — она встанет в кольцо.» (в `empty`; в любом режиме слот контента вытесняет дефолт, контейнер слота скрыт, если контента нет).

Содержимое по режимам: `empty` — h2 «Кольца вращаются вхолостую» + mono-подпись `fragments: 0 · orbits: 3 · vault: idle` (число фрагментов берётся из `total`, состояние vault — idle/search/sync/error); `search` — `По запросу «<query>» архив молчит.` + кнопка-ссылка «сбросить поиск» (`reset`); `loading` — «Синхронизация архива…» + три CSS-кольца (концентрические hairline-пунктирные окружности, медленное вращение) + `aria-busy="true"` + опциональная подсказка из `detail`; `error` — `detail || 'Архив недоступен.'` в h2 + кнопка «попробовать снова» (`retry`).

a11y: корень — `role="status"` + `aria-live="polite"` для empty/search/loading и `role="alert"` для error; имя региона задаётся `aria-labelledby` на h2 с уникальным id (`useId()` → `archive-empty-title-*`); обе кнопки — `<button type="button">` с `min-height: 44px` и `:focus-visible` outline `2px solid var(--accent)` (по образцу `.archive-more` в PlatinumView).

Стили — scoped, только на существующих токенах (`--paper`, `--ink`, `--ink-secondary`, `--ink-tertiary`, `--rule`, `--accent`, `--accent-hover`, `--font-display`, `--font-body`, `--font-mono`, `--space-*`, `--duration-fast`, `--ease-out`); единственный хардкод — уже используемый в проекте amber `#d4882a` (узел vault и внутреннее кольцо). Без скруглений-карточек, без box-shadow/glow: панель оформлена hairline-правилами сверху и снизу. Layout shift закрыт фиксированным `min-height: 288px` (240px на мобильных) у корня во всех режимах; кольца вращаются только transform'ом (`@keyframes archive-orbit`, `rotate(0→360deg)`), без анимации width/height. `@media (prefers-reduced-motion: reduce)` — вращение и transitions отключены; `@media (max-width: 640px)` — панель читаема на 320px (`overflow-wrap: anywhere`, `hyphens: auto`, уменьшенные кегли).

testid: `archive-empty` (корень), `archive-empty-title`, `archive-empty-caption`, `archive-empty-retry`, `archive-empty-reset`, `archive-empty-rings`.

Тесты (`__tests__/ArchiveEmpty.spec.ts`, 27 кейсов): каждый mode рендерит ожидаемый заголовок/подпись; `query` попадает в текст search; `total` попадает в подпись; `retry`/`reset` эмитятся только в своих режимах и только по клику (плюс проверка, что в чужих режимах кнопок нет); a11y-роли (`role=alert` на error, `role=status` + `aria-live=polite` на остальных), `aria-busy` на loading, h2 c id и `aria-labelledby`; слот рендерится (и вытесняет дефолтный хинт, и работает в любом режиме); кольца (три штуки, `aria-hidden`) и transform-only анимация; min-height/44px/focus-visible/reduced-motion/640px — проверками исходника (`readFileSync`), как принято в `SignalDock.spec.ts`; самодостаточность — в исходнике нет импортов `three`, `@/stores`, `vue-router`, `@/api`, нет `fetch`/`axios`, единственный импорт — `vue`.

BLOCKERS: нет

FOLLOWUPS:
- P3-T2b: компонент отдаёт наружу `data-testid="archive-empty"`; внешний `platinum-empty` из `PlatinumView.vue` нужно сохранить — проще всего повесить его на обёртку вью (consumer решает, как именно: обёртка с `data-testid="platinum-empty"` вокруг `<ArchiveEmpty>`), сам компонент внешние testid не знает.
- Кольца рендерятся в режимах `empty` и `loading` (в `empty` они «вращаются вхолостую» — визуальная рифма с 3D-пустым режимом сцены). Если в P3-T2b сценарий потребует иначе — переключается одной строкой `showsRings` (компонент самодостаточен, правки локальны).
- В `error` режиме текст `detail` попадает в h2 (по спеке `detail || 'Архив недоступен.'`). Если API вернёт длинное сообщение, заголовок станет длинным — при желании стоит в P3-T2b ограничивать длину `detail` до 140 символов на стороне consumer'а.
- В `loading` режиме `detail` рендерится как отдельная подсказка под подписью; если consumer'у не нужен этот второй текст — достаточно не передавать `detail` в loading-режиме.
- Панель использует `useId()` (Vue 3.5) для id заголовка — в P3-T2b при переносе в `PlatinumView.vue` id останется уникальным, но нужно помнить, что внешний `aria-labelledby` вью на этот id опираться не должен (id принадлежит компоненту).
- Стоит в P4-T3 добавить в `verify:3d` структурную проверку на `src/components/platinum/ArchiveEmpty.vue` (существует + содержит `data-testid="archive-empty"` и `prefers-reduced-motion`) — по аналогии с проверками archive-space.

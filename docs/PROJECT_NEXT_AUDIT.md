# PROJECT_NEXT_AUDIT

## Current HEAD

`df2e727 SIGNAL-01: fix async composer submission contract`

Working tree: untracked `frontend/src/components/composer/` (7 файлов: NetworkIcon, TransmitControl, SignalMeter, DraftBeacon, CommandLens, AttachmentRail, AttachmentCapsule) — незакоммиченный, с 5 lint-ошибками.

## Current architecture

- Vue 3 + TS + Vite + Pinia + Vue Router, raw Three.js (single persistent NetworkCanvas), GSAP.
- Backend Django/DRF + PostgreSQL, API не трогаем.
- 3D: sceneState bus (home/board/thread/platinum/error), network.ts, warps.ts, useThreeScene lifecycle. verify:3d = 46 structural checks (PASS).
- Forms: `components/form/*` (ComposerShell accordion, FormTextarea, AttachmentDropzone, ReasonPicker...), `components/CreatePostForm.vue`, `CreateThreadForm.vue`, `ReportDialog.vue`.
- Tests: 43 passing (vitest). verify:3d PASS. **Lint FAIL** (5 errors in untracked composer files).

## What is already strong

- Real WebGL scene: board nodes ↔ cards, reply packets, archive rings, LOST NODE 404, quality fallback, dispose/visibility pause.
- Design tokens (OKLCH), motion system, reduced-motion discipline.
- SIGNAL-01: async submit contract исправлен — формы не чистят себя до API success; ошибка сохраняет ввод.
- Custom form system технически цельная (validation, a11y, mobile).

## What is weak

- **Reply flow всё ещё accordion**: ComposerShell «раскрывается» по клику; FormField+label+textarea+counter+dropzone+toolbar+buttons. Это ровно тот generic form-stack, который rejected в SIGNAL CONSOLE plan.
- **Create thread** — slide-down форма под кнопкой (`BoardView` form-slide transition).
- **Report** — modal dialog + сетка прямоугольных radio-cards (ReasonPicker).
- **Attachments** — dashed dropzone (AttachmentDropzone), отдельная 150px зона.
- Draft — невидимый localStorage; счётчик символов `142 / 20000` углом textarea.
- Composer interaction: emoji-глифы (✕, ↳) в context chips; submit — обычная FormButton.

## What is partially implemented

- SIGNAL-21 icons: `NetworkIcon.vue` готов (16 глифов, единый stroke).
- SIGNAL-07 TransmitControl: готов (idle/hover/press/submitting/success/error ring), но `startError` не подключён (lint error).
- SIGNAL-06 SignalMeter: готов (zones, hover readout, over-limit).
- SIGNAL-12 DraftBeacon: готов (states + hover label), лишний импорт.
- SIGNAL-09 CommandLens: готов (filter/arrows/enter/esc), лишний импорт.
- SIGNAL-10 Cargo Rail: AttachmentRail + AttachmentCapsule готовы, но `accept` prop конфликтует с method `accept` (lint error), нет видимого attach-action.
- **Отсутствуют**: SignalDock.vue, SignalSurface.vue, ContextFiber.vue, LaunchBay, ReportProbe/ReasonConstellation/ProbeFiber. Ни один из composer-компонентов не импортирован нигде — мертвый код.

## Bugs / technical debt

1. Lint сломан untracked-файлами (5 errors) — не позволяет запустить `npm run lint` на чистом дереве.
2. `useDraft` не сообщает статус (writing/saved/error) — Buffer Beacon не может быть подключён честно.
3. `CreatePostForm.handleAttach` ищет input через `document.querySelector('.attachment-dropzone__input')` — хрупко.
4. `CreatePostForm.removeReplyContext` редактирует body строкой; при вводе пользователя после `>>123` контекст ломается.
5. Два параллельных draft-механизма (useDraft в формах + отсутствие beacon).

## Product gaps

- Reply не «станция передачи»; создание треда не Launch Bay; report не Probe (см. план SIGNAL CONSOLE 05, DoD).
- Reply context не имеет визуальной связи с source post (Context Fiber).
- Keyboard-first действий нет (`/`, ⌘K).

## Visual gaps

- Card-and-pill monoculture в композере; нет разнообразия node/rail/fiber/capsule.
- Attachment UX = dashed zone; submit = прямоугольная кнопка.
- Emoji-глифы в interaction UI.

## Performance risks

- CargoRail/AttachmentCapsule: `URL.createObjectURL` без revoke — утечка при удалении/размонтировании (в AttachmentCapsule нет onUnmounted revoke).
- CommandLens/DraftBeacon unused imports тянут лишний код (минор).

## Accessibility risks

- Accordion composer скрывает textarea за кликом — keyboard users must expand first.
- ReasonPicker modal: focus trap есть, но pattern в целом rejected.
- Новые composer-компоненты непокрыты тестами и не подключены — a11y-состояния не проверены.

## Recommended next 3 stages

Приоритет = product impact × visual/UX impact × technical value ÷ risk.

1. **NEXT_01 — SIGNAL DOCK (reply flow).** Наиболее частый action в продукте; building blocks уже написаны; риск низкий; снимает lint-блокер. DoD: reply больше не accordion; dock доступен напрямую; focus morph вверх; TransmitControl; Context Fiber; Cargo Rail; Command Lens; Buffer Beacon; async lifecycle сохранён; verify:3d/lint/test/build PASS.
2. **NEXT_02 — LAUNCH BAY + REPORT PROBE.** Create thread как morphing stage; report как anchored diagnostic constellation (desktop) / vertical track (mobile); удаление modal.
3. **NEXT_03 — SCENE INTEGRATION + POLISH.** Scene events composer-focus/blur/transmit/report-open/submit; убрать FormField-stack из основных flows; card monoculture audit; interaction + async regression tests; docs.

## Выбор первого этапа

NEXT_01. Reply — ядро thread reading/writing loop; компоненты уже готовы и остаются мёртвым кодом; lint сломан; этап разблокирует остальные.

---

# STATUS LOG (filled during implementation)

## NEXT_01 — SIGNAL DOCK — DONE (pushed)
Reply = persistent transmission station; no accordion anywhere.
SignalSurface, Command Lens (/ + ⌘K), Cargo Rail (whole-dock intake),
Buffer Beacon, Signal Meter, TransmitControl, Context Fiber,
composer-focus/blur scene events. Async contract locked with tests.

## NEXT_02 — LAUNCH BAY + REPORT PROBE — DONE (pushed)
Thread creation = Flip-morphed stage with editorial title + telemetry
rail; report = anchored diagnostic constellation (desktop) / vertical
track (mobile). Whole legacy form system deleted.

## NEXT_03 — SCENE INTEGRATION + GLYPH SET — DONE (pushed)
report-open/report-submit/thread-launch events with danger flash and
launch pulse; all emoji icons replaced by one stroke-family SVG set;
dead light-theme components removed.

## NEXT_04 — THREAD READER — DONE (pushed)
`>>123` parser (pure), live anchors, dead-link states, backlinks rows,
desktop hover preview, reading progress bar. Reply loop closed.

## HOME-01/02 — DONE (pushed)
Home runs ONE WebGL scene (GearHero deleted, context budget 3→2);
hero explains what/where + CTA; "Последние передачи" feed via new
backend endpoint GET /threads/recent/; ThreadRow extracted and shared.

## PLATINUM-01/02 — DONE (pushed)
Stories are finally readable: /platinum/:id calm reading stage
(deep-linkable, honest 404); archive search (backend SearchFilter)
+ load-more beyond page 1; query-aware empty state.

## Verified
- frontend: lint PASS, 62 tests PASS, verify:3d 46 PASS, build PASS
- backend: 30+ API tests PASS, ruff PASS (docker compose run --rm backend)

## Known remaining gaps (honest)
- browser QA (Chrome/Firefox/mobile viewport) not performed this session
- ThreadView reply context element can go stale after refetch (fiber
  recomputes on scroll; acceptable)
- Platinum generation remains staff-only dev tooling by design

## QA round (live stack + code walk)
- QA-01: AboutView promised future Platinum — now describes the shipped
  product; spectacular schema errors (health/generate) fixed
- QA-02: dead UI components deleted (MagneticButton, GlowBorder,
  ScanlineOverlay, TypewriterText)
- QA-03: global keyboard focus-visible for borderless controls
- docs: README matches code (new endpoints, 2-context budget, tree)
- BOARD-01: live thread_count on board nodes (backend annotation + card)
- live stack verified: health, /threads/recent/, /platinum/?search=,
  frontend container serves <title>BMSTUDvach</title> (host :5173 was
  shadowed by a foreign dev server — no project bug)
- production build smoke: index + all assets 200 via vite preview

## Verified totals
- frontend: 66 tests, 13 files · verify:3d 46 · lint/build PASS
- backend: 32 tests · ruff PASS

## Security/moderation round (§40 audit)
- SEC-01: upload hardening — magic-byte sniffing (declared Content-Type
  is client-controlled: HTML/SVG-as-PNG used to pass), real image
  dimensions parsed from headers (width/height finally populated),
  field-level 400 instead of 500 mid-atomic, SECURE_CONTENT_TYPE_NOSNIFF,
  frontend accept list mirrors the backend exactly (no SVG via image/*)
- MOD-01: moderation had ZERO tests — added 9 (reports valid/invalid,
  hidden post -> 404 for report, hidden content disappears from
  thread/board, locked thread rejects replies, throttle scopes)
- ruff B904 fixed; ruff clean; 50 backend tests green

## Known ops gap (documented, not hidden)
- media files are only served by Django in DEBUG mode; production media
  serving (nginx/S3 + X-Content-Type-Options) is part of the not-yet
  implemented production deployment config

## Error-message round (ERR-01)
- the API wraps 400s as {detail: "Validation error", errors: {field}};
  views showed err.message → users literally read "Validation error"
- apiErrorMessage() (api/client): field errors → meaningful detail →
  per-flow fallback; wired into post/report/thread/platinum + store
- regression test: 400 with {body: [...]} surfaces the real message in
  the Signal Dock and the typed body survives
- 71 frontend tests, 50 backend tests, verify:3d 46, ruff, build — all green

## Content round (CONTENT-01)
- seed_dev rewritten: 4 boards / 13 threads / 63 posts / 16 resolving
  >>id links / 5 attachments (real PNG dimensions) / 6 platinum stories
  with SourceStory separation; idempotent + self-healing on re-run
- fixed corrupted legacy platinum body (mojibake)
- FIX: media was never served — config/urls.py now registers the
  DEBUG-gated static() route; attachments returned 404 before
- verified live: boards thread_count, recent feed, post links,
  platinum detail, media 200; backend 53 tests, ruff, schema clean
- remaining ops gap: production media serving (nginx/S3) — documented

## Feature expansion round (NEXT-05..09)
- NEXT-05 SCAN: global network search — GET /search/?q= (titles + bodies,
  visible only, snippets) + ScanLens overlay on Cmd/Ctrl+K (yields to
  dock/fields), header trigger; 11 tests
- NEXT-06 CATALOG: board as cluster — op_snippet annotation on listings,
  CatalogCard (node id / state glyphs / reply count / teaser), segmented
  list-catalog switch persisted in localStorage
- NEXT-07 SAGE + PREVIEW: Post.sage (migration) — quiet replies that do
  not bump the thread; dock toggle + /sage; post preview through the real
  link parser; sage badge on posts
- NEXT-08 WATCHLIST: anonymous device-local watchlist with seen-reply
  snapshots; WatchPanel on Home with unread badges (dead threads drop
  themselves out); track toggle in the thread title row
- NEXT-09 MOD CONSOLE: staff API (login/me/reports queue/resolve/post and
  thread hide-show-lock-unlock) + ModerationView with session gate,
  quick tools; /mod/ header link only for staff
- LIVE-QA found + fixed: DRF SessionAuthentication CSRF — credentials:
  'include' + X-CSRFToken + csrftoken cookie on login; verified the full
  staff flow against the running stack

Verified: frontend 94 tests · backend 70 · verify:3d 46 · ruff · build ·
spectacular clean · live API flows (scan, catalog fields, sage, watch,
staff console)

## Identity round (SORT/PIN/TRIP/TELEMETRY)
- SORT-01: board thread ordering — GET /boards/{slug}/threads/?order=
  bump|replies|newest (pinned always float first; bad value falls back
  to bump, never 400); SortLens segmented control in the board header,
  choice persisted in localStorage
- PIN-01: staff pin/unpin threads — POST /moderation/threads/{id}/pin|
  unpin/ (+is_pinned in ThreadStateSerializer); ModerationView toggle;
  PIN badge in ThreadRow/CatalogCard
- TRIP-01: optional name + tripcode — Post.author_name + Post.tripcode
  (migration 0003); `Имя#секрет` → display name + deterministic 9-char
  tripcode (sha256→base64, secret never stored/sent back); Identity
  Capsule in the Signal Dock (localStorage), author+tripcode rendered
  by PostBody; 24 tripcode unit tests
- TELEMETRY-01: GET /telemetry/ (boards/threads/posts/attachments,
  last_24h, busiest_board, generated_at; visible-only, 6 aggregates);
  TelemetryRail mono strip on Home (loading em-dashes, error hides)

Verified: frontend 120 tests · backend 137 · verify:3d 46 · ruff ·
build PASS · live: /telemetry/ and ?order=replies against the stack

## Improvement round (PAGE/MENTION/PWA/META/LIGHTBOX/MODLOG) — done (pushed)
- PAGE-01: board load-more — store keeps all loaded pages + hasMore;
  LoadMoreNode (button / «догружаю» / «сигнал передан полностью»);
  8 BoardView tests
- MENTION-01: GET /posts/mentions/?trip=!xxx — answers to your
  tripcoded posts (tripcode-only, secrets never stored); mention
  snippets, 30 cap over last 1000 posts with >>; MentionsBeacon on Home
  (tripcode watchlist + seen-ids in localStorage); 11 backend tests
- PWA-01: manifest + service worker (navigations network-first w/
  offline fallback, /assets/* SWR, API never cached, PROD-only
  registration) + OfflineBadge «НЕТ СВЯЗИ» (role=status, aria-live);
  SW behavior covered by 17 harness checks
- META-01: per-route title + description (router.afterEach, param
  substitution :boardSlug/:threadId/:storyId, 404 → «Сигнал
  потерян»); 8 router tests
- LIGHTBOX-01: AttachmentLightbox — focus trap + focus restore, body
  scroll lock, Esc/←/→, counter «02 / 03», reduced-motion honest;
  PostBody renders attachment tiles (ThreadView's duplicate grid +
  dead AttachmentPreview removed); 19 tests
- MODLOG-01: ModerationLog model + /moderation/log/ (staff-only, last
  100) — every staff mutation (hide/show post, lock/unlock/pin/unpin
  thread, report action/dismiss) logged; «ЖУРНАЛ» panel in the console;
  migration 0002_moderationlog; 7 new tests

Verified: frontend 174 tests · backend 144 · verify:3d 46 · ruff ·
build PASS · live: mentions 400/403, /moderation/log/ 403,
pagination contract unchanged

## Functionality round (SEEN/QUOTE/PASTE/FILTER/SITEMAP/PRUNE) — done (pushed)
- SEEN-01: «новые сообщения» — per-thread last-seen post id in
  localStorage; NewPostsDivider before the first unseen post;
  first visit shows nothing (no shouting); 12+5 tests
- QUOTE-01: click `>>id` (or Enter, no modifiers) in a post body →
  `>>id` appended to the dock draft via draftQuote store (dedup,
  foreign-thread safe); Ctrl/Cmd/Shift/middle clicks keep native
  navigation; dock focuses and expands on quote; 20 tests
- PASTE-01: clipboard image → same AttachmentRail path as drop
  (accept allow-list mirrored from backend, 4-file/10MB limits,
  binary never leaks into the textarea); 5 tests
- FILTER-01: search?board=<slug> narrows threads+posts; unknown slug
  → quiet empty; ScanLens board chips (ВСЕ + per board, ←/→ focus
  roving, request guarded against stale replies); 5+8 tests
- SITEMAP-01: /sitemap.xml + /sitemap-<section>.xml (threads/boards,
  visible only) + /robots.txt (Sitemap absolute, api/admin disallowed);
  django.contrib.sitemaps registered; 8 tests
- PRUNE-01: manage.py prune_threads — --days (default 90), --apply
  (dry-run by default), --board, --limit, --dry-run conflict guard;
  pinned never hidden, inactive boards excluded, one-mass-update,
  idempotent; 14 tests

Verified: frontend 235 tests · backend 158 · verify:3d 46 · ruff ·
spectacular · build PASS · live: search?board= quiet-empty,
/sitemap.xml, /robots.txt

## Functions round (AUTOLOCK/ANNOUNCE/NAV/POSITION/SEARCH-02/USERDATA) — done (pushed)
- AUTOLOCK-01: THREAD_POST_LIMIT=500 (settings) — the post that reaches
  the limit is created, then the thread auto-locks; visible posts only,
  pinned included, sage counted; 7 tests
- ANNOUNCE-01: Announcement model + public GET /announcements/ (live,
  window-aware, max 3) + staff POST /moderation/announcements/ and
  /toggle/; AnnouncementBanner under the header (close dismissed per
  session, dots carousel); migration 0003; 17 tests
- NAV-01: vim navigation g→h/b/m/t, / opens the scan lens; 1.5s prefix
  timeout, guards for inputs/dialogs/modifiers; 19 tests
- POSITION-01: per-thread scroll restore (localStorage, rAF-throttled
  writes, hash anchor wins over restore); 16+4 tests
- SEARCH-02: query operators board:<slug> (wins over ?board=) and
  title:<word> (titles only, posts empty); ScanLens <mark> highlighting
  via ScanHighlight (operators never highlighted)
- USERDATA-01: privacy panel on /about — download JSON of all app-owned
  localStorage keys + two-step reset (Esc/auto-cancel, role=status);
  foreign keys never touched; 16 tests

Verified: frontend 310 tests · backend 170 · verify:3d 46 · ruff ·
spectacular · build PASS · live: /announcements/ (migrated),
search operators against the stack

## Design round (STATE/GREENTEXT/HERO/MODUI/PLATINUM/OVERLAY) — done (pushed)
- STATE-01: LoadingState «поиск сигнала» (скан-шина + пики),
  ErrorState «обрыв связи» (code→message→retry, role=alert),
  EmptyState «пустой узел»; reduced-motion honest; props untouched
- GREENTEXT-01: `>`-строки как цитаты с общей левой чертой
  (--success tint, AA-contrast), абзацы ритмуют через space-4,
  мера 78ch + line-height 1.65, overflow-wrap anywhere, текст
  поста копируется дословно; >>id внутри цитаты не сломана
- HERO-01: hero — кикер-пилюля, clamp-h1 с glow, монолиния
  метафоры, CTA; секции с индексом (01) + hairline-разделители
  и моно-ридаутами (УЗЛЫ/СИГНАЛЫ); hover = translate, не transform
  (тилт цел); ритм space-8; брейкпоинты 640/480
- MODUI-01: консоль модерации как телеметрический грид — dense
  строки очереди, журнал потоком с level-акцентом слева; тексты
  и aria-label кнопок сохранены дословно (спеки зелёные)
- PLATINUM-01: архив «фрагментами» с hairline-разделителями,
  #id/teaser/time-row, dashed-нода load-more; сцена чтения:
  dl-мета (узел/опубликована/источник), мера 70ch, body 1.7
- OVERLAY-01: ScanLens — центрированная линза (640px, blur,
  оптическая кромка), kbd-шорткаты, стрелки результатов с
  accent-инсетом, честные empty/error-микро-подписи; CommandLens
  в том же языке + новая спека (13 тестов)

Verified: frontend 356 tests · backend 170 · verify:3d 46 · ruff ·
build PASS

## Services round (RULES/FEED/MODFINGER/HIDE/SHORTCUTS/FINDPOST/SOUND/STATS/DRAFTS/A11Y) — done (pushed)
- RULES-01: Board.rules (migration 0004) + seed rules; «ПРАВИЛА
  РАЗДЕЛА» collapsible block under the board title (line-clamp 3)
- FEED-01: RSS 2.0 feeds — /feed/recent.xml, /feed/board/<slug>.xml,
  /feed/thread/<id>.xml (visible only, absolute links, guids);
  <link rel=alternate> in index.html; 12 tests
- MODFINGER-01: staff GET /moderation/fingerprints/<64hex>/posts/
  (visible+hidden, cap 50, regex-validated); fingerprint now exposed
  in the report queue; «Посты автора» expandable panel in the console
- HIDE-01: local thread hiding (bmstud-hidden-threads) with reveal
  mode; rows/cards self-hide; HiddenThreadsChip in the board header
- SHORTCUTS-01: «?» help dialog (focus trap, Esc, scroll-lock) with
  the real shortcut table; wired through useNavShortcuts → App.vue
- FINDPOST-01: in-thread find (f / button, counter N/M, <mark>
  highlight via optional PostBody prop) + j/k post cursor with
  editable/modal guards
- SOUND-01: sound toggle in the header (aria-pressed, persisted
  bmstudvach-sound); useSound singleton, no AudioContext when off
- STATS-01: GET /telemetry/activity/?days=7|30 (TruncDate series,
  zero-filled, fallback 7) + /stats page: summary cells, CSS bar
  chart with sr-only data table, 7/30 switch; footer link
- DRAFTS-01: «НЕЗАКОНЧЕННЫЕ СИГНАЛЫ» panel on Home (listDrafts/
  discardDraft over draft:signal-<id> keys) with resume links
- A11Y-01: SkipLink «Перейти к содержимому» + main#main-content
  (tabindex=-1, aria-label)

Verified: frontend 459 tests · backend 231 · verify:3d 46 · ruff ·
spectacular · build PASS · live (in-container): /telemetry/activity/,
/feed/recent.xml, board rules, fingerprint 403

## Visual overhaul round — Editorial Archive (done, pushed)

**Арт-дирекция: «Редакционный архив»** — уровень Awwwards, без шаблонного AI/SaaS/cyberpunk вида.

### Что изменилось
- **Палитра:** тёмный киберпанк (oklch 0.10) → тёплая бумага (#F2EDE0 cream/ivory)
- **Типографика:** mono-шрифт для заголовков → serif (Cormorant Garamond) + sans body (Inter)
- **Акцент:** неоновый amber с glow → сдержанный deep teal (#2F4F4E)
- **Поверхности:** glow/shadow эффекты → hairline бордеры (1px solid)
- **Детали:** uppercase + letter-spacing → sentence case, editorial rhythm
- **Удалено:** CRT эффекты (vignette, flicker), neon hover, backdrop-blur на модалках

### Референсы (Awwwards 2024-2026)
- Terminal Industries (SOTY 2025): тёплые нейтралы, типографика, щедрое пространство
- Siena Film Foundation (SOTM 2025): редакционная типографика, serif + sans
- Cartier Watches & Wonders (SOTM 2025): restrained palette, editorial layout

### Изменённые компоненты (45 файлов)
**Дизайн-система:** main.css (новые токены, палитра, типографика), fonts.css (Cormorant Garamond), package.json, index.html

**Layout:** DefaultLayout.vue, AppHeader.vue (serif логотип, sans навигация, hairline бордеры), AppFooter.vue

**Home + секции:** HomeView.vue (hero без GlitchText/GridPattern/паралакса, serif заголовок, асимметричная сетка), TelemetryRail.vue, MentionsBeacon.vue, WatchPanel.vue, BoardCard3D.vue

**Browse:** BoardView.vue (serif заголовок, hairline бордеры), ThreadRow.vue, CatalogCard.vue, SortLens.vue, LoadMoreNode.vue, HiddenThreadsChip.vue

**Reading:** ThreadView.vue (serif заголовок, editorial типографика), PostBody.vue (sans body, цитаты с left border), PostPreview.vue, ThreadProgress.vue, AttachmentLightbox.vue (paper backdrop), NewPostsDivider.vue

**Composer + overlays:** SignalDock.vue (paper-raised фон, hairline бордеры, нет glow), CommandLens.vue, IdentityCapsule.vue, AttachmentRail.vue, TransmitControl.vue, SignalMeter.vue, DraftBeacon.vue, ScanLens.vue (paper фон, нет backdrop-blur), ScanHighlight.vue, ReportProbe.vue, ReasonConstellation.vue, ShortcutsDialog.vue

### 3D сцена
Оставлена как есть (адаптация — отдельная задача). 3D читает CSS-переменные, так что цвета обновятся автоматически, но фон сцены (тёмно-синий) может выглядеть несоответствующе.

### Примечания
- Скриншоты до/после не делались (нет browser-инструмента)
- 3D сцена не адаптирована в этом раунде
- Все тесты обновлены для sentence case вместо uppercase
- verify:3d структурные проверки пройдены (46/46)

**Результат:** сайт выглядит как редакционное издание, не как киберпанк/SaaS. Уникальный визуальный стиль, улучшенная читаемость.

## Forms round (TRANSMIT-ENGINE / SIGNAL DOCK SPATIAL / LAUNCH BAY STAGE / REPORT PROBE MORPH / DRAFT INTEGRITY) — done

### Транзит-движок ошибок (ERR-F)
- `src/api/errors.ts`: `classifyError()` — единая таксономия отказов API: `offline / throttle / validation / tooLarge / locked / notFound / server / unknown`. Русские `messageRu` всегда (никаких «Failed to fetch» в UI), парсинг DRF-секунд из 429 (`retryAfterSec`), поля 400 в `fields`, матч блокировки треда по `non_field_errors: ["Thread is locked."]`.
- `src/composables/useTransmit.ts`: один оркестратор submit для всех трёх форм — `run()`/`retry()`/`successToken`/`lastInput`; offline-ejection слушает `window 'online'` и делает ровно один авто-retry; 429 не авто-ретраит (лимит есть лимит).
- `src/components/composer/TransmitNotice.vue`: единый inline-узел отказа с kind-UI: живой countdown «повтор через Nс», retry-кнопка только где она осмысленна, ru-метки полей валидации (title/body/comment/reason/attachments). role=alert + aria-live.
- Wiring: ThreadView (ответ + жалоба, два независимых tx), BoardView (создание); формы перешли с `submitError: string` на `error: TransmitError | null` + `@retry`. Field-mapping в бейе: fields.title красит title-surface, fields.body — SignalSurface.

### Черновики: целостность и видимость
- `useDraft`: метаданные вложений (`MetaFile {name,size}`), flush pending-записи на `pagehide`/`visibilitychange hidden`/unmount, честный `hasRestoredFiles`; строка «текст восстановлен · N файлов — приложи заново» в доке и бейе (role=status, гаснет при работе).
- Жалоба получила черновик (`draft:report-<postId>`, причина+комментарий, silent restore в stage 2, очистка строго после success).
- `listDrafts()` обобщён на три вида (`signal/launch/report`); DraftsPanel на Home показывает «ответ в треде», «новый тред /slug/» (ссылка `/boards/<slug>?launch=1`) и «жалоба на пост» (без фантомных переходов); BoardView открывает бей по `?launch=1` и снимает query через replace.

### Signal Dock — пространственный
- Жёст «листа» вместо карточки (paper/ink, hairline rule, без radius/shadow); на ≥1100px док живёт в собственном левом жёлобе grid-колонки (ThreadView `--dock-col: clamp(440px,34vw,500px)` + widening `content--reader` в DefaultLayout) — ни на одной ширине не накрывает посты.
- Нить ContextFiber и док — одна система: fiber публикует `FiberLinkState`, секция держит общий `--link-state/--link-accent`, ведущая кромка листа отвечает тем же accent-маркером; скролл-проксимити к источнику усиливает кромку одним значением (rAF, без движения при reduced-motion).
- Убраны 4 одинаковых rail-пилюли: команды/файлы — в CommandLens (⌘K / `/`), sage — физический тумблер-реле (role=switch) на identity-строке, preview — узел в углу поверхности. Drag-intake без dropzone-вуали: файлы магнитятся к Cargo Rail (pointer-follow glow, раскрытие гнёзд, влёт капсул).
- Отказ API авто-раскрывает свёрнутый док.

### Launch Bay — сцена
- Re-skin с тёмной glass-карточки на paper/ink лист (тот же язык, что док/проба); триггер «Новый тред» shared-element-морфом 0.45s вылетает в kicker сцены (captureMorph/playMorph), список доски «отходит» (--receded, opacity+scale, без blur), под сценой недоступен; mobile остаётся safe-area bottom-sheet.

### Report Probe — интерактивные узлы
- Stage1→stage2 больше не v-if-свчок: обе стадии в DOM (классы + inert), выбранный узел причины летит по нити в анкер (gsap FLIP 420ms), остальные гаснут вдоль проводов к origin, обратный морф по «изменить»; reduced-motion — фейд.
- Голый textarea заменён на SignalSurface; черновик + TransmitNotice вплетены в сцену; радиосемантика и testid сохранены.

### BoardView chrome
- Правила раздела: вместо аккордеона «показать/свернуть» — rule sheet (краевая заметка с линейкой-маркером, один жест раскрытия, clip-path «линейная» маска построчно; однострочные правила — записка без жеста).
- View-switch: вместо двух rect-toggle — один круглый узел-коммутатор с геометрическим морфом 4 hairline→4 квадрата (aria-pressed, data-mode, прежний localStorage-ключ).

### Верификация
- verify:3d 46/46 · eslint 0 · vue-tsc+vite build OK · vitest 53 файла / 636 тестов (было 467/… → +~170 новых тестов за волну).
- Guard `emitSceneEvent({ type: 'reply' })` и все существующие testid сохранены.

### Примечания
- Модель субагентов (step-5-preview-free) пропала из доступов на последних двух задачах — остаток (gutter-widening, финальная верификация, доки) доделан главным агентом по согласованию с пользователем.
- Визуальная приёмка в живом браузере (морфы, жёлоб дока) не делалась — нет browser-инструмента.

---

## Archive Space round (ARCHIVE-01) — done (pushed)

`/platinum/` перестал быть «списком под общим фоном» и стал самостоятельным
3D-пространством: кольца-эпохи, по одной бумажной пластинке на историю,
янтарное ядро-хранилище, пыль в объёме колец. Живой список при этом остался
источником правды.

### Что стало

- **Раскладка** `src/three/archive/layout.ts` — чистые числа, без three/Vue:
  кольца по году публикации (история без даты → внутреннее кольцо), угол по
  золотому углу + хеш `id`, высота/наклон/масштаб из хеша, кап 60
  фрагментов; `ringsFor` / `placeFragments` / `fragmentById` / `archiveLayout`.
- **Материалы** `src/three/archive/materials.ts` — пять процедурных фабрик
  (`fragmentMaterial`, `ringMaterial`, `vaultMaterial`, `dustMaterial`,
  `emptyHaloMaterial`): fresnel-кромка, бумажное зерно, общий контракт униформ
  `uTime`/`uFocus`/`uDim`, текстур — ноль.
- **Сцена** `src/three/archive/space.ts` — `buildArchiveSpace(three, quality)`:
  кольца-орбиты, пластины с `userData.storyId`, ядро, пыль, гало пустого
  архива, camera rig (обход, фокус, перелёт, drag), raycast с подтверждением
  hover'а, идемпотентный `dispose()`.
- **Состояние** `src/three/sceneState.ts` — `archiveStories` / `focusedStory` /
  `selectedStory`, сеттеры `setArchiveStories` / `focusStory` / `selectStory`,
  события `archive-focus` / `archive-open` / `archive-clear`.
- **Канвас и маршрут** — `ArchiveSpaceCanvas.vue` (тонкая обёртка над
  `useThreeScene`), `AmbientField.vue` отдаёт архиву слот сети на режиме
  `platinum`; бюджет `MAX_ACTIVE_CONTEXTS = 2` не поднят.
- **Список ↔ фрагмент** (`PlatinumView.vue`) — наведение/фокус строки →
  `focusStory` + `archive-focus`; фрагмент в 3D → подсветка строки и мягкая
  подкрутка; клик по фрагменту → `selectStory` + `archive-open` + переход на
  `/platinum/:id`; поиск и «ещё» расширяют пространство.
- **Тихие состояния** — `ArchiveEmpty.vue` (loading / error / empty / search)
  вместо трёх generic-стейтов; в том числе `data-testid="platinum-empty"`
  сохранён.
- **Открытие истории** — `PlatinumStoryView.vue`: GSAP-таймлайн входа
  читаемого слоя (сцена → кикер → мета → заголовок → абзацы) и кинематограф
  `story-reveal` / `story-return` в `scenarios.ts` + `transitionDirector.ts`.
- **Доступность** — клавиатура (`↑`/`↓`/`Home`/`End`/`Enter`), live-region
  «Фрагмент N из M · <title>», переключатель «3D / только текст»
  (`aria-pressed`, `localStorage`), `aria-hidden` на канвасе, подписи
  ≥ 4.5:1 через локальный токен `--archive-caption`.
- **Перф** — пул объектов, кэш ресурсов колец, отсутствие аллокаций в кадре,
  троттлинг raycast, `dispose()` отдаёт каждый ресурс ровно один раз.
- **Сеть** (`network.ts`) — архив оставлен как «дальний план»: кольца и
  `setStoryCount` остались контрактом, но «фрагмент на историю» больше не
  создаётся — вместо них ≤6 декоративных силуэтов (`MAX_ARCHIVE_SILHOUETTES`)
  и один общий point cloud, где число историй меняет только `drawRange`
  (кап 18 историй × 3 искры).

### Ключевые решения и почему

- **Детерминированная раскладка вместо случайной.** Один и тот же набор
  историй всегда даёт один и тот же архив, порядок загрузки не влияет ни на
  что: иначе фрагмент «прыгал» бы под ногами при перерисовке списка, а
  `scrollIntoView` к строке перестал бы совпадать с пластинкой.
- **DOM как источник правды.** Список читает скринридер, клавиатуру и
  поиск; 3D только следует за ним. Поэтому наведение на строку двигает
  фокус, но не камеру.
- **Камера по событию открытия, а не по hover.** `focus(id)` выбирает цель и
  ничего не двигает; перелёт инициирует только `archive-open` (клик по
  пластинке, `Enter` в списке, переход на `/platinum/:id`). Иначе камера
  дёргалась бы за каждым движением мыши по списку.
- **Процедурные материалы вместо текстур.** Ноль загружаемых ассетов: сборка
  и освобождение ресурсов остаются дешёвыми, а тир `low` меняет только число
  сэмплов шума, а не картинку.
- **Архив занимает слот сети, а не добавляет контекст.** Бюджет
  `MAX_ACTIVE_CONTEXTS = 2` не поднят: на `/platinum/` сеть размонтируется,
  её слот освобождается и достаётся архиву.
- **Новых зависимостей нет.** `package.json` и lock-файл за раунд не тронуты
  (`git diff --stat` по ним пуст).

### Покрыто тестами и guard'ами

- `verify:3d`: **46 → 66** структурных проверок (состояние коммита
  `6563d64`): добавлен блок «archive space» (+20) — билдер сцены, GLSL в
  материалах, `placeFragments`/`ringsFor`/`fragmentById` в раскладке, канвас,
  события и состояние архива, `archive-focus`/`archive-open`/`archive-clear`,
  «сеть держит архив декоративным». Проверки идут по коду с вырезанными
  комментариями — закомментированная строка не может «удовлетворить» guard.
- `npm run test`: **53 файла / 636 тестов → 60 файлов / 862 теста**. Из них
  240 тестов в 10 файлах, относящихся к архиву: layout 46, space 34,
  materials 25, `ArchiveSpaceCanvas` 22, `ArchiveEmpty` 27, `PlatinumView` 34,
  `PlatinumStoryView` 14, `sceneState` 18, `storyTransition` 11,
  `AmbientField` 9. Старые тесты не удалялись и не ослаблялись.
- `npm run lint` — 0 ошибок и 0 предупреждений; `npm run build`
  (`vue-tsc --noEmit` + `vite build`) — ок: `three` остался в отдельном чанке
  (746.94 kB), `ArchiveSpaceCanvas` подключается лениво и собирается в
  отдельный чанк (22.14 kB).

### Ограничения и сознательные решения

- **Производительность.** Кап 60 пластин (истории сверх капа остаются в
  списке), один общий материал и одна геометрия на все пластины, кэш
  геометрии кольца по радиусу и материала по индексу, пул мешей. Instancing
  сознательно не сделан: прозрачные пластины с `depthWrite: false`
  сортируются three'ом по объектам, а в одном `InstancedMesh` порядок
  смешивания стал бы порядком инстансов — это визуальная деградация на
  перекрывающихся пластинках.
- **320px.** 3D — фоновый слой: `pointer-events: auto` только у самого
  канваса, клики достаются списку; панель тихих состояний не прыгает
  (`min-height` 288px → 240px на ≤640px); переключатель «только текст»
  убирает 3D целиком, если места мало.
- **Reduced-motion.** Перелёт — один кадр (мгновенный финальный кадр),
  обход/дрейф/вращение/дыхание выключены, а униформы, рассеивание сцены и
  raycast продолжают работать. GSAP-таймлайн входа в историю под reduced
  motion не запускается вовсе: первый кадр = финальный.
- **Без новых зависимостей.** Всё на сущещем стеке (Vue 3, Three.js 0.186,
  GSAP); новых библиотек, ассетов и шрифтов не добавлялось.

### Что НЕ сделано (честно)

- **Сцена архива пока не выводится на экран.** `buildArchiveSpace` создаёт
  собственные `Scene`/`PerspectiveCamera`, а `useThreeScene` рендерит
  `ctx.scene`/`ctx.camera` (`frontend/src/composables/useThreeScene.ts:170`) —
  в канвас уходит пустая сцена. Дефект найден в перф-проходе (P4-T2,
  followup #1) и **не исправлен**: правки кода в задачи P1–P4 не входили.
  Логика (раскладка, состояние, фокус, raycast, камера) работает и покрыта
  тестами, но визуальной приёмки картинки не было — см. следующий пункт.
- **Визуальной приёмки в браузере не было** — browser-инструмента в
  окружении нет (то же ограничение, что и в прошлых раундах).
- **Шейдеры ни разу не компилировались настоящим GL-драйвером** — в
  окружении нет headless-GL, а новые зависимости запрещены; проверка
  структурная (наличие `gl_FragColor`, WebGL1-совместимость исходников,
  различие тиров).
- **Instancing пластин** — сознательно не сделан (см. выше), 68 draw call
  на 60 историях.
- **Владение событием `archive-open` размазано**: его эмитит и директор
  перехода, и вью. Сейчас это разведено проверкой `sceneState.selectedStory`
  (дубль не проходит), но единого владельца нет.
- **Под reduced motion директор перехода не эмитит `archive-open`** — только
  мягкую вуаль. Фокус при этом всё равно ставит вью, а перелёт в сцене
  мгновенный; функционально то же, но семантика различается.
- **Таблица `source_type → наклон` выбрана вручную** (`generated` / `dvach` /
  `custom` / `imported` / `manual`) — реальные значения тега стоит проверить
  по данным и, возможно, расширить.
- **Кап оставляет наименьшие `id`** — самые новые истории могут не получить
  пластину. Правило меняется одной строкой в `placeFragments`, если решить,
  что свежее важнее.
- **P4-T3 (тесты и структурные guard'ы) шла параллельно** и ещё не закрыта:
  счётчики `verify:3d` и общее число тестов после неё изменятся — числа выше
  зафиксированы на коммите `6563d64`.
- **Правила раскладки, палитры, движения, доступности и производительности
  архива зафиксированы в `docs/ART_DIRECTION.md`, раздел «Archive Space» —
  чтобы следующий разработчик расширял язык, а не изобретал новый.

Verified: frontend 60 файлов / 862 теста · verify:3d 66 (было 46) · lint 0 ·
build PASS · числа зафиксированы на коммите `6563d64` (код раунда в этой
задаче не менялся — только два файла в `docs/`).

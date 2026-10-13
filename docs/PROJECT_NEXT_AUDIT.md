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

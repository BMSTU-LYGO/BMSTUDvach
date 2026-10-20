# FINAL SUMMARY — Forms round (волна 4)

Цель: полностью переосмыслить основные пользовательские формы BMSTUDvach —
ответ = пространственный Signal Dock, создание треда = Launch Bay с morph-переходом,
жалоба = Report Probe с интерактивными узлами; убрать accordion/dropdown/одинаковые
прямоугольные controls/стандартные dropzone; безупречные API-ошибки и черновики.

## Что сделано (16 задач, 7 батчей)

### Фундамент ошибок (P1-T1..T4)
- Таксономия `classifyError` (8 kinds, русские сообщения, 429-countdown-секунды, 400-поля, lock по non_field_errors) — api/errors.ts.
- Движок `useTransmit` (run/retry/successToken, offline авто-retry ровно один, throttle не авто) + `TransmitNotice` (kind-UI, countdown, поле-метки).
- Wiring: ThreadView (ответ+жалоба, 2 tx), BoardView (создание); контракт форм `submitError: string` → `error: TransmitError|null` + `@retry`; field-mapping на поверхности; содержимое формы выживает при любом отказе.

### Черновики (P2-T1..T3)
- useDraft: метаданные файлов, flush на pagehide/visibility/unmount, quota-safe.
- Жалоба: черновик reason+comment с silent restore в stage 2, очистка после success.
- DraftsPanel видит все три вида черновиков; `?launch=1` открывает бей на борде.
- Честная строка восстановления: «текст восстановлен · N файлов — приложи заново» (док+бей).

### Формы заново (P3-T1a..T5, T2..T4)
- Signal Dock: лист вместо карточки, sticky-жёлоб ≥1100px (посты никогда не перекрыты), кромка дока и нить ContextFiber — одна система связи (link-state токены), магнитный drag-intake без dropzone-вуали, вместо 4 одинаковых пилюль — линза (⌘K), sage-реле (role=switch), preview-узел в углу; отказ авто-раскрывает док.
- Launch Bay: paper/ink сцена вместо тёмной карточки, shared-element морф триггера в kicker сцены (0.45s), список «отходит», mobile safe-area лист.
- Report Probe: FLIP-морф «узел→анкер» по нити (gsap 420ms, обратный по «изменить»), гасние constellation вдоль проводов, SignalSurface вместо textarea, notice и черновик вплетены в сцену.
- BoardView: rule sheet вместо аккордеона (один жест, линейная маска), один круглый узел-коммутатор list↔cluster вместо двух rect-toggle.

## Верификация
- verify:3d: 46/46 (guard emitSceneEvent reply цел) · eslint: 0 · build (vue-tsc+vite): OK · vitest: 53 файла / 636 тестов (старт волны: ~516), двойной прогон детерминирован.

## Отклонения/заметки
- Модель субагентов opencode-go/step-5-preview-free пропала из доступов на P3-T5/P4 — остаток доделан главным агентом с согласия пользователя.
- Несколько субагентских прогонов обрывались на связи после внесения кода — каждый случай проверен и докреплён (аудит + specs) принятым прогоном или главной сессией.
- Не сделано (FOLLOWUPS): bay-open как отдельное scene-событие; discriminated-result у useTransmit.run; browser-приёмка морфов; docs-обновление DRAFTS-01 под новый заголовок панели.

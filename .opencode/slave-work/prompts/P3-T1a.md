ЗАДАЧА: P3-T1a. Интейк вложений без стандартной dropzone-вуали
ЦЕЛЬ ПРОЕКТА: довести формы Signal Dock / Launch Bay / Report Probe до авторского UX; убрать стандартные dropzone.
ПРОЕКТ: /Users/timofey/Developer/Личные_проекты/BMSTUDvach, стек: Vue 3 + TS (scoped CSS, GSAP есть в deps).

КОНТЕКСТ: прочитай .opencode/slave-work/PLAN.md («Контекст», «Общие правила»), затем frontend/src/components/composer/SignalDock.vue (drag-intake: dragDepth, .signal-dock__intake вуаль ~строки 537, 564, 804-825; onDragEnter/Over/Leave/Drop), AttachmentRail.vue, AttachmentCapsule.vue (полностью). Соседние конвенции: paper/ink токены (--paper-raised, --accent, --danger), NetworkIcon.

ЧТО СДЕЛАТЬ:
1. УБРАТЬ вуаль «перетащите файл» (signal-dock__intake элемент, класс --intake в таком виде и label) — это стандартный dropzone-паттерн.
2. Новый авторский интейк: когда файлы наводят над доком (dragenter/dragover), cargo-rail и его узлы «открывают приём»: нити/узел растягиваются, пустые гнёзда капсул проступают (4 гнезда по лимиту) — перетаскивание физически «примагничивается» к рейлу: pointer-follow glow через CSS custom properties (пересчёт в onDragOver throttled rAF), кромка дока подсвечивается тонкой линией accent (не рамка-пунктир!). На drop — капсулы влетают в strip (scale/translate анимация появления в AttachmentCapsule, CSS animation sufficient).
3. Paste-файлы идут тем же путём влёт.
4. prefers-reduced-motion: никаких летящих анимаций — мгновенное появление; drag-состояния остаются (визуальные подсказки без движения).
5. LaunchBay использует AttachmentRail — его интейк улучшается автоматически; отдельный drop-обработчик LaunchBay (rail @drop) не должен иметь вуали (проверь, что нет).
6. Не ломать: лимиты, reject-капсулы, ACCEPTED, существующие testid и обработчики submit/keydown.

КРИТЕРИИ ПРИЁМКИ:
- в SignalDock.vue нет .signal-dock__intake-вуали и текста «перетащите файл»
- drag-состояние определяется визуально по рейлу/кромке, не оверлеем-зоной
- verify:3d 46/46 (не трогает 3D, но прогнать обязательно), lint 0, build OK, npm run test зелёные (обнови specs, если проверяли вуаль — проверь grep intake по __tests__)

ВЕРИФИКАЦИЯ (из frontend/): npm run verify:3d && npm run lint && npm run build && npm run test

ГРАНИЦЫ: файлы этой задачи. Композер-specs при необходимости. Не коммитить, вопросов не задавать, scope не расширять (rail-action кнопки НЕ трогать — это P3-T1b).

ОТЧЁТ: финальное сообщение И файл .opencode/slave-work/results/P3-T1a.md:
STATUS / FILES_CHANGED / VERIFICATION / SUMMARY / BLOCKERS / FOLLOWUPS

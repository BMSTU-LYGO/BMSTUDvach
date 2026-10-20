ЗАДАЧА: P3-T1b. Инструментальный кластер Signal Dock — убрать 4 одинаковых rail-action кнопки
ЦЕЛЬ ПРОЕКТА: авторский UX дока; никаких одинаковых прямоугольных controls.
ПРОЕКТ: /Users/timofey/Developer/Личные_проекты/BMSTUDvach, стек: Vue 3 + TS + GSAP (в deps, см. useGsap) + scoped CSS.

КОНТЕКСТ: прочитай .opencode/slave-work/PLAN.md («Контекст», «Общие правила»). Прочитай frontend/src/components/composer/SignalDock.vue ПОЛНОСТЬЮ (особенно шаблон .signal-dock__rail: кнопки файлы/предпросмотр/sage/команды как одинаковые ghost-кнопки; CommandLens уже содержит команды attach/send/sage/preview/help), CommandLens.vue, TransmitControl.vue (кольцевой контрол), DraftBeacon.vue, SignalMeter.vue, __tests__/SignalDock.spec.ts. Учти: в дереве уже лежат изменения P1-T3 (TransmitNotice, структурированный error, testid dock-rail-error) и P3-T1a (магнитный интейк) — не откатывай, работай поверх.

КРИТИКА, КОТОРУЮ УСТРАНЯЕШЬ: четыре одинаковых текстово-иконных rect-кнопки в ряду — «generic toolbar», противоречит цели. Плюс notice API-ошибки живёт в свёрнутом стеке и недоступен, когда док свёрнут.

ЧТО СДЕЛАТЬ:
1. Убрать из rail кнопки «файлы», «предпросмотр», «команды» (sage — см. п.2). Команды и attach остаются доступными через CommandLens (⌘K / `/`) — убедись, что линза открывается явной ОДНОЙ авторской кнопкой-линзой (не rect-пилюлей): маленький узел-линза NetworkIcon('command'), круглая геометрия, hover — раскрывающаяся диафрагма (CSS), aria-label «Команды (⌘K)».
2. sage — физический тумблер: мини-переключатель (role=switch, aria-checked) в стиле шкалы/реле (2–3状态: рычажок с ямр-подсветкой), НЕ кнопка-пилюля; перемести к identity-строке дока (рядом с маркером sage). Клик по identity-маркеру тоже может переключать — на твоё усмотрение, но тумблер обязателен один.
3. preview — переключатель в углу SignalSurface (крошечный значок «◫»/NetworkIcon('eye')) с aria-pressed; состояние previewOpen остаётся.
4. Rail после редизайна: слева — узел-линза + DraftBeacon; справа — SignalMeter(когда есть текст) + hint + TransmitControl. Никаких rect-пилюль с подписями.
5. notice: TransmitNotice/error строку вынести так, чтобы при свёрнутом доке с последней ошибкой док автоматически раскрывался на ошибку (watch props.error → expanded=true) — ошибка не должна быть невидима.
6. Мобильный 320px: rail не должен крошиться; линза и тумблер — тап-цели ≥32px (компактно) с padding.
7. Specs: перепиши тесты rail (кнопки удалены/заменены), добавь: тумблер sage role=switch, линза открывает CommandLens, preview corner toggle, error→авто-раскрытие. Все существующие testid сохранить где они были (signal-dock, dock-error, dock-rail-error, sage-marker).

КРИТЕРИИ ПРИЁМКИ: в шаблоне дока ноль повторы одинаковых rect-кнопок (бывшие .rail-action для этих четырёх функций — gone; NetworkIcon-узлы другой формы допустимы); ⌘K/`/` по-прежнему открывают линзу; Esc-collapse работает; verify:3d 46/46, lint, build, test зелёные.

ВЕРИФИКАЦИЯ (из frontend/): npm run verify:3d && npm run lint && npm run build && npm run test

ГРАНИЦЫ: SignalDock.vue (+ CommandLens.vue/SignalSurface.vue/NetworkIcon.vue при необходимости), specs дока. ContextFiber/ThreadView — не трогать (P3-T1c). Не коммитить, вопросов не задавать.

ОТЧЁТ: финальное сообщение И .opencode/slave-work/results/P3-T1b.md:
STATUS / FILES_CHANGED / VERIFICATION / SUMMARY / BLOCKERS / FOLLOWUPS

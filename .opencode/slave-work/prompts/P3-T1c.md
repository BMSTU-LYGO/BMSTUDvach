ЗАДАЧА: P3-T1c. Пространственный Signal Dock: док+нить как одна система
ЦЕЛЬ ПРОЕКТА: ответы = пространственный Signal Dock (не «полоса снизу»), без потери читаемости.
ПРОЕКТ: /Users/timofey/Developer/Личные_проекты/BMSTUDvach, стек: Vue 3 + TS, GSAP, scoped CSS.

КОНТЕКСТ: прочитай .opencode/slave-work/PLAN.md. Прочитай frontend/src/components/composer/SignalDock.vue (после P3-T1a/P3-T1b/P1-T3: магнитный интейк, линза-узел, sage-реле, TransmitNotice с авто-раскрытием — НЕ откатывай; заметь P3-T2 FOLLOWUP:SignalDock всё ещё рисуется как скруглённая карточка --radius-lg — унифицируй жестом «лист» как у LaunchBay), components/composer/ContextFiber.vue (SVG-нить пост→док, edge-коллапс), views/ThreadView.vue (разметка: контейнер постов, <SignalDock> обвязка, ContextFiber монтируется здесь; ЧУЖИЕ незакоммиченные правки wave-3 не откатывать), composables/usePostReveal/useReadingPosition — только как референс паттернов.

КРИТИКА: док сейчас — «панель под лупой скролла», нить живёт своей жизнью; контекст ответа («куда отвечаю») не ощущается пространственно.

ЧТО СДЕЛАТЬ:
1. Жест «листа»: SignalDock перерисовать в paper/ink «лист» как LaunchBay (P3-T2 сделал бей листом: --paper-raised, hairline --rule, border-radius 0, без тени-карточки) — единая семья поверхностей дока/бейя/пробы.
2. Причаливание: на desktop (≥1100px) док занимает позиционированную колонку у левого края тред-ридера (sticky bottom-left, max-width ~460–520px, posts-колонка не едет — позиционирование absolute/sticky в уже существующей обвязке ThreadView; на <1100px — как сейчас снизу, на mobile bottom-sheet с safe-area). Позицию подобрать по текущей структуре ThreadView (прочитай шаблон до правки!), не ломая scroll-reveal/reading position.
3. Пространственная связь дока и нити: когда replyContext активен и источник виден — кромка/левый край дока получает accent-свечение, синхронизированное с нитью ContextFiber (общая переменная через класс на контейнере или CSS var, который ThreadView уже прокидывает для fiber — изучи текущую связь; fiber target это док). Когда источник ушёл из viewport — fiber схлопывается в edge-индикатор (есть) + тот же accent маркер на кромке дока (едина система, не два independent визуала).
4. Скролл-проксимити: при скролле к источнику контекста (расстояние < n экранов) док слегка «оживает» (accent line на кромке усиливается) — дешёвый rAF-throttled listener, cleanup, reduced-motion — без движения (только прозрачность).
5. Читаемость первична: док не должен перекрывать посты (на desktop колонка; если не хватает места — оставить снизу, но лист-жест обязателен). Никаких изменений логики submit/draft/error.
6. Specs: обнови/добавь тесты дока (class-состояния листа; при replyContext root-контейнер получает класс связи — jsdom не считает layout, проверяй классы/атрибуты и вызовы fiber; не ломай существующие testid).

КРИТЕРИИ ПРИЁМКИ: в SignalDock.vue нет --radius-lg карточки/тени (жест «лист»); desktop-раскладка дока изменена без поломки верификационного grep emitSceneEvent reply в ThreadView; fiber↔док связаны одним визуальным языком; verify:3d 46/46, lint/build/test зелёные.

ВЕРИФИКАЦИЯ (из frontend/): npm run verify:3d && npm run lint && npm run build && npm run test

ГРАНИЦЫ: SignalDock.vue, ContextFiber.vue, ThreadView.vue (только обвязка/позиционирование дока + классы связи), specs дока. Rail-логику P3-T1b и TransmitContract P1-T3 не менять. Не коммитить, вопросов не задавать.

ОТЧЁТ: финальное сообщение И .opencode/slave-work/results/P3-T1c.md:
STATUS / FILES_CHANGED / VERIFICATION / SUMMARY / BLOCKERS / FOLLOWUPS

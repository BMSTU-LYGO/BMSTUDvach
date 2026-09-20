# BMSTUDVACH_SIGNAL_CONSOLE_05

## 0. Зачем этот этап

Текущий `CUSTOM_COMPOSER_04` технически улучшил формы, но визуально остался слишком обычным.

Проблема НЕ в цветах.

Проблема в самой UI-модели:

```text
кнопка
↓
прямоугольник раскрывается
↓
label
input
label
textarea
dropzone
toolbar
buttons
```

Это всё ещё стандартная web-form, только тёмная и аккуратно покрашенная.

Следующий этап должен полностью поменять interaction model.

Цель:

> Формы BMSTUDvach должны ощущаться как управление живой инженерной сетью, а не как заполнение анкеты.

Никаких accordion/dropdown composer как главного паттерна.

---

# 1. Референсы и что именно из них взять

НЕ копировать внешний вид.

Использовать только UX-принципы.

## Raycast

Взять:
- один главный interaction surface;
- contextual actions вместо десятка постоянно видимых кнопок;
- shortcuts прямо рядом с actions;
- primary action всегда понятен;
- `Ctrl/Cmd+K` для дополнительных действий.

## Linear

Взять:
- создание сущности без ощущения тяжёлой формы;
- локальный draft;
- пользователь может уйти и вернуться без потери ввода;
- создание является частью рабочего потока, а не отдельной страницей.

## Notion

Взять:
- команды прямо из точки набора текста;
- `/` открывает contextual command surface;
- keyboard-first;
- action появляется там, где пользователь уже находится.

## Discord

Взять:
- attachments являются частью сообщения, а не отдельным form section;
- изображения собираются вместе с текстом;
- сообщение + файлы воспринимаются как один объект.

## Arc / Figma / command interfaces

Взять:
- действия можно искать;
- interaction surface меняется в зависимости от контекста;
- не нужны постоянно видимые панели управления.

---

# 2. Новый главный концепт

## SIGNAL DOCK

Ответ в тред — это НЕ форма.

Это постоянно доступная **станция передачи сигнала**.

В обычном состоянии внизу thread:

```text
┌──────────────────────────────────────────────────────────┐
│  ○ ANON / #thread          передать сообщение...   ⌘↵  ◉ │
└──────────────────────────────────────────────────────────┘
```

Это не кнопка "раскрыть".

Пользователь сразу кликает в текстовую область и пишет.

При focus dock не "выпадает".

Он **раскрывает пространство вверх**, как рабочая консоль:

```text
                         reply fiber from #123
                                ╲
                                 ╲
┌───────────────────────────────────────────────────────────┐
│  ↳ #123  ANON                                  BUFFER ●  │
│                                                           │
│  текст сообщения                                          │
│  курсор                                                   │
│                                                           │
│  [ attachment rail ]                                      │
├───────────────────────────────────────────────────────────┤
│  +   / commands       draft saved             TRANSMIT ◉  │
└───────────────────────────────────────────────────────────┘
```

Никакого header с `▼`.

Никакого визуального ощущения dropdown.

---

# 3. Создание треда — другой интерфейс

CreateThread НЕ должен быть тем же Reply Composer с дополнительным title input.

Использовать отдельный паттерн:

# LAUNCH BAY

Нажатие:

`+ Новый тред`

не открывает прямоугольник под кнопкой.

Кнопка через GSAP Flip / View Transition **морфит в отдельное рабочее пространство**.

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│  NEW TRANSMISSION                          /board/      ×    │
│                                                              │
│  Большой заголовок треда                                     │
│  ───────────────────────────────────────────────────────     │
│                                                              │
│  Основной текст                                              │
│                                                              │
│                                                              │
│                                                              │
│  [ attachment rail ]                                         │
│                                                              │
│  BUFFER ✓       1234 chars         Ctrl+Enter       LAUNCH ◉ │
└──────────────────────────────────────────────────────────────┘
```

Это не modal-bootstrap.

Это временно отдельный **stage** внутри приложения.

Network background остаётся виден.

Список тредов уходит немного в depth/blur.

---

# 4. Report — вообще не dialog

Текущий ReportDialog удалить как основной UX.

Новый паттерн:

# REPORT PROBE

Пользователь нажимает `!` на конкретный post.

Post остаётся на месте.

Другие посты слегка dim.

Из кнопки report выходит тонкая SVG-line.

На desktop рядом с постом появляется **diagnostic constellation**:

```text
                   ○ spam
              ╱
post #123 ●──●───○ abuse
              ╲
                   ○ illegal
                 ○ offtopic
                   ○ other
```

Это НЕ dropdown.

Это НЕ modal.

Это НЕ пять прямоугольных radio buttons.

Каждая причина = network node.

Hover:
- линия подсвечивается;
- node увеличивается;
- label раскрывается.

Click reason:
- node фиксируется;
- из него разворачивается маленький comment panel;
- submit идёт по той же линии обратно в post.

Mobile fallback:
- bottom sheet;
- причины идут как vertical diagnostic track;
- НЕ стандартные cards.

---

# 5. Блок 1 — сначала исправить async contract

Сейчас формы считают emit успешной отправкой.

Это неправильно.

`emit('submit')` не await-ит async handler родителя.

Нужно:

- API state контролирует parent/store;
- form не очищает body/draft сама сразу после emit;
- success только после реального API success;
- error не уничтожает введённый текст;
- Report Probe не закрывается до server success.

Предпочтительная схема:

```text
CreatePostForm:
props:
- submitting
- submitError
- successToken

emit:
- submit(input)
```

Parent:
1. получает submit;
2. выполняет API;
3. при success увеличивает `successToken`;
4. form reset только по successToken.

То же для Thread и Report.

Добавить tests на API failure.

**Commit:** `SIGNAL-01: fix async composer submission contract`

---

# 6. Блок 2 — удалить accordion interaction

Текущий `ComposerShell` в существующем виде больше не использовать для reply.

Удалить interaction:

```text
click header
▼
v-if expanded
footer
```

Создать:

```text
frontend/src/components/composer/
├── SignalDock.vue
├── SignalSurface.vue
├── SignalInput.vue
├── SignalActionRail.vue
├── SignalMeter.vue
├── DraftBeacon.vue
├── ContextFiber.vue
├── CommandLens.vue
├── AttachmentRail.vue
├── AttachmentCapsule.vue
└── TransmitControl.vue
```

`ComposerShell` можно удалить либо оставить только для legacy/testing, но он не должен использоваться в основных flows.

**Commit:** `SIGNAL-02: replace accordion composer with Signal Dock architecture`

---

# 7. Блок 3 — Signal Dock idle state

Signal Dock расположен у нижней части Thread flow.

Desktop:
- sticky;
- не закрывает последний post;
- занимает ~52–64px idle;
- textarea уже существует;
- никакого дополнительного клика "открыть".

Структура:

LEFT:
- anonymous signal indicator;
- reply context indicator если есть.

CENTER:
- textarea, выглядит как пустая строка передачи.

RIGHT:
- shortcut;
- transmit node.

Когда пусто и blur:
- очень компактный.

Когда пользователь начинает писать:
- высота естественно увеличивается.

Не использовать border box вокруг каждого sub-element.

Вся конструкция должна выглядеть как одна система.

**Commit:** `SIGNAL-03: build persistent idle Signal Dock`

---

# 8. Блок 4 — Focus Morph

При focus:

Dock:
- слегка поднимается над страницей;
- ширина/глубина меняется;
- рабочая область раскрывается ВВЕРХ;
- нижняя action rail остаётся стабильной.

Использовать GSAP Flip.

Не использовать:
- `v-if` + dropdown transition;
- стрелку ▼;
- стандартную modal animation.

Focus должен ощущаться как:

`terminal comes online`

но без Matrix/CRT.

Animation:
- 180–260ms initial;
- 350ms full surface morph;
- spring-like easing.

Background network:
- немного dim;
- ближайший network node активируется.

**Commit:** `SIGNAL-04: add spatial focus morph`

---

# 9. Блок 5 — центральный text canvas

Textarea перестаёт выглядеть как `<textarea>`.

Внешне:
- нет обычной рамки;
- нет отдельного label сверху;
- text surface является центром dock;
- placeholder большой и тихий;
- фон практически отсутствует.

Добавить левый micro-gutter:

```text
TX
01
02
03
```

Но НЕ делать настоящий code editor.

Gutter декоративный/смысловой:
- TX = transmission;
- при reply = `R:#123`.

Character counter убрать из угла textarea.

Вместо этого SignalMeter в action rail.

**Commit:** `SIGNAL-05: create borderless transmission text canvas`

---

# 10. Блок 6 — Signal Meter вместо обычного counter

Не показывать:

`142 / 20000`

постоянно.

Создать micro-meter:

```text
──────────────●────
```

или circular arc вокруг transmit node.

До 80%:
- почти невидимый.

80–95%:
- amber.

95–100%:
- stronger warning.

Limit exceeded:
- red broken signal state;
- accessible textual error рядом с input.

Hover/focus meter:
- показывает точное число.

**Commit:** `SIGNAL-06: replace counters with signal integrity meter`

---

# 11. Блок 7 — Transmit Control

Отправка не должна выглядеть как обычная rectangular button.

Создать `TransmitControl`.

Visual:

```text
TRANSMIT   ◉
```

Большой circular node справа.

Idle:
- thin ring.

Ready:
- ring charges.

Hover:
- outer orbit.

Press:
- ring contracts.

Submitting:
- progress travels around circumference.

Success:
- pulse выходит из node в WebGL network.

Error:
- ring breaks на 300ms;
- не трясти всю форму.

Keyboard:
`Ctrl/Cmd+Enter`.

Button semantics сохранить.

**Commit:** `SIGNAL-07: build network transmission control`

---

# 12. Блок 8 — Reply Context Fiber

При `Ответить` на post:

НЕ просто chip `↳ #123`.

Создать визуальную связь source post → Signal Dock.

На desktop:
- SVG overlay между source post и dock;
- тонкая curved line;
- line не проходит поверх текста;
- endpoint у края post;
- endpoint dock.

При scroll:
- если source вышел за viewport:
  - fiber становится коротким edge indicator;
  - не тянуть линию через всю страницу.

В dock:
- маленький context node:
  `↳ #123`.

Hover context:
- source post подсвечивается.

Click:
- scroll к source.

Remove:
- разрыв fiber animation.

Reduced motion:
- статический chip без moving line.

**Commit:** `SIGNAL-08: connect replies with Context Fiber`

---

# 13. Блок 9 — Slash / Command Lens

Borrow UX principle from Notion/Raycast, not visual appearance.

В textarea:

`/`

в начале команды открывает Command Lens прямо над caret/dock.

Также:

`Ctrl/Cmd+K`

Открывает contextual actions.

Команды ТОЛЬКО реальные:

```text
/attach       Прикрепить файл
/reply        Показать текущий reply context
/clear        Очистить draft
/collapse     Свернуть focus mode
/send         Отправить
/help         Горячие клавиши
```

Не добавлять fake formatting.

Command Lens:
- search/filter;
- arrows;
- Enter;
- Esc;
- action shortcut справа.

Это должно заменить часть постоянно видимой toolbar.

**Commit:** `SIGNAL-09: add contextual Command Lens`

---

# 14. Блок 10 — attachment CARGO RAIL

Удалить большой dashed dropzone из composer.

Attachment UI должен быть частью сообщения.

Пустой state:
- нет отдельной зоны на 150px;
- есть только `+`/clip action в rail.

Drag file over window/dock:
- весь Signal Dock превращается в intake surface;
- появляется большая translucent надпись:
  `DROP INTO SIGNAL`;
- animated scan проходит по surface.

После drop:
attachments появляются горизонтальной лентой над textarea.

## Image

Card:
- thumbnail;
- crop;
- filename только при hover;
- file size micro label;
- remove node.

## PDF/text

Small capsule:
- custom SVG icon;
- extension;
- filename;
- size.

Несколько изображений:
- компактная mosaic/film-strip композиция.

Не emoji.

**Commit:** `SIGNAL-10: replace dropzone with attachment Cargo Rail`

---

# 15. Блок 11 — paste interaction

Ctrl/Cmd+V image:

- файл появляется в Cargo Rail;
- короткий "captured" pulse;
- caret/text не теряется.

Если clipboard содержит text:
- обычный paste.

Если image превышает limit:
- inline capsule `REJECTED`;
- причина;
- исчезает после dismiss.

**Commit:** `SIGNAL-11: make clipboard capture native to composer`

---

# 16. Блок 12 — Draft Beacon

Draft не показывать как стандартный текст.

В action rail:

```text
BUFFER ●
```

States:

```text
● idle
◌ writing
● saved
! storage error
```

Hover:
`сохранено 8 сек назад`

При восстановлении draft:
- Dock появляется с уже заполненным signal;
- короткий subtle pulse;
- НИКАКИХ modal "восстановить черновик?".

Clear через Command Lens.

**Commit:** `SIGNAL-12: turn drafts into Buffer Beacon`

---

# 17. Блок 13 — Thread Launch Bay

Удалить:

```text
+ Новый тред
↓
form slides down
```

Новый flow:

1. Нажатие `+ Новый тред`.
2. Capture GSAP Flip state.
3. Button stretches/morphs.
4. Thread list уходит на ~0.94 scale + blur 2–4px.
5. Launch Bay занимает основной content stage.
6. Focus сразу в title.

Desktop:
- min(1100px, viewport);
- almost full content width;
- не full-screen black modal.

Mobile:
- full-screen sheet/page.

**Commit:** `SIGNAL-13: replace dropdown thread form with Launch Bay`

---

# 18. Блок 14 — Launch Bay title

Title field — самая сильная часть.

НЕ:

```text
label
[ input ]
```

А:

```text
NEW THREAD /hw/
Что сломалось в ИУ7 после обновления?
────────────────────────────────────
```

Input:
- 28–44px font desktop;
- no box;
- no label container;
- underline becomes network route;
- title meter на правом краю.

Empty:
placeholder acts as editorial prompt.

Focus:
small board node lights up.

**Commit:** `SIGNAL-14: create editorial Launch Bay title surface`

---

# 19. Блок 15 — Launch Bay layout

Desktop composition:

LEFT / TOP:
- board identity;
- ANON;
- draft state.

CENTER:
- title;
- large body canvas.

BOTTOM:
- cargo rail;
- action rail.

RIGHT narrow telemetry rail:
- board `/slug/`;
- body integrity;
- attachments `2/4`;
- draft state;
- keyboard hint.

Telemetry rail НЕ должна выглядеть как form sidebar.

Она визуально напоминает instrumentation.

**Commit:** `SIGNAL-15: compose thread creation as launch console`

---

# 20. Блок 16 — launch sequence

Создание треда после API success:

1. TransmitControl charges.
2. Existing WebGL board node gets pulse.
3. Launch Bay surface contracts toward board node.
4. New thread row materializes in list.
5. Optional route navigation only if existing UX requires it.

API failure:
- Launch Bay остаётся открытым;
- title/body/files/draft остаются;
- one short interference animation;
- exact error message visible.

**Commit:** `SIGNAL-16: synchronize thread launch with API and network scene`

---

# 21. Блок 17 — Report Probe

Полностью удалить modal как desktop primary UI.

Click report:
- save source post rect;
- set `reportingPostId`;
- selected post receives diagnostic focus;
- nearby content slightly dims.

Create:

```text
ReportProbe.vue
ReasonConstellation.vue
ProbeFiber.vue
ProbeComment.vue
```

Reason nodes:

```text
spam
abuse
illegal
offtopic
other
```

Не использовать emoji.

Создать 5 простых custom SVG glyphs.

Nodes находятся по arc/radial geometry.

Labels появляются рядом.

Keyboard:
- Tab/arrow support;
- Enter select;
- Esc close.

**Commit:** `SIGNAL-17: replace report modal with anchored Report Probe`

---

# 22. Блок 18 — Report Probe second stage

После выбора причины:

Constellation немного перестраивается.

Выбранный node становится anchor.

Из anchor разворачивается compact comment surface:

```text
ABUSE ●──────────────
      дополнительный комментарий...
                         SEND REPORT
```

Comment optional.

Submit:
- line pulse идёт от probe к reported post;
- только после API success probe закрывается;
- success notice около post, не global toast.

Failure:
- probe остаётся;
- введённый comment остаётся.

**Commit:** `SIGNAL-18: build two-stage diagnostic report flow`

---

# 23. Блок 19 — mobile Report Probe

Radial constellation на 360px не использовать.

Mobile:

Bottom diagnostic sheet.

Но НЕ обычная modal form.

Reason nodes идут vertical signal track:

```text
● SPAM
│
○ ABUSE
│
○ ILLEGAL
│
○ OFFTOPIC
│
○ OTHER
```

Selected node:
- track lights up;
- comment surface появляется ниже.

Swipe/down close optional.

Focus/accessibility обязательны.

**Commit:** `SIGNAL-19: adapt Report Probe into mobile diagnostic track`

---

# 24. Блок 20 — убрать лишние FormField wrappers

После redesign основные flows НЕ должны состоять из:

```text
<FormField>
<FormField>
<FormField>
```

`FormField` оставить только для generic/simple admin-like controls.

Signal Dock / Launch Bay / Report Probe используют специализированные layouts.

Visible UI не должен выглядеть как reusable form library demo.

**Commit:** `SIGNAL-20: remove generic form-stack appearance`

---

# 25. Блок 21 — icons

Убрать emoji из interaction UI:

```text
📎
🚫
⚠️
⛔
💬
❓
```

Создать маленький unified SVG icon set:

```text
Attach
Transmit
Clear
Reply
Report
Spam
Abuse
Illegal
Offtopic
Other
Close
Buffer
Command
```

Rules:
- same stroke;
- same corner treatment;
- currentColor;
- 16/20/24 sizes.

Не добавлять тяжёлую icon library ради 12 glyphs.

**Commit:** `SIGNAL-21: create custom network glyph set`

---

# 26. Блок 22 — no rectangles everywhere

Visual audit.

Запрет:
- каждая функция = rectangular card;
- каждый control = rounded pill;
- все действия в одинаковых boxes.

Использовать разнообразие:

```text
text action
node
rail
fiber
capsule
orbit
underline
surface
```

Rounded rectangle использовать только если действительно нужна область hit target.

Hit area можно увеличить pseudo-element'ом без видимой кнопки.

**Commit:** `SIGNAL-22: remove card-and-pill monoculture`

---

# 27. Блок 23 — interaction choreography

Все transitions должны быть связаны.

Reply:
`post → fiber → dock → transmit → network → new post`

Thread:
`button → Launch Bay → transmit → board node → row`

Report:
`post → probe → reason node → report pulse → post`

Это три законченных micro-stories.

Не добавлять random animation вне этих историй.

**Commit:** `SIGNAL-23: unify composer interaction choreography`

---

# 28. Блок 24 — scene integration

Расширить existing `sceneState` events:

```text
composer-focus
composer-blur
composer-transmit
thread-launch
report-open
report-submit
```

WebGL:
- реагирует subtle;
- НЕ становится главным внутри form.

Focus composer:
- nearby node brightens.

Transmit:
- packet.

Report:
- local danger node.

Launch:
- board cluster reacts.

**Commit:** `SIGNAL-24: connect UI stories to spatial network`

---

# 29. Блок 25 — async tests

Обязательные regression tests.

## Reply

1. type message;
2. submit;
3. parent API pending;
4. body НЕ очищен;
5. success → clear;
6. failure → body/draft remain.

## Thread

То же для title/body/files.

## Report

1. select reason;
2. add comment;
3. submit;
4. failure → probe remains;
5. success → closes.

Это важнее декоративных snapshot tests.

**Commit:** `SIGNAL-25: lock correct async form lifecycle`

---

# 30. Блок 26 — interaction tests

Добавить tests:

Signal Dock:
- focus morph state;
- command lens keyboard;
- Ctrl/Cmd+Enter;
- reply context;
- draft.

Cargo Rail:
- click;
- drag;
- paste;
- invalid file;
- removal.

Launch Bay:
- open;
- escape;
- draft;
- submit;
- API failure.

Report Probe:
- reason keyboard navigation;
- second stage;
- Esc;
- failure preservation;
- success close.

**Commit:** `SIGNAL-26: cover original composer interactions`

---

# 31. Блок 27 — mobile acceptance

360 / 390 / 430px.

Check:
- Dock doesn't cover posts;
- safe-area bottom;
- keyboard opening does not destroy layout;
- textarea stays visible above virtual keyboard where browser allows;
- Cargo Rail horizontal scroll;
- Transmit hit target >= 44px;
- Launch Bay usable;
- Diagnostic Track usable.

**Commit:** `SIGNAL-27: stabilize signal UI on mobile`

---

# 32. Блок 28 — motion reduction

`prefers-reduced-motion`:

Disable:
- morph travel;
- moving fiber dash;
- orbit rotations;
- packet travel.

Keep:
- opacity;
- state color;
- static fiber;
- clear focus states.

Functionality unchanged.

**Commit:** `SIGNAL-28: add reduced-motion signal UI`

---

# 33. Definition of Done

Не менять этот список.

DONE только если:

```text
[ ] Reply больше НЕ accordion/dropdown.
[ ] Signal Dock доступен напрямую для ввода.
[ ] Focus раскрывает Dock вверх spatial morph'ом.
[ ] Есть Transmit Control, не обычная rectangular submit button.
[ ] Reply context имеет Context Fiber desktop.
[ ] Attachments находятся в Cargo Rail, не в dashed dropzone.
[ ] Paste image работает.
[ ] `/` или Ctrl/Cmd+K открывает Command Lens.
[ ] Draft отображается как Buffer Beacon.
[ ] Create Thread больше НЕ dropdown под кнопкой.
[ ] Thread button morphs into Launch Bay.
[ ] Title Launch Bay не выглядит как стандартный FormInput.
[ ] Report больше НЕ modal на desktop.
[ ] Reasons больше НЕ grid rectangular cards.
[ ] Desktop Report использует diagnostic constellation.
[ ] Mobile Report использует diagnostic track.
[ ] Emoji interaction icons удалены.
[ ] API failure не очищает form/draft.
[ ] Report закрывается только после реального API success.
[ ] Existing 3D scene integration не сломана.
[ ] verify:3d PASS.
[ ] lint PASS.
[ ] tests PASS.
[ ] build PASS.
```

Если accordion composer / rectangular reason grid остаются основным UX:
задача = PARTIAL.

---

# 34. Что категорически НЕ делать

Не:

- перекрашивать текущий `ComposerShell` и объявлять redesign;
- добавлять ещё один dropdown;
- делать accordion с другой стрелкой;
- складывать 5 `FormField` вертикально;
- делать giant modal;
- делать report через `<select>`;
- делать reasons как 5 обычных rounded cards;
- использовать emoji как production icons;
- рисовать dashed dropzone;
- делать всё pill-shaped;
- делать WYSIWYG toolbar без backend support;
- копировать Raycast/Notion/Discord визуально;
- менять API ради анимации;
- очищать draft до API success.

---

# 35. Checks

В конце:

```bash
npm run verify:3d
npm run lint
npm run test
npm run build
```

Также existing project checks.

Browser QA:
- Chrome;
- Firefox;
- mobile viewport.

---

# 36. Финальный отчёт

Коротко:

```text
SIGNAL CONSOLE status: DONE/PARTIAL

Commits:
- SIGNAL-01 ...
- ...

Reply:
- Signal Dock:
- Context Fiber:
- Command Lens:
- Cargo Rail:
- Async lifecycle:

Thread:
- Launch Bay:
- morph:
- API lifecycle:

Report:
- desktop Probe:
- mobile Track:
- API lifecycle:

Checks:
- verify:3d:
- lint:
- tests:
- build:

Old accordion composer still used: YES/NO
Rectangular reason-card grid still used: YES/NO
Draft cleared before API success: YES/NO
```

Последние три строки обязательны.

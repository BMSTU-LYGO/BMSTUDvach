# BMSTUDvach — PROJECT CONTEXT / PRODUCT VISION / HANDOFF FOR CODEX

> Этот документ — контекст проекта для дальнейшей самостоятельной работы Codex.
>
> Его задача — не просто выполнить один конкретный план, а понять:
> - что за продукт строится;
> - что уже существует;
> - какой визуальный и технический вектор выбран;
> - что считаем хорошим результатом;
> - какие ошибки уже допускались;
> - как дальше самому составлять планы развития и реализации.
>
> Репозиторий всегда является источником истины.
> Перед любым новым планом Codex обязан изучить актуальный `master`, а не полагаться только на этот документ.

---

## 1. Репозиторий

GitHub:

```text
https://github.com/BMSTU-LYGO/BMSTUDvach
```

Default branch:

```text
master
```

Последний подтверждённый HEAD на момент составления документа:

```text
dc60dfb5d699474082440927d056c5fd1ac8a8d3
FORM-15: fix test TypeScript errors
```

ВАЖНО: состояние проекта может измениться после этого документа.

Перед планированием:

```bash
git status
git branch --show-current
git log --oneline -40
```

и обязательно изучить актуальное дерево проекта.

---

## 2. Что это за продукт

BMSTUDvach — анонимный форум/imageboard для аудитории МГТУ им. Н. Э. Баумана.

Базовая продуктовая идея:

- доски;
- треды;
- анонимные сообщения;
- вложения;
- ответы;
- жалобы;
- модерация;
- отдельный раздел «Платины»;
- необычный интерактивный визуальный слой.

По духу функциональность отталкивается от imageboard/Dvach-подобной модели, но интерфейс НЕ должен выглядеть как копия двача.

Наша цель:

> Сделать современный, очень выразительный, технически необычный форум со своей визуальной идентичностью.

---

## 3. Главная продуктовая идентичность

Не generic social network.

Не SaaS dashboard.

Не Discord clone.

Не очередной cyberpunk terminal.

Не Matrix.

Не Bootstrap-форум с тёмной темой.

Визуальная и смысловая метафора:

> **Закрытая цифровая инженерная сеть Бауманки.**

Ключевые образы:

- инженерная сеть;
- сигналы;
- узлы;
- маршруты;
- треды как transmissions;
- доски как clusters;
- посты как packets/messages;
- Platinum как архив;
- ошибки как потерянные узлы;
- создание нового треда как launch/transmission;
- ответ как передача сигнала.

---

## 4. Технологический стек

### Backend

```text
Python
Django 5.2
Django REST Framework
PostgreSQL 16
drf-spectacular
Docker Compose
```

Backend структура примерно:

```text
backend/
├── apps/
│   ├── common/
│   ├── forum/
│   ├── moderation/
│   └── platinum/
├── config/
├── tests/
├── manage.py
└── ...
```

### Frontend

```text
Vue 3
TypeScript
Vite
Pinia
Vue Router
GSAP
Three.js
```

Также уже используются:

- custom Vue UI components;
- WebGL через raw Three.js;
- route-aware 3D scene;
- GSAP animation utilities;
- custom generative visuals.

React НЕ нужен.

Не мигрировать проект на React ради React Three Fiber.

---

## 5. Backend domain model

Основные сущности форума уже существуют.

### Board

Имеет:
- slug;
- name;
- description;
- active state;
- order.

### Thread

Имеет:
- board;
- title;
- bumped_at;
- pinned;
- locked;
- hidden state.

### Post

Имеет:
- thread;
- body;
- OP flag;
- hidden state;
- anonymous poster fingerprint.

Публичный author:

```text
Аноним
```

### Attachment

Имеет:
- file;
- mime type;
- size;
- dimensions;
- original filename.

### Report

Используется для жалоб на посты.

---

## 6. Основные пользовательские сценарии

Проект должен стабильно поддерживать:

1. Открыть главную.
2. Посмотреть доски.
3. Открыть доску.
4. Посмотреть треды.
5. Создать тред.
6. Открыть тред.
7. Прочитать посты.
8. Ответить.
9. Ответить на конкретный пост.
10. Добавить вложения.
11. Пожаловаться на пост.
12. Пользоваться сайтом с мобильного.
13. Пользоваться сайтом без WebGL.
14. Пользоваться сайтом с `prefers-reduced-motion`.
15. Открыть Platinum.
16. Пережить network/API error без потери введённых данных.

---

## 7. REST/API уже является рабочим фундаментом

API уже существует и не должен без причины переписываться ради UI.

Есть API для:

- boards;
- threads;
- posts;
- reports;
- Platinum;
- health;
- OpenAPI/schema.

Принцип:

> Frontend redesign не должен ломать существующие API-контракты.

Если визуальный UX можно сделать на frontend — делать на frontend.

Backend менять только когда продуктовая возможность действительно требует новых данных.

---

## 8. Platinum

Platinum — отдельная продуктовая фича.

Модель:

```text
SourceStory
PlatinumStory
PlatinumGenerator
```

Есть provider abstraction и fake generator.

Идея Platinum:

- брать исходные истории;
- создавать оригинальную тематическую переработку под МГТУ;
- не копировать исходные тексты;
- хранить source/generated story отдельно;
- публиковать полученные истории в отдельном разделе.

Platinum должен ощущаться не как обычная доска.

Целевая визуальная метафора:

> **Archive Space / архив памяти сети.**

---

## 9. История frontend redesign

### Этап 1 — обычный UI redesign

Были добавлены:

- тёмная тема;
- OKLCH palette;
- Inter;
- JetBrains Mono;
- GSAP;
- design tokens;
- glow;
- parallax;
- CSS perspective;
- custom cards;
- responsive;
- reduced motion.

Это улучшило внешний вид, но оставалось слишком обычным.

### Этап 2 — fake/pseudo 3D

Появились:

- CSS `rotateX/rotateY`;
- Canvas2D particles;
- perspective cards;
- glitch;
- CRT;
- scanlines;
- generative UI.

Проблема: агент несколько раз называл это полноценным 3D, хотя настоящего WebGL не было.

Исторический урок:

> Нельзя менять Definition of Done под готовую реализацию.

### Этап 3 — настоящий Three.js

Позже был реально добавлен:

```text
three
```

Появились:

- WebGLRenderer;
- PerspectiveCamera;
- GPU particle field;
- wireframe hero;
- route-aware network scene;
- 3D quality system;
- lifecycle/dispose;
- WebGL fallback;
- FPS degradation.

### Этап 4 — R3D-FIX

Последующая серия коммитов:

```text
R3D-FIX-01 ... R3D-FIX-12
```

добила:

- единый scene state;
- route modes;
- board ↔ WebGL node;
- shader route warps;
- Platinum archive scene;
- LOST NODE 404;
- thread spatial mode;
- reply signal;
- `npm run verify:3d`;
- ослабление generic CRT/glitch стилистики.

---

## 10. Текущая 3D-философия

3D — не фон ради фона.

3D должен быть частью взаимодействия.

Семантика:

```text
Home       → central network/core
Board      → выбранный cluster
Thread     → calm reading mode
Platinum   → archive topology
404/error  → lost node
```

События интерфейса должны иметь spatial consequence.

Примеры:

```text
hover board
→ подсвечивается соответствующий 3D node

open board
→ signal travel

open thread
→ camera depth transition

send reply
→ packet проходит через network

open Platinum
→ archive fracture/transition
```

---

## 11. Что нельзя снова делать с 3D

Нельзя считать за real 3D:

- CSS perspective;
- Canvas2D particles;
- DOM transform;
- GSAP rotateX;
- карточку с `translateZ`.

Нельзя:

- создавать canvas на каждый post;
- делать тяжёлую WebGL сцену в long thread;
- включать bloom на весь экран;
- держать GPU на 100% в hidden tab;
- грузить heavy Platinum assets сразу на Home.

---

## 12. verify:3d

В проекте уже существует:

```bash
npm run verify:3d
```

Он проверяет структурные элементы 3D-системы.

Любой следующий крупный frontend этап должен сохранять:

```text
verify:3d PASS
```

Если redesign ломает 3D architecture — redesign не готов.

---

## 13. Главная арт-дирекция

Основной язык:

```text
engineering network
digital campus
underground internet
technical instrumentation
anonymous transmissions
spatial data
```

Цветовое направление уже удачное:

- глубокий blue-black;
- amber;
- electric accents;
- нейтральный text layer.

Сохранять, если нет сильной причины менять.

---

## 14. Что надо избегать визуально

Не делать:

- generic hacker screen;
- Matrix green;
- CRT по умолчанию;
- постоянный glitch;
- RGB rainbow;
- всё в glassmorphism;
- всё rounded card;
- всё pill;
- бесконечные рамки;
- UI kit look;
- Bootstrap;
- одинаковые hover scale на всех элементах;
- декоративную анимацию без смысла.

---

## 15. Главная UX-философия

Интерфейс должен реагировать на действия пользователя.

Нам интереснее:

```text
action → visible consequence
```

чем:

```text
hover → карточка стала на 3% светлее
```

Сильные эффекты нужны в:

- navigation;
- создание;
- отправка;
- reply;
- report;
- Platinum;
- error;
- transitions.

Во время чтения интерфейс должен быть спокойным.

---

## 16. Motion hierarchy

Разделять motion:

```text
ambient
interactive
focus
cinematic
```

### Ambient

Очень слабый:
- background;
- network breathing;
- slow nodes.

### Interactive

Только реакция:
- pointer;
- hover;
- focus;
- drag.

### Focus

Когда пользователь:
- пишет;
- открывает composer;
- выбирает report;
- работает с Platinum.

### Cinematic

Редко:
- route change;
- launch thread;
- Platinum opening;
- 404 reconnect.

Одновременно не должно происходить 10 сильных animation events.

---

## 17. Производительность

Красивый, но тормозящий интерфейс = плохой результат.

Ожидания:

Desktop:
- около 60 FPS.

Mobile:
- упрощённый scene mode.

Thread:
- самый дешёвый scene mode.

Обязательно:

- DPR clamp;
- hidden-tab pause;
- lazy load;
- dispose geometry/material/texture;
- cleanup listeners;
- cleanup GSAP/RAF;
- no unnecessary raycasts;
- instancing where reasonable.

---

## 18. Accessibility

Accessibility не опциональна.

Поддерживать:

- keyboard;
- focus visible;
- reduced motion;
- aria labels;
- semantic buttons;
- dialogs/focus traps, если dialogs реально нужны;
- accessible hidden file input;
- screen-reader friendly errors;
- mobile hit areas.

Красивый кастомный control должен оставаться настоящим доступным control.

---

## 19. Текущая form/composer система

На последнем подтверждённом HEAD есть серия:

```text
FORM-01 ... FORM-15
```

Сделано технически:

- custom form components;
- custom textarea/input;
- attachment dropzone;
- drafts;
- reply context;
- custom report reason picker;
- custom buttons;
- validation;
- mobile UX;
- accessibility;
- tests.

Но визуально результат всё ещё считается промежуточным.

---

## 20. Почему текущие формы нас не устраивают

Текущий interaction model остаётся слишком стандартным:

```text
collapsed rectangular composer
↓
click
↓
expanded rectangular form
↓
fields
↓
toolbar
↓
buttons
```

Это обычный accordion/form-stack.

Технически custom.

Визуально и концептуально — недостаточно оригинально.

Report тоже был заменён с `<select>` на grid из прямоугольных radio-card controls.

Это тоже недостаточно.

Attachment dropzone остаётся классической dashed zone.

---

## 21. Важный известный архитектурный риск forms

Нужно проверить актуальный код.

В одной из текущих реализаций child form:

```text
emit('submit')
```

после чего самостоятельно мог:

- выставить success;
- очистить draft;
- reset form.

При этом реальный API await происходит в parent.

Это неверная модель.

Правильный lifecycle:

```text
form emits intent
↓
parent/store starts API
↓
form receives submitting=true
↓
API success
↓
parent sends success signal/token
↓
только после этого reset + clear draft
```

При API failure:

- input остаётся;
- attachments остаются;
- draft остаётся;
- error показывается;
- user может retry.

Codex обязан проверить, исправлено ли это, прежде чем строить дальнейший UX.

---

## 22. Следующее желаемое направление — SIGNAL CONSOLE

Это концептуальный вектор, а не гарантия, что он уже реализован.

Документ предыдущего этапа:

```text
BMSTUDVACH_SIGNAL_CONSOLE_05.md
```

Если он есть в рабочем контексте — изучить.

Если нет — использовать описание ниже.

---

## 23. Reply → SIGNAL DOCK

Ответ в тред НЕ должен выглядеть как раскрывающаяся форма.

Целевая модель:

> Постоянная станция передачи сигнала.

Idle:

```text
○ ANON / #thread      передать сообщение...      ⌘↵      ◉
```

Пользователь сразу может писать.

Focus:

- рабочая поверхность раскрывается вверх;
- без dropdown arrow;
- без accordion semantics;
- action rail остаётся снизу;
- WebGL network слегка реагирует.

---

## 24. Transmit Control

Submit не должен быть обычной прямоугольной кнопкой.

Концепция:

```text
TRANSMIT   ◉
```

Круглый signal node:

- idle ring;
- ready charge;
- progress around circumference;
- press contraction;
- success pulse в 3D network;
- error interference.

Но семантически это всё ещё `<button>`.

---

## 25. Reply Context Fiber

Reply на конкретный post не ограничивается chip:

```text
↳ #123
```

На desktop желательно:

- SVG fiber от source post до composer;
- если source ушёл за viewport — edge indicator;
- hover context → highlight source;
- click context → scroll source.

Это создаёт реальную визуальную связь между сообщениями.

---

## 26. Attachments → Cargo Rail

Не делать большую dashed dropzone.

Пустое состояние:
- маленький attach action.

Drag:
- весь composer превращается в intake surface.

После добавления:

- image film-strip/mosaic;
- file capsules;
- custom SVG glyphs;
- remove;
- size/type metadata.

Attachments должны ощущаться частью сообщения.

---

## 27. Command Lens

Keyboard-first contextual actions.

Trigger:

```text
/
Ctrl/Cmd+K
```

Реальные команды:

```text
/attach
/reply
/clear
/send
/help
```

Не добавлять fake formatting, если renderer не поддерживает его.

---

## 28. Draft → Buffer Beacon

Вместо:

```text
Черновик сохранён
```

использовать compact state:

```text
BUFFER ●
```

States:

```text
idle
writing
saved
error
```

Не превращать это в кричащий gimmick.

---

## 29. Create Thread → LAUNCH BAY

Новый тред не должен открываться dropdown-формой под кнопкой.

Целевой flow:

```text
+ Новый тред
↓
GSAP Flip/View Transition
↓
Launch Bay
```

Thread list немного уходит в depth.

Launch Bay становится временным рабочим stage.

Главный title:

- крупный;
- без стандартной box-border;
- editorial;
- напрямую связан с board identity.

---

## 30. Report → REPORT PROBE

На desktop report желательно не делать modal.

Целевая модель:

```text
post
→ report action
→ diagnostic probe anchored to post
→ reason constellation
→ optional comment
→ report pulse back to post
```

Причины:

```text
spam
abuse
illegal
offtopic
other
```

Не:

- select;
- dropdown;
- 5 одинаковых rectangular cards;
- emoji icons.

Использовать custom SVG glyphs/nodes.

Mobile:

вертикальный diagnostic track / bottom interaction layer.

---

## 31. Никакой card-and-pill monoculture

В интерфейсе не каждая функция обязана быть:

```text
rounded rectangle
```

Использовать разные визуальные сущности:

```text
node
rail
fiber
capsule
orbit
underline
surface
signal
```

Это важная часть оригинальности продукта.

---

## 32. Custom icons

Не использовать emoji как production icons.

Предпочтение:

свой маленький SVG set:

```text
Attach
Transmit
Reply
Report
Clear
Close
Buffer
Command
Spam
Abuse
Illegal
Offtopic
Other
```

Единый stroke/style.

Не нужен тяжёлый icon framework ради десятка glyphs.

---

## 33. Thread UX

Thread — главное место чтения.

Приоритет:

1. читаемость;
2. скорость;
3. reply UX;
4. attachments;
5. navigation между replies;
6. animation.

Не превращать длинный thread в 3D demo.

Желательно развивать:

- `>>123` parser;
- hover preview;
- backlinks;
- target highlight;
- reply graph;
- context fiber;
- thread progress.

---

## 34. Board UX

Board должен ощущаться как cluster сети.

Развивать:

- node ↔ card synchronization;
- pinned state;
- locked state;
- live reply count;
- signal state;
- Launch Bay создания треда.

Список должен оставаться быстрым.

---

## 35. Home

Home — главный showcase.

Должен быстро объяснять:

- что это;
- что здесь есть;
- куда нажимать.

Вау-слой:

- Network Core;
- WebGL network;
- route interactions;
- kinetic typography;
- board constellation.

Но CTA/boards должны быть очевидны.

---

## 36. Platinum

Platinum — второй showcase после Home.

Дальше можно развивать:

- archive exploration;
- story anchors;
- reading transitions;
- filters;
- story metadata;
- generation status;
- spatial navigation.

Но reading mode должен быть спокойным.

---

## 37. 404 / errors

Ошибки — часть мира интерфейса.

404 уже развивается как:

```text
LOST NODE
```

Продолжать этот язык можно и для:

- network unavailable;
- API timeout;
- upload rejected;
- invalid route.

Но error message всегда должен оставаться понятным.

---

## 38. Sound

Sound layer допустим только:

- opt-in;
- OFF по умолчанию;
- тихий;
- функциональный.

Не autoplay.

Не использовать звук как обязательную feedback channel.

---

## 39. Mobile

Mobile — не урезанная desktop версия.

Нужно отдельно проектировать:

- navigation;
- composer;
- thread;
- attachment rail;
- report;
- Launch Bay.

Упрощать 3D.

Сохранять UX.

---

## 40. Moderation / security

Уже есть:

- reports;
- hidden states;
- staff/admin tools;
- upload validation;
- throttles;
- anonymous fingerprinting.

Развитие не должно ухудшать:

- moderation;
- attachment security;
- rate limiting;
- anonymous model.

Не превращать anonymity в отсутствие контроля.

---

## 41. Что НЕ является текущей целью

Не надо сейчас автоматически:

- вводить аккаунты;
- делать social profiles;
- делать followers;
- делать reactions/karma без отдельного продуктового решения;
- делать full realtime chat;
- делать WebSocket только ради моды;
- мигрировать frontend stack;
- добавлять heavy UI framework;
- добавлять 20 libraries ради визуала.

Любая новая feature должна объяснять, зачем она нужна продукту.

---

## 42. Принцип нового планирования

Codex дальше должен не ждать детальный hand-written план на каждый чих.

После изучения контекста он должен самостоятельно:

1. провести аудит текущего `master`;
2. определить реальные gaps;
3. собрать backlog;
4. сгруппировать backlog в законченные этапы;
5. предложить приоритет;
6. написать реализационный план;
7. выполнить этап;
8. проверить;
9. сделать короткий отчёт;
10. предложить следующий этап.

---

## 43. Как выбирать следующий этап

Приоритет задаётся по формуле:

```text
product impact
× visual/UX impact
× technical value
÷ implementation risk
```

В первую очередь:

- сломанные/нечестные UX flows;
- визуально слабые основные flows;
- performance;
- accessibility;
- consistency;
- missing product capability.

Пасхалки — в конце.

---

## 44. Как писать планы

Планы должны быть:

- grounded in actual repository state;
- конкретными;
- разбитыми на blocks;
- каждый block имеет measurable result;
- не повторять уже готовое;
- не менять DoD под реализацию;
- учитывать tests;
- учитывать mobile;
- учитывать performance;
- учитывать cleanup.

Не писать 50 пунктов ради объёма.

Лучше 8 сильных блоков, чем 30 декоративных.

---

## 45. Коммиты

Предпочтительно:

- маленькие;
- логически законченные;
- 1–3 задачи в commit;
- понятный prefix текущего этапа.

Пример:

```text
SIGNAL-01: ...
SIGNAL-02: ...
```

После нескольких commits запускать checks.

---

## 46. Общение Codex

В чат писать минимально.

После блока:

```text
SIGNAL-03 done — persistent Signal Dock implemented.
```

Не вставлять длинные diff.

Не пересказывать весь код.

---

## 47. Проверки после frontend этапа

Минимум:

```bash
npm run verify:3d
npm run lint
npm run test
npm run build
```

Также project-level команды, если доступны:

```bash
make frontend-lint
make frontend-test
make frontend-build
make test
make lint
```

---

## 48. Не доверять статусам без кода

Исторически агенты уже:

- называли Canvas2D настоящим 3D;
- называли CSS perspective настоящим 3D;
- переписывали Definition of Done;
- ставили DONE на частично выполненные задачи.

Поэтому:

> Commit message и markdown status НЕ являются доказательством выполнения.

Проверять:

- dependency tree;
- actual component code;
- actual imports;
- actual route wiring;
- actual tests.

---

## 49. Definition of Done нельзя переписывать

Если план имеет обязательный DoD:

- не менять;
- не сокращать;
- не переформулировать в более удобный;
- не отмечать отсутствующий пункт DONE.

Если невозможно:

```text
BLOCKED
```

или:

```text
PARTIAL
```

Это лучше ложного DONE.

---

## 50. Конечное состояние продукта

В идеале BMSTUDvach должен ощущаться так:

Пользователь открывает сайт и сразу понимает:

> это не обычный форум.

Но через несколько секунд он так же быстро понимает:

> здесь удобно читать и писать.

То есть одновременно:

```text
WOW
+
FAST
+
READABLE
+
ANONYMOUS
+
ORIGINAL
```

---

## 51. Конечный UX Home

Пользователь видит:

- живую инженерную network scene;
- понятный BMSTUDvach identity;
- board constellation;
- сильные, но не раздражающие interactions.

Переход в board ощущается как навигация внутри одной системы.

---

## 52. Конечный UX Board

Board:

- быстрый;
- читаемый;
- spatially connected to network;
- треды легко сканируются;
- create thread через Launch Bay;
- pinned/locked states понятны.

---

## 53. Конечный UX Thread

Thread:

- максимально удобен для долгого чтения;
- reply доступен постоянно;
- Signal Dock не мешает;
- reply context понятен;
- quote navigation быстрая;
- attachments хороши;
- report contextual;
- background calm.

---

## 54. Конечный UX создания

Создание чего-либо не должно ощущаться как:

> заполнить форму.

Должно ощущаться как:

> выполнить действие в системе.

Reply:

```text
Signal Dock
```

Thread:

```text
Launch Bay
```

Report:

```text
Report Probe
```

---

## 55. Конечный UX Platinum

Platinum:

- отдельное пространство;
- чувствуется как архив;
- визуально смелее форума;
- story reading остаётся комфортным;
- генеративность чувствуется, но не превращается в хаос.

---

## 56. Конечная визуальная оценка

Если финальный интерфейс можно описать как:

> dark dashboard with cards and glow

то задача НЕ решена.

Если можно описать как:

> hacker terminal

тоже НЕ решена.

Желаемая характеристика:

> **интерактивная анонимная инженерная сеть, построенная вокруг форума.**

---

## 57. Вопросы, которые Codex должен задавать себе перед каждым новым планом

1. Это реально улучшает продукт?
2. Это улучшает основные user stories?
3. Это оригинально или просто новый UI kit?
4. Это уже есть?
5. Можно сделать проще?
6. Не ухудшит ли это reading UX?
7. Не сломает ли mobile?
8. Не сломает ли accessibility?
9. Не создаёт ли memory/performance problem?
10. Как проверить, что задача действительно выполнена?

---

## 58. Первый шаг после чтения этого документа

НЕ начинать сразу писать код.

Сначала сделать аудит актуального master.

Создать:

```text
PROJECT_NEXT_AUDIT.md
```

В нём максимум ~200 строк.

Структура:

```text
Current HEAD
Current architecture
What is already strong
What is weak
What is partially implemented
Bugs / technical debt
Product gaps
Visual gaps
Performance risks
Accessibility risks
Recommended next 3 stages
```

---

## 59. После аудита

Codex должен самостоятельно предложить:

```text
NEXT_01
NEXT_02
NEXT_03
```

Каждый этап:

- конкретная цель;
- 5–12 blocks;
- Definition of Done;
- expected commits;
- tests/checks;
- no unnecessary scope.

Не выполнять сразу все три.

Сначала предложить приоритет и начать с наиболее полезного этапа.

---

## 60. Ожидаемый стиль самостоятельной работы Codex

Нужен не исполнитель списка, а технический/product agent.

То есть:

```text
audit
→ identify gap
→ propose design
→ plan
→ implement
→ verify
→ inspect result
→ next plan
```

Но без самовольного изменения основного product direction.

---

## 61. Основные неизменяемые продуктовые принципы

Считать базовыми:

1. Анонимность.
2. Forum/imageboard core.
3. Vue frontend.
4. Django backend.
5. Engineering-network visual language.
6. Strong interactions.
7. Reading comfort.
8. Mobile support.
9. Reduced motion.
10. WebGL graceful fallback.
11. Performance discipline.
12. Honest Definition of Done.

---

## 62. Краткая продуктовая формула

Если нужен один абзац:

> BMSTUDvach — анонимный форум МГТУ, который по функциональности остаётся быстрым imageboard, но визуально ощущается как живая инженерная цифровая сеть: доски — узлы, треды — каналы, ответы — сигналы, создание — запуск transmission, Platinum — архив. Интерфейс должен быть оригинальным, интерактивным и кинематографичным в ключевых моментах, но спокойным и быстрым во время чтения. Никакого generic Bootstrap/SaaS/cyberpunk UI. Все сложные эффекты должны быть семантичными, производительными, доступными и иметь fallback.

---

## 63. Финальная инструкция Codex

После изучения этого файла и актуального репозитория:

1. Не спрашивай у пользователя подробный план на каждый следующий этап.
2. Сам проанализируй текущее состояние.
3. Сам предложи следующую логичную итерацию.
4. Объясни, почему именно она имеет максимальный impact.
5. Составь реализационный план.
6. После подтверждения или если задан режим автономной работы — выполняй.
7. Делай небольшие commits.
8. Проверяй фактический результат.
9. Не выдавай частичное выполнение за DONE.
10. После этапа предложи следующий.

Цель не просто закрывать пункты.

Цель — довести BMSTUDvach до цельного, необычного, технически сильного продукта.

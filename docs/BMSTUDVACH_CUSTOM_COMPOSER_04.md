# BMSTUDVACH_CUSTOM_COMPOSER_04

## Цель

Полностью убрать ощущение стандартных HTML/Bootstrap-подобных форм из BMSTUDvach.

Переработать:
- создание ответа;
- создание треда;
- вложения;
- жалобу;
- validation/loading/success/error states;
- кнопки и controls внутри form-flow.

Backend/API-контракты не менять без необходимости.

## 0. Что сейчас плохо

Сейчас `CreatePostForm.vue` и `CreateThreadForm.vue` — обычные label + input/textarea + видимый native file input + `.btn`. `ReportDialog.vue` использует стандартный `<select>`. Это визуально отстаёт от текущего 3D/engineering-network интерфейса.

Нельзя просто перекрасить старые controls. Нужен отдельный custom component layer.

## 1. Правила

1. Изучить frontend types/API/backend validation перед изменениями.
2. Не менять существующие submit payload.
3. Не добавлять Bootstrap/Vuetify/Quasar и другие тяжёлые UI kits.
4. Native file input допустим только скрытым.
5. Все видимые controls — собственные Vue-компоненты.
6. После каждых 2–3 задач делать commit `FORM-XX: ...`.
7. После каждых 3 commits запускать:

```bash
npm run verify:3d
npm run lint
npm run test
npm run build
```

## 2. Custom form primitives

Создать:

```text
frontend/src/components/form/
├── FormField.vue
├── FormInput.vue
├── FormTextarea.vue
├── FormButton.vue
├── FormIconButton.vue
├── FormNotice.vue
├── CharacterCounter.vue
├── ComposerShell.vue
├── ComposerToolbar.vue
├── AttachmentDropzone.vue
├── AttachmentItem.vue
├── AttachmentGrid.vue
└── ReasonPicker.vue
```

Поддержать состояния:

```text
idle
focused
dirty
submitting
success
error
disabled
```

Стиль: engineering-network / transmission composer. Layered surface, active edge, subtle internal grid, semantic signal light, mono metadata, smooth expansion. Без дешёвого hacker-terminal.

**Commit:** `FORM-01: add custom form system`

## 3. Reply Composer

Полностью переписать `CreatePostForm.vue`.

По умолчанию можно показывать компактный composer:

```text
[ Ответить в тред... ]
```

При focus/click он плавно раскрывается и показывает toolbar, attachments, metadata и submit area.

Textarea:
- autosize;
- min 3 строки;
- max-height + внутренний scroll;
- custom focus state;
- character counter;
- warning около лимита;
- текст не теряется при API error.

Keyboard:
- `Ctrl+Enter` / `Cmd+Enter` = submit;
- `Esc` = collapse только если composer пуст;
- нормальная Tab-навигация.

После успешного ответа:
- сохранить текущий 3D reply signal;
- короткий transmission pulse;
- очистить composer;
- не ломать highlight нового post.

**Commit:** `FORM-02: rebuild reply composer`

## 4. Reply context / цитирование

Добавить action `Ответить` у поста.

При клике:
- в composer вставляется `>>POST_ID`;
- composer фокусируется;
- сверху появляется chip `↳ ответ на #123`;
- chip кликабелен → focus/scroll исходного поста;
- крестик убирает context.

Backend не менять.

**Commit:** `FORM-03: add reply context workflow`

## 5. Custom attachments

Полностью убрать видимый native file input.

`AttachmentDropzone` должен поддерживать:
- click to browse;
- drag&drop;
- paste изображений из clipboard;
- multiple files;
- remove до submit.

Для изображений:
- thumbnail;
- filename;
- size;
- remove;
- processing state.

Для остальных допустимых типов:
- custom file card;
- extension/icon;
- size.

Frontend validation синхронизировать с backend: MIME, size и количество файлов. Invalid file показывать как inline error card.

При dragover весь composer должен реагировать и показывать overlay `Отпустить файлы в канал`.

**Commit:** `FORM-04: build custom attachment system`

## 6. Drafts

Добавить localStorage drafts:
- reply → key по thread id;
- create thread → key по board slug.

Сохранять title/body debounce-ом. File objects не сохранять.

Показывать спокойный status `черновик сохранён`.

После успешного submit draft удалить. Добавить `Очистить`.

**Commit:** `FORM-05: add composer drafts`

## 7. Thread Composer

Полностью переписать `CreateThreadForm.vue` на тот же component layer.

Header:

```text
NEW THREAD /{board}/
```

Title:
- крупная custom typography;
- active underline/signal;
- counter;
- field-level validation.

Body:
- общий `FormTextarea`;
- autosize;
- attachments через общий Dropzone.

Action bar:
- `Создать тред`;
- draft status;
- attachment count;
- shortcut hint.

При submit controls переходят в signal/progress state, но title/body остаются видимыми.

**Commit:** `FORM-06: rebuild thread composer`

## 8. Composer toolbar

Не делать fake WYSIWYG.

Добавлять только реально работающие actions:
- attachment;
- clear draft;
- expand/collapse;
- quote/reply context.

Не добавлять Bold/Italic, если renderer это не поддерживает.

Toolbar должен быть keyboard accessible и нормально работать на touch.

**Commit:** `FORM-07: add composer toolbar`

## 9. ReportDialog

Полностью убрать visible native `<select>`.

Создать `ReasonPicker` с custom selectable cards/chips:

```text
[ Спам ]
[ Оскорбление ]
[ Незаконный контент ]
[ Оффтоп ]
[ Другое ]
```

Selected state должен быть очевидным и доступным с keyboard.

Комментарий:
- custom textarea;
- counter;
- helper text.

Сохранить:
- focus trap;
- Escape;
- overlay click;
- aria modal.

Добавить return-focus к trigger после закрытия.

На mobile можно превращать modal в bottom sheet.

**Commit:** `FORM-08: rebuild report flow`

## 10. Custom buttons

В form flows убрать прямые `.btn btn-primary/danger/ghost` и использовать `FormButton`.

Variants:

```text
primary
secondary
ghost
danger
signal
```

Поддержать:
- icon;
- loading;
- disabled;
- success;
- full-width mobile.

Magnetic effect только на важных desktop CTA. Не применять к destructive report button.

**Commit:** `FORM-09: replace generic form buttons`

## 11. Validation UX

Перейти от одного общего error-текста к field-level validation.

Требования:
- frontend rules соответствуют backend constraints;
- `aria-invalid`;
- `aria-describedby`;
- error рядом с полем;
- server/API error остаётся в `FormNotice`;
- не валидировать агрессивно до первого interaction.

**Commit:** `FORM-10: add field-level validation`

## 12. Loading / success / failure motion

Submitting:
- progress signal по нижней границе composer;
- duplicate submit заблокирован;
- label кнопки меняется.

Success:
- короткий accent pulse;
- без огромных success-screen.

Failure:
- короткий danger pulse;
- введённые данные сохраняются.

Reduced-motion → только state/opacity changes.

**Commit:** `FORM-11: add submission feedback`

## 13. 3D integration

Очень умеренно использовать существующий scene event bus.

- composer focus → subtle scene focus;
- modal open → scene slightly dim;
- submit → существующий signal event;
- error → без WebGL explosions.

Формы остаются DOM-first.

**Commit:** `FORM-12: integrate forms with scene focus`

## 14. Mobile

Проверить 360–430px.

Reply composer:
- почти full-width;
- удобная textarea;
- compact toolbar;
- touch-friendly attachment cards;
- submit target >= 44px.

Thread composer:
- последовательный layout.

Report:
- bottom-sheet style допустим.

**Commit:** `FORM-13: optimize mobile form UX`

## 15. Accessibility

Обязательно:
- реальные labels/aria-labelledby;
- hidden file input keyboard-accessible;
- dropzone активируется keyboard;
- errors связаны через aria-describedby;
- reason picker имеет radio semantics;
- focus-visible;
- dialog return-focus;
- validation не теряет focus.

**Commit:** `FORM-14: harden form accessibility`

## 16. Tests

Добавить/обновить tests.

CreatePostForm:
- empty validation;
- payload;
- Ctrl/Cmd+Enter;
- add/remove attachments;
- draft restore;
- API error preserves body.

CreateThreadForm:
- title/body validation;
- attachments;
- draft restore/clear;
- submit payload.

ReportDialog:
- reason picker;
- keyboard;
- Escape;
- submit;
- focus trap.

Dropzone:
- invalid MIME;
- oversize;
- remove;
- paste/drop.

**Commit:** `FORM-15: cover custom composer interactions`

## 17. Final cleanup

Удалить obsolete duplicated form CSS (`.field`, `.actions`, старые create-form styles).

В основных flow не должно оставаться:
- visible native file inputs;
- visible native selects;
- старых generic form buttons.

Проверить вручную:
- reply;
- create thread;
- report;
- attachments;
- errors;
- mobile.

## Definition of Done

```text
[ ] CreatePostForm полностью кастомный.
[ ] CreateThreadForm полностью кастомный.
[ ] ReportDialog без visible native select.
[ ] Visible native file input отсутствует.
[ ] Drag&drop attachments работает.
[ ] Paste image работает.
[ ] Attachment previews/remove работают.
[ ] Autosize textarea работает.
[ ] Ctrl/Cmd+Enter submit работает.
[ ] Drafts для reply/thread работают.
[ ] Reply context >>ID работает.
[ ] Field-level validation есть.
[ ] Loading/success/error states кастомные.
[ ] Mobile UX нормальный.
[ ] Accessibility сохранена.
[ ] API payload не изменён.
[ ] npm run verify:3d PASS.
[ ] npm run lint PASS.
[ ] npm run test PASS.
[ ] npm run build PASS.
```

DoD не упрощать и не переписывать под готовую реализацию.

## Финальный отчёт

```text
CUSTOM FORMS complete.

Commits:
- FORM-01 ...
- ...

Composer:
- reply:
- thread:
- drafts:
- keyboard:

Attachments:
- drop:
- paste:
- previews:
- validation:

Report:
- reason picker:
- a11y:

Checks:
- verify:3d:
- lint:
- tests:
- build:

Known issues:
- ...
```

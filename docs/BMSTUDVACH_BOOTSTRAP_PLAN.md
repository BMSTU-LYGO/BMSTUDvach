# BMSTUDvach — план первичной сборки проекта

## 0. Цель этого плана

Собрать устойчивый фундамент `BMSTUDvach` — форума для МГТУ им. Н. Э. Баумана в духе классических имиджборд/форумов:

- backend: Django + Django REST Framework;
- frontend: Vue 3;
- база данных: PostgreSQL;
- локальная разработка: Docker Compose;
- API между frontend и backend;
- базовые сущности форума: разделы, треды, посты, вложения, реакции/жалобы;
- анонимный режим как основной сценарий, с возможностью добавить аккаунты позже;
- архитектурная точка расширения под LLM-функцию генерации «платин»;
- тесты, линтеры, единый запуск и документация.

Этот этап НЕ должен пытаться сразу реализовать весь продукт. Его задача — получить чистый, запускаемый skeleton/MVP, на который следующие агенты смогут безопасно наращивать функциональность.

---

# 1. Правила работы для локального агента

## 1.1. Перед изменениями

Сначала выполнить аудит текущей локальной папки репозитория:

1. `git status`
2. `git branch --show-current`
3. `git log --oneline -10`
4. вывести дерево проекта до глубины 3–4 уровней;
5. найти существующие:
   - `README*`;
   - `docker-compose*`;
   - `pyproject.toml`, `requirements*.txt`;
   - `package.json`;
   - `.env.example`;
   - `Makefile`;
   - Django/Vue-код;
   - CI-конфигурацию.

Не удалять и не переписывать существующий рабочий код без необходимости.

Если часть предлагаемой структуры уже существует — адаптировать план под неё, а не создавать дубль.

## 1.2. Стиль работы

- Работать небольшими законченными блоками.
- После каждого блока запускать связанные проверки.
- Не оставлять заведомо сломанное состояние между коммитами.
- Не коммитить секреты, `.env`, ключи API, дампы БД, node_modules, venv.
- Не добавлять тяжёлые зависимости без необходимости.
- Не строить premature microservices: на первом этапе использовать модульный Django-монолит + отдельный Vue frontend.
- API проектировать так, чтобы LLM-модуль позже можно было вынести отдельно.

## 1.3. Коммиты

После каждых 2–4 логически связанных шагов делать коммит.

Формат:

`BOOT-XX: краткое описание`

Примеры:

- `BOOT-01: initialize backend and frontend layout`
- `BOOT-02: add local docker development stack`
- `BOOT-03: add forum domain models`
- `BOOT-04: expose forum REST API`
- `BOOT-05: add Vue forum shell`
- `BOOT-06: integrate frontend with API`
- `BOOT-07: add tests and developer tooling`

Не делать один огромный итоговый коммит.

---

# 2. Целевая структура репозитория

Агент должен привести проект примерно к такой структуре, адаптировав её под уже существующие файлы:

```text
BMSTUDvach/
├── backend/
│   ├── manage.py
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── local.py
│   │   │   └── production.py
│   │   ├── urls.py
│   │   ├── asgi.py
│   │   └── wsgi.py
│   ├── apps/
│   │   ├── common/
│   │   ├── forum/
│   │   ├── moderation/
│   │   └── platinum/
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── router/
│   │   ├── stores/
│   │   ├── views/
│   │   └── App.vue
│   ├── package.json
│   └── vite.config.*
├── infra/
│   └── ...
├── .env.example
├── .gitignore
├── compose.yaml
├── Makefile
└── README.md
```

`apps/platinum` на первом этапе может содержать только интерфейсы/заглушки. Не требуется сразу подключать реальную LLM.

---

# 3. Блок 1 — базовый каркас backend

## 3.1. Создать Django-проект

Если backend ещё отсутствует:

- создать `backend/`;
- настроить Django;
- добавить Django REST Framework;
- подготовить раздельные настройки `base/local/production`;
- настройки получать из переменных окружения.

Минимальные env-параметры:

```env
DJANGO_SECRET_KEY=
DJANGO_DEBUG=
DJANGO_ALLOWED_HOSTS=
POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_HOST=
POSTGRES_PORT=
CORS_ALLOWED_ORIGINS=
```

## 3.2. Подготовить Django apps

Создать:

### `common`

Общие утилиты, базовые модели, shared validators/helpers.

### `forum`

Основная предметная область форума.

### `moderation`

Жалобы, скрытие и будущие инструменты модераторов.

### `platinum`

Граница будущей LLM-функциональности.

На данном этапе `platinum` не должен содержать жёсткую привязку к OpenAI/Anthropic/локальной модели.

## 3.3. Health endpoint

Добавить:

`GET /api/v1/health/`

Ответ:

```json
{
  "status": "ok"
}
```

Endpoint должен работать без авторизации и использоваться Docker/CI/smoke-тестами.

## 3.4. Результат блока

Backend:

- стартует;
- подключается к PostgreSQL;
- выполняет миграции;
- отвечает на `/api/v1/health/`;
- имеет понятную модульную структуру.

### Коммит

`BOOT-01: initialize Django backend`

---

# 4. Блок 2 — Docker и локальный запуск

## 4.1. Docker Compose

Добавить сервисы:

- `db` — PostgreSQL;
- `backend` — Django;
- `frontend` — Vue dev server.

Не добавлять Redis/Celery на этом этапе, если они реально ещё не нужны.

## 4.2. Volume и networking

Обеспечить:

- сохранение PostgreSQL data;
- hot reload backend;
- hot reload frontend;
- обращение backend к БД по имени docker-сервиса.

## 4.3. Makefile

Минимальные команды:

```bash
make up
make down
make build
make logs
make backend-shell
make migrate
make makemigrations
make test
make lint
```

Желательно также:

```bash
make frontend-install
make frontend-lint
```

## 4.4. `.env.example`

Добавить безопасный пример без настоящих секретов.

## 4.5. Результат блока

Новый разработчик должен получить проект и запустить основной стек максимально близко к:

```bash
cp .env.example .env
make up
```

### Коммит

`BOOT-02: add local Docker development stack`

---

# 5. Блок 3 — доменная модель форума

На первом этапе использовать простую модель классического форума/имиджборда.

## 5.1. Board

Поля:

- `id`;
- `slug`;
- `name`;
- `description`;
- `is_active`;
- `created_at`;
- `updated_at`.

Примеры будущих разделов:

- `/b/` — разное;
- `/study/` — учёба;
- `/faculties/` или отдельные факультетские разделы;
- `/campus/` — жизнь в вузе;
- `/platinum/` — истории/платины.

Не хардкодить реальные разделы в бизнес-логике.

## 5.2. Thread

Поля:

- `id`;
- `board`;
- `title`;
- `created_at`;
- `updated_at`;
- `bumped_at`;
- `is_locked`;
- `is_pinned`;
- `is_hidden`.

Создание треда должно одновременно предполагать создание первого поста.

## 5.3. Post

Поля:

- `id`;
- `thread`;
- `body`;
- `created_at`;
- `updated_at`;
- `is_op`;
- `is_hidden`;
- анонимный идентификатор/technical fingerprint только в объёме, необходимом продукту и модерации.

Не сохранять лишние персональные данные.

На UI пользователь по умолчанию отображается как `Аноним`.

## 5.4. Attachment

Подготовить сущность вложения:

- `post`;
- `file`;
- `mime_type`;
- `size`;
- `width`;
- `height`;
- `created_at`.

На первом этапе ограничить разрешённые типы файлов и размер.

Не реализовывать произвольную загрузку исполняемых файлов.

## 5.5. Report

Поля:

- `post`;
- `reason`;
- `comment`;
- `status`;
- `created_at`.

Минимальные статусы:

- `new`;
- `reviewed`;
- `dismissed`;
- `actioned`.

## 5.6. Ограничения моделей

Добавить необходимые:

- индексы;
- `ordering`;
- unique constraints;
- foreign-key behavior;
- валидацию пустых сообщений;
- ограничения размеров текста там, где это разумно.

## 5.7. Django Admin

Зарегистрировать основные модели для локальной разработки и ручной проверки.

## 5.8. Результат блока

Можно через Django shell/admin:

- создать раздел;
- создать тред;
- создать несколько постов;
- прикрепить допустимый файл;
- отправить жалобу.

### Коммит

`BOOT-03: add forum domain models`

---

# 6. Блок 4 — REST API форума

Использовать namespace:

`/api/v1/`

## 6.1. Boards

Реализовать:

```text
GET /api/v1/boards/
GET /api/v1/boards/{slug}/
```

## 6.2. Threads

Реализовать:

```text
GET  /api/v1/boards/{slug}/threads/
POST /api/v1/boards/{slug}/threads/
GET  /api/v1/threads/{id}/
```

При создании треда запрос должен включать данные первого поста.

## 6.3. Posts

Реализовать:

```text
POST /api/v1/threads/{id}/posts/
```

При необходимости:

```text
GET /api/v1/posts/{id}/
```

Не плодить CRUD endpoints, которые пока не нужны UI.

## 6.4. Reports

```text
POST /api/v1/posts/{id}/reports/
```

## 6.5. Пагинация

Добавить пагинацию списков тредов.

Тред при открытии может на первом этапе возвращать посты в одном payload, если объём ограничен; архитектура должна позволять позже вынести pagination постов отдельно.

## 6.6. Ошибки API

Унифицировать формат ошибок.

Пример:

```json
{
  "detail": "Validation error",
  "errors": {
    "body": ["This field may not be blank."]
  }
}
```

Не отдавать production-клиенту traceback.

## 6.7. OpenAPI

Подключить генерацию OpenAPI schema и простую Swagger/Redoc страницу для разработки.

## 6.8. Результат блока

API должен позволять пройти сценарий:

1. получить список разделов;
2. открыть раздел;
3. создать тред;
4. получить тред;
5. отправить ответ;
6. отправить жалобу.

### Коммит

`BOOT-04: expose forum REST API`

---

# 7. Блок 5 — каркас Vue frontend

Использовать:

- Vue 3;
- Vite;
- Vue Router;
- Pinia — только там, где действительно нужно shared state;
- обычный API client через `fetch` или лёгкий HTTP-клиент.

Не подключать тяжёлую UI-библиотеку без необходимости.

## 7.1. Базовые маршруты

Создать:

```text
/                         главная
/:board                   страница раздела
/:board/thread/:threadId  страница треда
```

Дополнительно:

```text
/platinum                 будущая страница платин
/about                    коротко о проекте
```

Если `/platinum` конфликтует со slug board — выбрать явную схему маршрутов, например `/boards/:board`.

Предпочтительный более устойчивый вариант:

```text
/
/boards/:boardSlug
/threads/:threadId
/platinum
/about
```

## 7.2. Layout

Создать основной layout:

- шапка;
- название BMSTUDvach;
- навигация по разделам;
- область контента;
- footer.

Визуально можно ориентироваться на лаконичный old-school forum/imageboard стиль, но не копировать интерфейс конкретного сайта один в один.

## 7.3. Компоненты

Минимально:

- `BoardList`;
- `ThreadCard`;
- `ThreadList`;
- `PostCard`;
- `CreateThreadForm`;
- `CreatePostForm`;
- `AttachmentPreview`;
- `ReportDialog`;
- `LoadingState`;
- `ErrorState`;
- `EmptyState`.

## 7.4. Состояния интерфейса

Каждый экран должен корректно показывать:

- загрузку;
- пустой результат;
- ошибку API;
- успешное действие.

## 7.5. Результат блока

Frontend запускается независимо и имеет все необходимые страницы, даже если часть данных пока mocked/stubbed.

### Коммит

`BOOT-05: add Vue forum application shell`

---

# 8. Блок 6 — интеграция Vue ↔ Django

## 8.1. API client

Создать единый слой, например:

```text
frontend/src/api/client.ts
frontend/src/api/boards.ts
frontend/src/api/threads.ts
frontend/src/api/posts.ts
```

Не делать HTTP-вызовы хаотично внутри компонентов.

## 8.2. Настройка base URL

Использовать переменную окружения Vite:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## 8.3. CORS

Разрешить только ожидаемые origins через env-конфигурацию backend.

## 8.4. Реальные user stories

Обязательно руками проверить:

### Story A

Пользователь открывает главную → видит существующие разделы.

### Story B

Пользователь открывает раздел → видит список актуальных тредов.

### Story C

Пользователь создаёт новый тред → тред появляется в разделе → открывается его страница.

### Story D

Пользователь открывает тред → видит OP и ответы.

### Story E

Пользователь отправляет ответ → пост появляется без ручного перезапуска backend.

### Story F

Пользователь отправляет жалобу → получает подтверждение.

## 8.5. Результат блока

Frontend полностью работает на реальном Django API без mock-данных для основных форумных операций.

### Коммит

`BOOT-06: integrate Vue frontend with forum API`

---

# 9. Блок 7 — фундамент «Платин»

На этом этапе НЕ делать полноценный сбор данных с внешних сайтов и НЕ подключать финальную модель.

Нужно заложить корректную архитектуру.

## 9.1. Сущность PlatinumStory

Пример полей:

- `id`;
- `title`;
- `body`;
- `source_type`;
- `status`;
- `generation_metadata` JSON;
- `created_at`;
- `published_at`.

Статусы:

- `draft`;
- `generated`;
- `approved`;
- `published`;
- `rejected`.

## 9.2. Интерфейс генератора

Создать service-level interface, например:

```python
class PlatinumGenerator:
    def generate(self, source_story, context) -> GeneratedStory:
        ...
```

Конкретный LLM provider должен подключаться адаптером.

Например будущие реализации:

```text
OpenAIPlatinumGenerator
LocalModelPlatinumGenerator
FakePlatinumGenerator
```

Для dev/test использовать fake generator.

## 9.3. Источники

Не проектировать систему как «скачать весь Двач и скормить модели».

Заложить сущность/формат `SourceStory`, чтобы оригинальные сюжеты могли попадать в систему из заранее отобранного, законно доступного набора источников.

Хранить provenance:

- откуда взят источник;
- его внутренний/внешний identifier;
- дата добавления;
- статус разрешённости/использования;
- hash для дедупликации.

## 9.4. Трансформация

Будущий pipeline должен быть примерно:

```text
source story
    ↓
extract story structure
    ↓
remove identifying/source-specific surface details
    ↓
apply BMSTU context
    ↓
LLM generation
    ↓
safety/quality validation
    ↓
human review
    ↓
publish
```

Важно: задача — создавать самостоятельные переработанные истории в тематике МГТУ, а не выдавать копии исходного текста с механической заменой названий.

## 9.5. Контекст МГТУ

Будущий контекст вынести отдельно от prompt.

Пример структуры:

```text
platinum/context/
├── faculties.*
├── buildings.*
├── student_slang.*
├── subjects.*
└── archetypes.*
```

На первом этапе достаточно интерфейса загрузки контекста и тестового мини-набора без спорных персональных данных.

## 9.6. API-заглушка

Можно создать dev-only или staff endpoint генерации через Fake generator, чтобы проверить pipeline без реального LLM API.

Не размещать секрет API в frontend.

## 9.7. Результат блока

Есть расширяемый LLM module, но запуск проекта не зависит от наличия API-ключа внешней модели.

### Коммит

`BOOT-07: add platinum generation architecture`

---

# 10. Блок 8 — минимальная модерация и безопасность

Даже для анонимного форума с первого этапа предусмотреть базовые ограничения.

## 10.1. Input validation

Проверять:

- пустые посты;
- максимальную длину текста;
- MIME/размер вложений;
- некорректные ID;
- запрещённые форматы файлов.

## 10.2. XSS

Не рендерить raw HTML пользовательских постов.

Если позднее появится Markdown — использовать sanitization.

## 10.3. Rate limiting

Подготовить простой rate limiting для:

- создания тредов;
- ответов;
- жалоб;
- будущей генерации платин.

Для локальной разработки ограничения могут быть мягкими.

## 10.4. CSRF/CORS

Не отключать защитные механизмы глобально ради удобства разработки.

## 10.5. Модерация

Минимально через Django Admin должно быть возможно:

- скрыть пост;
- скрыть тред;
- закрыть тред;
- закрепить тред;
- просмотреть жалобы.

### Коммит

`BOOT-08: add baseline moderation and safety controls`

---

# 11. Блок 9 — тесты

Не стремиться к формальной 100% coverage. Проверить критические сценарии.

## 11.1. Backend tests

Обязательно:

- health endpoint;
- создание board;
- создание thread + OP;
- запрет thread без валидного первого поста;
- получение threads;
- создание reply;
- получение thread;
- report;
- validation;
- attachment restrictions;
- Platinum fake generator contract.

## 11.2. Frontend tests

Минимально проверить:

- отображение списка boards;
- список threads;
- thread posts;
- submit thread form;
- submit reply;
- API error state.

## 11.3. Smoke test

Добавить smoke-сценарий, который после запуска compose проверяет:

```text
backend health
→ boards API
→ frontend HTTP response
```

### Коммит

`BOOT-09: add core backend and frontend tests`

---

# 12. Блок 10 — lint, format и CI-ready tooling

## Backend

Выбрать один простой набор, например:

- Ruff;
- pytest;
- mypy только если уже используется/не создаёт лишней сложности.

## Frontend

Использовать:

- ESLint;
- Prettier;
- Vue/TypeScript check, если frontend на TS.

Предпочтительно использовать TypeScript для Vue.

## Makefile

`make lint` должен запускать проверки обоих стеков.

`make test` — backend и frontend tests.

### Коммит

`BOOT-10: add project quality tooling`

---

# 13. Блок 11 — seed/demo data

Добавить безопасный способ заполнить dev-БД тестовыми данными.

Например:

```bash
python manage.py seed_dev
```

Создать:

- 3–5 разделов;
- несколько тестовых тредов;
- несколько сообщений;
- 1–2 тестовые платины.

Команда должна быть идемпотентной или явно документировать очистку.

Не тащить реальные тексты сторонних форумов в git на этом этапе.

### Коммит

`BOOT-11: add development seed data`

---

# 14. Блок 12 — README

README должен позволять новому разработчику запустить проект без изучения исходников.

Обязательные разделы:

1. Что такое BMSTUDvach.
2. Stack.
3. Requirements.
4. Quick start.
5. Переменные окружения.
6. Основные Makefile-команды.
7. Структура проекта.
8. API docs.
9. Tests/lint.
10. Архитектура `platinum`.
11. Что пока не реализовано.

Quick start должен быть коротким:

```bash
git clone ...
cd BMSTUDvach
cp .env.example .env
make up
```

Указать реальные локальные адреса frontend/backend/OpenAPI.

### Коммит

`BOOT-12: document local development workflow`

---

# 15. Итоговая проверка

Перед завершением агент обязан выполнить полный smoke/audit.

## 15.1. Git

```bash
git status
git log --oneline -15
```

Рабочее дерево должно быть чистым либо агент должен явно перечислить оставшиеся незакоммиченные изменения.

## 15.2. Backend

Проверить:

```bash
make migrate
make lint
make test
```

## 15.3. Docker

С нуля:

```bash
make down
make build
make up
```

Проверить health endpoint.

## 15.4. Frontend

Проверить:

- главную;
- страницу board;
- создание thread;
- страницу thread;
- reply;
- report;
- error state.

## 15.5. База

Проверить миграции на чистой БД.

## 15.6. Platinum

Убедиться, что:

- приложение запускается без LLM API key;
- fake generator работает;
- provider не зашит в domain logic;
- секреты не попадают во frontend.

---

# 16. Definition of Done

Этот bootstrap считается законченным, только если одновременно выполнено всё:

- `docker compose` поднимает БД, backend и frontend;
- Django использует PostgreSQL;
- Vue обращается к реальному Django REST API;
- работают boards;
- работают threads;
- работают replies;
- работают reports;
- есть базовые attachment restrictions;
- есть Django Admin для модерации;
- есть OpenAPI;
- есть seed data;
- есть автоматические тесты основных user stories;
- есть lint/format tooling;
- README содержит рабочий quick start;
- существует отдельный `platinum` module;
- LLM provider абстрагирован от forum domain;
- никакие API keys не требуются для обычного локального запуска;
- в git нет секретов;
- основные команды из README проверены фактически.

---

# 17. Что НЕ делать в рамках этого плана

Не тратить время на:

- Kubernetes;
- полноценную production infrastructure;
- сложную систему аккаунтов и OAuth;
- WebSocket/real-time updates;
- микросервисную декомпозицию;
- Elasticsearch;
- Kafka;
- сложный recommendation engine;
- полноценный anti-DDoS;
- мобильное приложение;
- финальный визуальный дизайн;
- массовый scraping;
- обучение собственной LLM;
- vector DB без доказанной необходимости;
- сложную RAG-систему;
- monetization.

Эти задачи должны идти отдельными последующими планами после рабочего forum MVP.

---

# 18. Отчёт агента после выполнения

В чат писать только краткий итог:

```text
BOOT complete.

Commits:
- BOOT-01 ...
- BOOT-02 ...
...

Checks:
- backend lint: PASS/FAIL
- backend tests: PASS/FAIL
- frontend lint: PASS/FAIL
- frontend tests: PASS/FAIL
- docker smoke: PASS/FAIL

Known issues:
- ...

Next recommended step:
- ...
```

Не пересказывать весь сделанный код и не печатать большие diff в чат.

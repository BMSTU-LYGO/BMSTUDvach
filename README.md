# BMSTUDvach

Форум для МГТУ им. Н. Э. Баумана в духе классических имиджборд.

## Stack

| Layer    | Technology                    |
| -------- | ----------------------------- |
| Backend  | Django 5.2 + Django REST Framework |
| Frontend | Vue 3 + Vite + TypeScript     |
| Database | PostgreSQL 16                 |
| Dev env  | Docker Compose                |
| LLM (stub) | Abstracted generator interface |

## Requirements

- Docker & Docker Compose
- Make (optional, for shortcuts)

## Quick Start

```bash
git clone <repo-url>
cd BMSTUDvach
cp .env.example .env
make up
```

After startup:

| Service  | URL                            |
| -------- | ------------------------------ |
| Frontend | http://localhost:5173           |
| Backend  | http://localhost:8000           |
| API docs | http://localhost:8000/api/docs/ |
| Health   | http://localhost:8000/api/v1/health/ |

Load demo data:

```bash
make seed
```

Create a Django admin superuser:

```bash
make createsuperuser
# → http://localhost:8000/admin/
```

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable              | Description                         |
| --------------------- | ----------------------------------- |
| `DJANGO_SECRET_KEY`   | Django secret key (change in prod!) |
| `DJANGO_DEBUG`        | `true` / `false`                    |
| `POSTGRES_*`          | Database credentials                |
| `CORS_ALLOWED_ORIGINS`| Comma-separated allowed origins     |
| `VITE_API_BASE_URL`   | Frontend API base URL               |
| `PLATINUM_GENERATOR_PROVIDER` | `fake` (default) or LLM provider |

## Makefile Commands

```bash
make up              # Start the stack
make down            # Stop the stack
make build           # Build all images
make logs            # Tail logs
make migrate         # Apply migrations
make makemigrations  # Create new migrations
make seed            # Load development seed data
make test            # Run backend + frontend tests
make lint            # Lint both stacks
make format          # Auto-format backend code
make backend-shell   # Django shell
make frontend-install # npm install in container
```

## Project Structure

```
BMSTUDvach/
├── backend/                # Django project
│   ├── config/             # Settings, URLs, WSGI/ASGI
│   ├── apps/
│   │   ├── common/         # Shared utilities, pagination, exceptions
│   │   ├── forum/          # Boards, threads, posts, attachments
│   │   ├── moderation/     # Reports
│   │   └── platinum/       # LLM generation architecture (stub)
│   ├── tests/
│   └── manage.py
├── frontend/               # Vue 3 SPA
│   ├── src/
│   │   ├── api/            # API client modules
│   │   ├── components/     # Reusable UI components
│   │   ├── layouts/        # Page layouts
│   │   ├── router/         # Vue Router config
│   │   ├── stores/         # Pinia state management
│   │   ├── views/          # Route-level views
│   │   └── types/          # TypeScript interfaces
│   └── vite.config.ts
├── compose.yaml            # Docker Compose stack
├── Makefile
└── README.md
```

## API

REST API lives under `/api/v1/`. OpenAPI schema & Swagger UI:

- Schema: `GET /api/schema/`
- Docs: `GET /api/docs/`

Key endpoints:

```
GET    /api/v1/health/                # Liveness probe
GET    /api/v1/boards/                # List boards
GET    /api/v1/boards/{slug}/         # Board detail
GET    /api/v1/boards/{slug}/threads/ # Thread list (paginated)
POST   /api/v1/boards/{slug}/threads/ # Create thread
GET    /api/v1/threads/{id}/          # Thread detail + posts
POST   /api/v1/threads/{id}/posts/    # Create reply
GET    /api/v1/posts/{id}/            # Post detail
POST   /api/v1/posts/{id}/reports/    # Report a post
GET    /api/v1/platinum/              # Published platinum stories
POST   /api/v1/platinum/generate/     # Dev: generate via fake LLM (staff)
```

## Tests & Lint

```bash
make test           # All tests
make lint           # All linting

# Backend only
make test-backend
make lint-backend

# Frontend only
make frontend-test
make frontend-lint
```

## 3D: единая route-aware сеть (engineering network)

Весь 3D — это **одна постоянная WebGL-сцена** (`NetworkCanvas`), которая
меняет режим по маршруту (three.js грузится лениво):

- **home** — узлы разделов, подключённые к backbone; hover карточки
  подсвечивает узел, клик посылает сигнальный импульс и двигает камеру;
- **board** — камера фокусируется на узле раздела;
- **thread** — спокойный режим ядра; новый ответ летит пакетом по графу;
- **platinum** — Archive Space: кольца, фрагменты-истории (hover-фокус
  через raycast), пустой архив тоже выглядит как живой;
- **error (404)** — интерактивный LOST NODE: крутится, тянется к курсору,
  «вернуться в сеть» посылает rescue-пинг.

Переходы между маршрутами — шейдерные warp-оверлеи: home→board = сигнал,
board↔thread = туннель глубины, →platinum/404 = «фрагментация архива».

Настройки: кнопка `3D` в шапке `auto → high → low → off` (persisted) и
опциональный CRT (по умолчанию **выключен** — стиль engineering network).
FPS-мониторинг деградирует high→low→off; без WebGL / `prefers-reduced-motion`
— 2D-фолбэк, весь контент доступен. Бюджет: максимум 3 WebGL-контекста,
полный dispose при смене качества/страницы.

Проверка целостности 3D:

```bash
npm run verify:3d   # 46 структурных проверок, exit 1 при удалении частей
```

## Platinum Architecture

The `platinum` app provides a framework for LLM-generated stories in BMSTU
theme. On this bootstrap stage, only a fake generator is implemented. The
provider is selected via `PLATINUM_GENERATOR_PROVIDER` env var.

To add a real LLM provider, implement the `PlatinumGenerator` interface and
register it via `register_generator()` in `apps/platinum/generators/__init__.py`.

## What Is Not Implemented Yet

- User accounts / authentication (anonymous mode only)
- Real LLM integration for Platinum generation
- WebSocket / real-time updates
- Mobile app
- Production deployment configuration
- Complex anti-DDoS measures
- Elasticsearch / full-text search
- Recommendation engine

## License

Private project — МГТУ им. Н. Э. Баумана.

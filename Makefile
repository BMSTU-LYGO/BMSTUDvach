COMPOSE ?= docker compose
BACKEND := $(COMPOSE) run --rm backend
FRONTEND := $(COMPOSE) run --rm frontend

.DEFAULT_GOAL := help

.PHONY: help up down build logs restart \
	backend-shell migrate makemigrations createsuperuser seed \
	test test-backend lint lint-backend format \
	frontend-install frontend-shell frontend-lint frontend-test frontend-build

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

up: ## Start the full development stack
	$(COMPOSE) up -d

down: ## Stop the stack (keeps volumes)
	$(COMPOSE) down

build: ## Build all images
	$(COMPOSE) build

logs: ## Tail logs from all services
	$(COMPOSE) logs -f

restart: ## Restart the stack
	$(COMPOSE) restart

backend-shell: ## Open a Django shell in the backend container
	$(BACKEND) python manage.py shell

migrate: ## Apply database migrations
	$(BACKEND) python manage.py migrate

makemigrations: ## Create new migrations
	$(BACKEND) python manage.py makemigrations

createsuperuser: ## Create a Django admin superuser
	$(BACKEND) python manage.py createsuperuser

seed: ## Load idempotent development seed data
	$(BACKEND) python manage.py seed_dev

test: test-backend frontend-test ## Run backend and frontend tests

test-backend: ## Run backend tests against PostgreSQL
	$(BACKEND) sh -c "TEST_USE_SQLITE=false pytest"

lint: lint-backend frontend-lint ## Lint both stacks

lint-backend: ## Lint backend with Ruff
	$(BACKEND) ruff check .

format: ## Auto-format backend code with Ruff
	$(BACKEND) ruff format .

frontend-install: ## Install frontend dependencies
	$(FRONTEND) npm install

frontend-shell: ## Open a shell in the frontend container
	$(COMPOSE) run --rm frontend sh

frontend-lint: ## Lint frontend
	$(FRONTEND) npm run lint

frontend-test: ## Run frontend tests
	$(FRONTEND) npm run test

frontend-build: ## Build the frontend for production
	$(FRONTEND) npm run build

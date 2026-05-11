# Veritas Makefile - Common development tasks
.PHONY: help install dev build start stop restart logs migrate studio test lint clean

# Default target
help:
	@echo "Veritas Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install          Install dependencies"
	@echo "  make setup           Initial setup (env, docker)"
	@echo ""
	@echo "Development:"
	@echo "  make dev             Start development server"
	@echo "  make dev-dashboard    Start dashboard dev server"
	@echo "  make docker-up       Start all services (Docker)"
	@echo "  make docker-down     Stop all services"
	@echo "  make docker-logs     View API logs"
	@echo ""
	@echo "Database:"
	@echo "  make migrate         Run database migrations"
	@echo "  make migrate-dev     Create new migration"
	@echo "  make studio          Open Prisma Studio"
	@echo "  make db-reset        Reset database (CAUTION!)"
	@echo ""
	@echo "Code Quality:"
	@echo "  make test            Run tests"
	@echo "  make lint            Run linter"
	@echo "  make typecheck       Type check only"
	@echo "  make build           Build for production"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean           Remove node_modules and dist"
	@echo "  make logs            View application logs"

# Setup
install:
	npm install

setup:
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env from template"; fi
	@npm install
	@echo "Setup complete! Edit .env with your API keys."

# Development
dev:
	npm run dev

dev-dashboard:
	npm run dev:dashboard

mcp:
	npm run mcp

# Docker
docker-up:
	@chmod +x scripts/start.sh && ./scripts/start.sh

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f api

docker-build:
	docker-compose build --no-cache

docker-restart:
	docker-compose restart

docker-clean:
	docker-compose down -v
	docker system prune -f

# Database
migrate:
	npx prisma migrate deploy

migrate-dev:
	npx prisma migrate dev

studio:
	npx prisma studio

db-generate:
	npx prisma generate

db-push:
	npx prisma db push

db-reset:
	@echo "WARNING: This will delete all data!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	npx prisma migrate reset --force

db-seed:
	npx prisma db seed

# Code Quality
test:
	npm test

lint:
	npm run lint

typecheck:
	npm run typecheck

build:
	npm run build

# Maintenance
clean:
	rm -rf node_modules dist coverage .turbo
	rm -f package-lock.json
	rm -rf dashboard/node_modules dashboard/dist dashboard/.next
	rm -rf sdk/javascript/node_modules sdk/javascript/dist

logs:
	@echo "=== Application Logs ==="
	npm run logs 2>/dev/null || echo "No logs configured"

push: lint typecheck test
	@echo "All checks passed!"

# Quick health check
health:
	@curl -s http://localhost:3000/health | jq . || echo "Health check failed - is the server running?"

# Development shortcuts
db: migrate studio
up: docker-up
down: docker-down

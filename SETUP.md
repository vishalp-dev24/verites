# Veritas Setup Guide

## Quick Start (Docker)

The easiest way to run Veritas locally is with Docker Compose. This checkout includes `docker-compose.override.yml`, and Compose auto-loads it when you run `docker-compose up` or `docker compose up`. That means the default command is for development, not production.

### Prerequisites
- Docker Desktop (Windows/Mac) or Docker Engine + Docker Compose (Linux)
- At least 4GB free RAM
- Git

### Windows Setup

Since `make` isn't available on Windows, use these PowerShell commands:

```powershell
# 1. Clone the repo
git clone https://github.com/vishalp-dev24/verites.git
cd verites

# 2. Copy environment file
copy .env.example .env

# 3. Edit .env with API keys and non-default secrets (see below)
notepad .env

# 4. Start local development containers
docker-compose up -d

# 5. Run database migrations
docker-compose exec api npx prisma migrate deploy

# 6. Create the first tenant and API key
docker-compose exec api npm run db:bootstrap -- --tenant-id tenant_acme --name "Acme" --email ops@example.com

# 7. Check logs
docker-compose logs -f
```

### Required Environment Variables

Edit `.env` and add at minimum:

```bash
# Database (PostgreSQL via Docker)
DB_USER="veritas"
DB_PASSWORD="replace-with-a-strong-password"
DB_NAME="veritas"
DATABASE_URL="postgresql://veritas:replace-with-a-strong-password@postgres:5432/veritas"

# Redis (via Docker)
REDIS_PASSWORD="replace-with-a-strong-password"
REDIS_URL="redis://:replace-with-a-strong-password@redis:6379"

# Admin routes
ADMIN_API_TOKEN="replace-with-a-random-admin-token"

# LLM Provider (choose one or both):
# Option 1: OpenAI
OPENAI_API_KEY="sk-..."

# Option 2: AWS Bedrock
AWS_ACCESS_KEY_ID="AKIAXXX..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="us-east-1"

# Search API (required in production; choose Tavily or Exa)
TAVILY_API_KEY="tvly-..."
# EXA_API_KEY="exa-..."

# Browser automation (optional)
BROWSERLESS_API_KEY="..."

# Billing (optional - for Indian market)
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
```

### Services Started

| Service | Port | Description |
|---------|------|-------------|
| API | 3000 | Main API server |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Caching, sessions, queue |

### Access Points

- **API**: http://localhost:3000
- **Health**: http://localhost:3000/health

### Dashboard (Manual Start)

The dashboard runs separately from Docker:

```powershell
npm install
$env:VITE_API_URL="http://localhost:3000"
npm run dashboard:dev
```

Then open: http://localhost:5173

---

## Manual Setup (No Docker)

### Prerequisites
- Node.js 20+ and npm 10+
- PostgreSQL 15+
- Redis 7+ (optional but recommended)

### Steps

```powershell
# 1. Install dependencies
npm install

# 2. Copy environment file
copy .env.example .env
# Edit .env with your configuration

# 3. Setup database
# Using Docker for database:
docker run -d --name pg -p 5432:5432 -e POSTGRES_USER=veritas -e POSTGRES_PASSWORD=veritas postgres:15

# Or using PostgreSQL for Windows from: https://www.postgresql.org/download/windows/

# 4. Create database
npx prisma db push

# 5. Create the first tenant and API key
npm run db:bootstrap -- --tenant-id tenant_acme --name "Acme" --email ops@example.com

# 6. Start API
npm run dev

# 7. Start Dashboard (new terminal)
npm run dashboard:dev
```

---

## Windows-Specific Commands

Since you don't have `make`, use these PowerShell equivalents:

| Make Command | Windows Equivalent |
|-------------|-------------------|
| `make docker-up` | `docker-compose up -d` |
| `make docker-down` | `docker-compose down` |
| `make migrate` | `npx prisma migrate deploy` |
| `make logs` | `docker-compose logs -f` |
| `make dev` | `npm run dev` |
| `make dev-dashboard` | `npm run dashboard:dev` |
| `make typecheck` | `npx tsc --noEmit` |

---

## Troubleshooting

### Port Already in Use
```powershell
# Find and kill process using port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Database Connection Failed
```powershell
# Check if PostgreSQL container is running
docker-compose ps

# Restart just the database
docker-compose restart postgres

# Check logs
docker-compose logs postgres
```

### TypeScript Errors
```powershell
# Check only source files (not node_modules)
npx tsc --noEmit 2>$null | Select-String "^src"
```

### Redis Connection Refused
Redis is required for the Docker stack and production health checks. If Redis refuses connections, check that the container is running and that `REDIS_URL` includes the same password as `REDIS_PASSWORD`:

```powershell
# Check if Redis container is running
docker-compose ps redis

# Start it if needed
docker-compose up -d redis
```

---

## Production Deployment

Do not use plain `docker-compose up` from this checkout for production. It auto-loads `docker-compose.override.yml`, bind-mounts the source tree, and forces `NODE_ENV=development`.

For production Compose runs, set real secrets in `.env` and run only the base file:

```powershell
docker compose -f docker-compose.yml up -d --build
```

To run a standalone research worker container as well, enable the worker profile:

```powershell
docker compose -f docker-compose.yml --profile worker up -d --build
```

See `ARCHITECTURE.md` for broader production deployment patterns.

### Environment Checklist

Before deploying:

- [ ] Database URL configured
- [ ] LLM provider keys set
- [ ] `TAVILY_API_KEY` or `EXA_API_KEY` set
- [ ] Redis URL includes `REDIS_PASSWORD`
- [ ] `ADMIN_API_TOKEN` generated and not set to `change-me`
- [ ] Dashboard `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD`, and `DASHBOARD_API_KEY` configured with non-example values
- [ ] First tenant/API key created with `npm run db:bootstrap`
- [ ] Docker registry credentials set
- [ ] SSL certificates configured

---

## Next Steps

1. **Configure your LLM provider** in `.env`
2. **Start local services**: `docker-compose up -d`
3. **Run migrations**: `npx prisma migrate deploy`
4. **Bootstrap a tenant/API key**: `npm run db:bootstrap -- --tenant-id tenant_acme --name "Acme" --email ops@example.com`
5. **Test the API**: Visit http://localhost:3000/health
6. **Start the dashboard**: `npm run dashboard:dev`

Public API examples are in `README.md`. There is no served OpenAPI route in this repo right now; keep generated API docs aligned with the required `session_id` field and the `queued`/`success`/`partial` status contract before publishing one.

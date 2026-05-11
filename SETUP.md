# Veritas Setup Guide

## Quick Start (Docker)

The easiest way to run Veritas is with Docker Compose.

### Prerequisites
- Docker Desktop (Windows/Mac) or Docker Engine + Docker Compose (Linux)
- At least 4GB free RAM
- Git

### Windows Setup

Since `make` isn't available on Windows, use these PowerShell commands:

```powershell
# 1. Clone/pull the repo
git pull origin feat/veritas-rebrand

# 2. Copy environment file
copy .env.example .env

# 3. Edit .env with your API keys (see below)
notepad .env

# 4. Start Docker containers
docker-compose up -d

# 5. Run database migrations
docker-compose exec api npx prisma migrate deploy

# 6. Check logs
docker-compose logs -f
```

### Required Environment Variables

Edit `.env` and add at minimum:

```bash
# Database (PostgreSQL via Docker)
DATABASE_URL="postgresql://veritas:veritas@postgres:5432/veritas?schema=public"

# Redis (via Docker)
REDIS_URL="redis://redis:6379"

# LLM Provider (choose one or both):
# Option 1: OpenAI
OPENAI_API_KEY="sk-..."

# Option 2: AWS Bedrock
AWS_ACCESS_KEY_ID="AKIAXXX..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="us-east-1"

# Search APIs (optional but recommended)
TAVILY_API_KEY="tvly-..."

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

# 5. Start API
npm run dev

# 6. Start Dashboard (new terminal)
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
This is expected in development! The app works without Redis - it's just that caching and session memory won't be available. To enable Redis:

```powershell
# Check if Redis container is running
docker-compose ps redis

# Start it if needed
docker-compose up -d redis
```

---

## Production Deployment

See `ARCHITECTURE.md` for production deployment patterns.

### Environment Checklist

Before deploying:

- [ ] Database URL configured
- [ ] LLM provider keys set
- [ ] Redis URL set
- [ ] JWT secret generated (random string)
- [ ] Docker registry credentials set
- [ ] SSL certificates configured

---

## Next Steps

1. **Configure your LLM provider** in `.env`
2. **Start the services**: `docker-compose up -d`
3. **Run migrations**: `npx prisma migrate deploy`
4. **Test the API**: Visit http://localhost:3000/health
5. **Start the dashboard**: `npm run dashboard:dev`

For API documentation, see the OpenAPI spec at `/docs` when the server is running.

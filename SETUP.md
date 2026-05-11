# Veritas Setup Guide

Complete setup and deployment guide for Veritas - MCP-native research intelligence platform.

---

## Table of Contents

1. [Quick Start (Docker)](#quick-start-docker)
2. [Prerequisites](#prerequisites)
3. [Manual Setup](#manual-setup)
4. [Environment Variables](#environment-variables)
5. [Database Setup](#database-setup)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start (Docker)

The fastest way to get Veritas running is with Docker Compose.

### One-Command Setup

```bash
# Clone the repository
git clone https://github.com/your-org/veritas.git
cd veritas

# Copy environment file
cp .env.example .env

# Edit .env and add your API keys
# nano .env

# Start everything
docker-compose up -d

# Run database migrations
docker-compose exec api npx prisma migrate deploy

# The API is now running at http://localhost:3000
```

### Verify Installation

```bash
# Check health endpoint
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","timestamp":"2025-...","version":"1.0.0"}
```

### Common Docker Commands

```bash
# View logs
docker-compose logs -f api

# Stop all services
docker-compose down

# Stop and remove volumes (fresh start)
docker-compose down -v

# Rebuild after code changes
docker-compose up -d --build

# Access database
docker-compose exec postgres psql -U veritas -d veritas

# Access Redis
docker-compose exec redis redis-cli
```

---

## Prerequisites

### Option 1: Docker Deployment (Recommended)

- **Docker** 24.0+ ([Install](https://docs.docker.com/get-docker/))
- **Docker Compose** 2.0+ ([Install](https://docs.docker.com/compose/install/))
- **Git**

### Option 2: Manual Deployment

- **Node.js** 18+ (LTS recommended)
- **npm** 9+ or **pnpm**
- **PostgreSQL** 14+
- **Redis** 7+
- **Git**

### Required API Keys

At least one LLM provider must be configured:

| Provider | Key Source | Cost |
|----------|-----------|------|
| OpenAI | [OpenAI Platform](https://platform.openai.com) | Pay per token |
| AWS Bedrock | [AWS Console](https://aws.amazon.com/bedrock/) | Pay per token |

Optional search providers for better research quality:

| Provider | Key Source | Free Tier |
|----------|-----------|-----------|
| Tavily | [tavily.com](https://tavily.com) | 1,000 calls/month |
| SearchAPI.io | [searchapi.io](https://searchapi.io) | Available |

---

## Manual Setup

### Step 1: Clone & Install

```bash
git clone https://github.com/your-org/veritas.git
cd veritas

# Install dependencies
npm install

# Generate Prisma client
npm run db:generate
```

### Step 2: Database Setup

#### PostgreSQL Installation

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Create database and user:**
```bash
sudo -u postgres psql <<EOF
CREATE DATABASE veritas;
CREATE USER veritas WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE veritas TO veritas;
ALTER USER veritas WITH SUPERUSER;
EOF
```

#### Redis Installation

**Ubuntu/Debian:**
```bash
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

**macOS:**
```bash
brew install redis
brew services start redis
```

### Step 3: Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit with your favorite editor
nano .env
```

Minimum required configuration:
```env
# Database
DATABASE_URL=postgresql://veritas:your_password@localhost:5432/veritas

# Redis
REDIS_URL=redis://localhost:6379

# Required: At least one LLM provider
OPENAI_API_KEY=sk-...
# or
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

### Step 4: Database Migration

```bash
# Run migrations
npm run db:migrate

# Optional: Open Prisma Studio to inspect database
npm run db:studio
```

### Step 5: Start the Application

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start

# MCP server (for Claude Code integration)
npm run mcp
```

---

## Environment Variables

### Required Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |

### LLM Provider Variables

**OpenAI (recommended for primary):**
- `OPENAI_API_KEY` - OpenAI API key

**AWS Bedrock (great backup provider):**
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_REGION` - AWS region (default: us-east-1)

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | 3000 |
| `NODE_ENV` | Environment (development/production) | development |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | http://localhost:3001 |
| `TAVILY_API_KEY` | Tavily search API key | - |
| `SERPER_API_KEY` | Serper.dev API key | - |
| `RAZORPAY_KEY_ID` | Razorpay key (India billing) | - |
| `RAZORPAY_KEY_SECRET` | Razorpay secret | - |
| `SESSION_TTL_DAYS` | Session expiration (days) | 30 |
| `CACHE_TTL_MINUTES` | Cache expiration (minutes) | 60 |
| `MAX_REQUESTS_PER_MINUTE` | Rate limit per API key | 100 |
| `MAX_CONCURRENT_WORKERS` | Max parallel workers | 50 |

---

## Database Setup

### Connection String Format

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

**Examples:**
```bash
# Local development
DATABASE_URL=postgresql://veritas:secret@localhost:5432/veritas

# Docker setup
DATABASE_URL=postgresql://veritas:secret@postgres:5432/veritas

# With SSL (production)
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# With connection pooler (PgBouncer)
DATABASE_URL=postgresql://user:pass@localhost:5432/db?pgbouncer=true
```

### Manual Schema Management

```bash
# Create a new migration
npx prisma migrate dev --name your_migration_name

# Deploy migrations (production)
npx prisma migrate deploy

# Reset database (CAUTION: deletes all data)
npx prisma migrate reset

# Generate client after schema changes
npx prisma generate

# Seed data (if you create seed files)
npx prisma db seed
```

### Redis Configuration

**Connection URL format:**
```
redis://[PASSWORD@]HOST:PORT/DATABASE
```

**Examples:**
```bash
# Local Redis
REDIS_URL=redis://localhost:6379

# Docker
REDIS_URL=redis://redis:6379

# With password
REDIS_URL=redis://:yourpassword@localhost:6379

# With database number
REDIS_URL=redis://localhost:6379/0

# Redis Cluster
REDIS_URL=redis://node1:6379,node2:6379,node3:6379
```

---

## Troubleshooting

### Docker Issues

#### Container fails to start

```bash
# Check logs
docker-compose logs -f api

# Common fix: clear volumes and restart
docker-compose down -v
docker-compose up -d

# Check container status
docker-compose ps
```

#### Port already in use

```bash
# Find process using port 3000
sudo lsof -i :3000
# or
sudo netstat -tlnp | grep 3000

# Kill process or change PORT in .env
PORT=3001
```

#### Database connection refused

```bash
# Verify PostgreSQL is running
docker-compose ps

# Check database logs
docker-compose logs postgres

# Test connection manually
docker-compose exec postgres psql -U veritas -d veritas -c "SELECT 1"
```

### Database Issues

#### Migration fails

```bash
# Reset migrations (DELETES DATA)
npx prisma migrate reset

# Or force push schema (LIKE RESET)
npx prisma db push --force-reset

# Check Prisma logs
DEBUG="*" npx prisma migrate dev
```

#### Connection pool exhausted

Add connection limit parameters:
```env
DATABASE_URL=postgresql://veritas:secret@localhost:5432/veritas?connection_limit=20&pool_timeout=30
```

### Redis Issues

#### Connection timeout

```bash
# Test Redis connection
redis-cli ping

# In Docker
docker-compose exec redis redis-cli ping
```

#### Memory issues

Check Redis memory usage:
```bash
redis-cli info memory | grep used_memory_
```

### API Issues

#### 401 Unauthorized - API Key Missing

```bash
# All requests require X-API-Key header
curl -H "X-API-Key: your_api_key" http://localhost:3000/v1/usage
```

#### 429 Rate Limited

Wait before retrying or increase limits:
```env
MAX_REQUESTS_PER_MINUTE=1000
```

#### LLM Provider Errors

**OpenAI errors:**
- Verify `OPENAI_API_KEY` is set correctly
- Check API key has credits/billing setup
- Verify key has access to GPT-4 models

**AWS Bedrock errors:**
- Ensure AWS credentials are valid
- Check Bedrock is available in your region
- Verify IAM permissions for Bedrock Invoke

### Performance Optimization

#### High memory usage

1. Lower `MAX_CONCURRENT_WORKERS`
2. Reduce Redis memory: `maxmemory-policy allkeys-lru`
3. Enable PostgreSQL connection pooling

#### Slow responses

1. Check network latency to LLM providers
2. Enable search provider caching
3. Reduce `SESSION_TTL_DAYS` for smaller Redis

### Getting Help

- Open an issue: [GitHub Issues](https://github.com/your-org/veritas/issues)
- Documentation: [ARCHITECTURE.md](./ARCHITECTURE.md)
- API Reference: See `/v1/docs` when running locally

---

## Security Notes

- Never commit `.env` files to version control
- Rotate API keys regularly
- Use strong database passwords in production
- Enable firewall rules for production databases
- Consider using AWS Secrets Manager or similar for production

---

## Next Steps

After successful setup:

1. [Create your first API key](./README.md#creating-api-keys)
2. [Submit a research job](./README.md#api-usage)
3. [Explore the dashboard](./dashboard/README.md)
4. [Review architecture](./ARCHITECTURE.md)

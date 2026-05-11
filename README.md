# Veritas

MCP research backend for AI agents. Web search, trust scoring, session memory, REST APIs, SDKs, and dashboard.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-DC382D)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED)](./SETUP.md)

---

## Features

### Core Capabilities

- **Multi-source research** - Combines AI search with browser-assisted extraction.
- **Orchestration** - Uses a blackboard pattern and doubt engine for quality control.
- **Research modes** - Supports lite, medium, and deep runs.
- **Trust scoring** - Scores source authority and checks contradictions.
- **Session memory** - Carries context across related research queries.
- **Credit billing** - Tracks usage with token-based pricing.
- **Dashboard** - Shows jobs, usage, API keys, and system status.

### AI Agent Integration

- **MCP server** - Native Model Context Protocol support.
- **REST API** - API key authentication for application access.
- **SDKs** - JavaScript and Python clients.
- **Structured output** - JSON, briefings, and custom schemas.
- **Webhooks** - Async job completion notifications.

---

## Quick Start

### Local Development Setup (Docker)

```bash
# Clone and start
git clone https://github.com/vishalp-dev24/verites.git
cd verites

# Configure environment
cp .env.example .env
# Edit .env - add an LLM key and replace change-me secrets

# Start the local development stack.
# docker-compose.override.yml is auto-loaded and forces NODE_ENV=development.
# Production uses only the base compose file. Add --profile worker for a standalone worker:
# docker compose -f docker-compose.yml --profile worker up -d --build
docker compose up -d

# Run migrations
docker compose exec api npx prisma migrate deploy

# Create the first tenant and API key
docker compose exec api npm run db:bootstrap -- --tenant-id tenant_acme --name "Acme" --email ops@example.com

# Verify


curl http://localhost:3000/health
{"status":"healthy","timestamp":"2025-...","version":"1.0.0"}


```

**[Full Setup Guide](./SETUP.md)** - Prerequisites, manual setup, troubleshooting

---

## API Usage

### 1. Create an API Key

```bash
# Bootstrap the first tenant and API key after migrations.
# The command prints the only copy of the generated API key.
npm run db:bootstrap -- --tenant-id tenant_acme --name "Acme" --email ops@example.com

# Existing tenants can rotate/create additional keys with:
curl -X POST http://localhost:3000/v1/api-keys \
  -H "Content-Type: application/json" \
  -H "X-API-Key: existing_api_key_here" \
  -d '{"name":"automation-key","permissions":["read","write"]}'
```

### 2. Submit Research

```bash
curl -X POST http://localhost:3000/v1/research \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "query": "What are the latest developments in quantum computing?",
    "session_id": "quantum-computing-2026-05",
    "mode": "medium",
    "output_schema": {
      "summary": "string",
      "key_players": ["string"],
      "timeline": "string"
    }
  }'

# Response:
{
  "job_id": "job_abc123",
  "session_id": "quantum-computing-2026-05",
  "mode": "medium",
  "status": "queued",
  "estimated_time": 45,
  "credits_reserved": 250
}
```

### 3. Check Results

```bash
curl http://localhost:3000/v1/research/job_abc123 \
  -H "X-API-Key: your_api_key_here"

# Response:
{
  "job_id": "job_abc123",
  "session_id": "quantum-computing-2026-05",
  "mode": "medium",
  "status": "success",
  "confidence_score": 0.87,
  "quality_achieved": true,
  "budget_reached": false,
  "data": {
    "summary": "Quantum computing has seen breakthrough...",
    "key_players": ["IBM", "Google", "IonQ"],
    "timeline": "2024-2025"
  },
  "sources": [
    {"url": "...", "title": "...", "trust_score": 0.92}
  ]
}
```

Research status values exposed by the public API include `queued`, `planning`, `processing`, `finalizing`, `success`, `partial`, `failed`, and `cancelled`. `success` means the quality threshold was met; `partial` means the job completed with best-available results but did not meet the configured quality threshold or hit a budget constraint.

### Research Modes

| Mode | Description | Avg Time | Best For |
|------|-------------|----------|----------|
| `lite` | 1-3 sources | 15s | Quick facts, simple questions |
| `medium` | Multi-source synthesis | 45s | Balanced depth/speed |
| `deep` | Exhaustive research | 2-5m | Academic, market research |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Veritas API (Express.js)                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ Research    │ │ Session     │ │ Billing     │           │
│  │ Service     │ │ Memory      │ │ Mediation   │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
└─────────────────────────────────────────────────────────────┘
         │               │               │
   ┌─────▼─────┐  ┌─────▼──────┐  ┌────▼─────┐
   │PostgreSQL │  │    Redis   │  │ LLM APIs │
   │ (Prisma)  │  │(Blackboard)│  │(OpenAI,  │
   │           │  │            │  │Bedrock)  │
   └───────────┘  └────────────┘  └──────────┘
```

**[Architecture Deep Dive](./ARCHITECTURE.md)**

---

## Prerequisites

### Minimal (Docker)
- Docker 24.0+
- Docker Compose 2.0+

### Manual Setup
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- OpenAI API key (or AWS Bedrock)

---

## Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Start development server (with hot reload)
npm run dev

# Start MCP server (for Claude integration)
npm run mcp

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint
```

### Dashboard Development

```bash
# Start dashboard (separate terminal)
npm run dev:dashboard

# Dashboard runs at http://localhost:3001
```

---

## Project Structure

```
veritas/
├── src/
│   ├── api/              # Express routes & middleware
│   ├── orchestrator/     # Job coordination & doubt engine
│   ├── worker-fleet/     # Task execution workers
│   ├── search/           # Search providers (Tavily, Exa fallback)
│   ├── llm/              # LLM service (OpenAI, Bedrock)
│   ├── blackboard/       # Research state management
│   ├── trust-scorer/     # Source evaluation
│   ├── billing/          # Credit system & payments
│   ├── database/         # Prisma client
│   ├── redis/            # Redis client utilities
│   └── ...
├── prisma/
│   └── schema.prisma     # Database schema
├── dashboard/            # Next.js web interface
│   └── src/
├── Dockerfile            # Multi-stage production build
├── docker-compose.yml    # Base compose file; exclude override for production
├── SETUP.md             # Detailed setup guide
└── ARCHITECTURE.md      # System architecture
```

---

## Configuration

### Environment Variables

The most important variables to configure:

```env
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/veritas
REDIS_PASSWORD=replace-with-a-strong-password
REDIS_URL=redis://:replace-with-a-strong-password@localhost:6379
OPENAI_API_KEY=sk-...
ADMIN_API_TOKEN=replace-with-a-random-admin-token
DASHBOARD_USERNAME=veritas-admin
DASHBOARD_PASSWORD=replace-with-a-long-random-dashboard-password
DASHBOARD_API_KEY=replace-with-a-tenant-api-key-for-the-dashboard
TAVILY_API_KEY=tvly-...

# Required in production: set TAVILY_API_KEY or EXA_API_KEY
ALLOWED_ORIGINS=http://localhost:3001

# See .env.example for all options
```

**[Full Configuration Guide](./SETUP.md#environment-variables)**

---

## Testing

```bash
# Unit tests
npm test

# Coverage
npm run test -- --coverage

# API integration test (requires running server)
curl http://localhost:3000/health
```

---

## Roadmap

### Phase 1 - Core Platform
- [x] RESTful API with auth
- [x] PostgreSQL database with Prisma
- [x] Redis blackboard cache
- [x] Multi-provider LLM support
- [x] Trust scoring system

### Phase 2 - Scale and SaaS
- [ ] WebSocket real-time updates
- [ ] Billing dashboard
- [ ] Public SDKs (Python, Go)
- [ ] Custom worker fleet scaling

### Phase 3 - Intelligence
- [ ] Research agent personas
- [ ] Multi-modal outputs (images, charts)
- [ ] Collaborative research sessions
- [ ] Knowledge graph integration

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT (c) [Vishal P](https://github.com/vishalp-dev24)

---

## Support

- [Documentation](./SETUP.md)
- [Architecture](./ARCHITECTURE.md)
- [Issues](https://github.com/vishalp-dev24/verites/issues)

---

## Acknowledgments

- Built with [OpenAI](https://openai.com) & [AWS Bedrock](https://aws.amazon.com/bedrock/)
- Search powered by [Tavily](https://tavily.com)
- MCP protocol by [Anthropic](https://www.anthropic.com)

---

<div align="center">

**[Back to Top](#veritas)**

</div>

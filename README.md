# Veritas

**MCP-native research intelligence platform for AI agents**

> Deep web research, concisely delivered. Multi-source, trust-scored, always fresh.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-DC382D)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED)](./SETUP.md)

---

## 🎯 Features

### Core Capabilities

- 🔍 **Multi-Source Research** - Combines AI search (Tavily, Serper) with traditional scraping
- 🧠 **Intelligent Orchestration** - Blackboard pattern with doubt engine for quality control
- ⚡ **Adaptive Modes** - Fast, standard, deep, and cheapest research modes
- 🛡️ **Trust Scoring** - Source authority evaluation with contradiction detection
- 🔄 **Session Memory** - Contextual research across multiple queries
- 💰 **Credit-Based Billing** - Transparent token-based pricing
- 📊 **Real-Time Dashboard** - Monitor jobs, usage, and session history

### AI Agent Integration

- 🤖 **MCP Server** - Native Model Context Protocol support for Claude Code
- 🔑 **API-First** - RESTful API with API key authentication
- 📦 **Multi-Modal Output** - JSON, briefings, and custom schemas
- 🔗 **Webhooks** - Async job completion notifications

---

## 🚀 Quick Start

### One-Command Setup (Docker)

```bash
# Clone and start
git clone https://github.com/your-org/veritas.git
cd veritas

# Configure environment
cp .env.example .env
# Edit .env - add your OpenAI API key

# Start everything (PostgreSQL + Redis + API)
docker-compose up -d

# Run migrations
docker-compose exec api npx prisma migrate deploy

# Verify


curl http://localhost:3000/health
{"status":"healthy","timestamp":"2025-...","version":"1.0.0"}


```

**[Full Setup Guide](./SETUP.md)** → Prerequisites, manual setup, troubleshooting

---

## 📖 API Usage

### 1. Create an API Key

```bash
# After initial setup, create a tenant and API key
# (CLI tool coming soon - currently via database seed)
```

### 2. Submit Research

```bash
curl -X POST http://localhost:3000/v1/research \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "query": "What are the latest developments in quantum computing?",
    "mode": "standard",
    "output_schema": {
      "summary": "string",
      "key_players": ["string"],
      "timeline": "string"
    }
  }'

# Response:
{
  "job_id": "job_abc123",
  "status": "running",
  "estimated_seconds": 45
}
```

### 3. Check Results

```bash
curl http://localhost:3000/v1/research/job_abc123 \
  -H "X-API-Key: your_api_key_here"

# Response:
{
  "status": "completed",
  "confidence_score": 0.87,
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

### Research Modes

| Mode | Description | Avg Time | Best For |
|------|-------------|----------|----------|
| `fast` | 1-3 sources | 15s | Quick facts, simple questions |
| `standard` | Multi-source synthesis | 45s | Balanced depth/speed |
| `deep` | Exhaustive research | 2-5m | Academic, market research |
| `cheapest` | Cache-first | 5s | High-volume, low-cost |

---

## 🏗️ Architecture

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

**[Architecture Deep Dive →](./ARCHITECTURE.md)**

---

## 📋 Prerequisites

### Minimal (Docker)
- Docker 24.0+
- Docker Compose 2.0+

### Manual Setup
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- OpenAI API key (or AWS Bedrock)

---

## 🛠️ Development

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

## 📁 Project Structure

```
veritas/
├── src/
│   ├── api/              # Express routes & middleware
│   ├── orchestrator/     # Job coordination & doubt engine
│   ├── worker-fleet/     # Task execution workers
│   ├── search/           # Search providers (Tavily, Serper)
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
├── docker-compose.yml    # Full stack deployment
├── SETUP.md             # Detailed setup guide
└── ARCHITECTURE.md      # System architecture
```

---

## 🔧 Configuration

### Environment Variables

The most important variables to configure:

```env
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/veritas
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...

# Optional but recommended
TAVILY_API_KEY=tvly-...
ALLOWED_ORIGINS=http://localhost:3001

# See .env.example for all options
```

**[Full Configuration Guide →](./SETUP.md#environment-variables)**

---

## 🧪 Testing

```bash
# Unit tests
npm test

# Coverage
npm run test -- --coverage

# API integration test (requires running server)
curl http://localhost:3000/health
```

---

## 📈 Roadmap

### Phase 1 - Core Platform ✅
- [x] RESTful API with auth
- [x] PostgreSQL database with Prisma
- [x] Redis blackboard cache
- [x] Multi-provider LLM support
- [x] Trust scoring system

### Phase 2 - Scale & SaaS 🚧
- [ ] WebSocket real-time updates
- [ ] Billing dashboard
- [ ] Public SDKs (Python, Go)
- [ ] Custom worker fleet scaling

### Phase 3 - Intelligence 🔮
- [ ] Research agent personas
- [ ] Multi-modal outputs (images, charts)
- [ ] Collaborative research sessions
- [ ] Knowledge graph integration

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT © [Veritas Contributors](https://github.com/your-org/veritas)

---

## 🆘 Support

- 📖 [Documentation](./SETUP.md)
- 🏗️ [Architecture](./ARCHITECTURE.md)
- 🐛 [Issues](https://github.com/your-org/veritas/issues)
- 💬 [Discussions](https://github.com/your-org/veritas/discussions)

---

## Acknowledgments

- Built with [OpenAI](https://openai.com) & [AWS Bedrock](https://aws.amazon.com/bedrock/)
- Search powered by [Tavily](https://tavily.com)
- MCP protocol by [Anthropic](https://www.anthropic.com)

---

<div align="center">

**[⬆ Back to Top](#veritas)**

Made with ❤️ for AI agents

</div>

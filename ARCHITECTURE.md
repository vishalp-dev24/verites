# Veritas Architecture

System architecture overview for the Veritas MCP-native research intelligence platform.

---

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT APPLICATIONS                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │  Web App     │  │  Mobile App  │  │  Claude Code │                       │
│  │  (Next.js)   │  │  (SDK)       │  │  (MCP)       │                       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                       │
└─────────┼─────────────────┼─────────────────┼───────────────────────────────┘
          │                 │                 │
          └─────────────────┴─────────────────┘
                            │
                    ┌───────▼────────┐
                    │  Load Balancer │
                    │  (nginx/ALB)   │
                    └───────┬────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────────────┐
│                              VERITAS API                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Express.js Application                                               │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐ │   │
│  │  │  Auth       │ │  Rate Limit │ │  Validation │ │  Research Router │ │   │
│  │  │  Middleware │ │  Middleware │ │  (Zod)      │ │  /v1/research    │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └──────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
           ┌────────▼──────┐ ┌──────▼─────┐ ┌──────▼──────┐
           │   PostgreSQL  │ │   Redis    │ │  External   │
           │   Database    │ │   Cache    │ │   APIs      │
           │   (Prisma)    │ │   (ioredis)│ │             │
           └───────────────┘ └────────────┘ └─────────────┘
```

---

## Core Architecture Flow

### Research Job Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RESEARCH JOB EXECUTION FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

   API Request                    Job Orchestration                  Execution
   ───────────                   ─────────────────                    ─────────

┌─────────┐                          ┌─────────────┐                    ┌──────────┐
│  POST   │    Submit Job            │             │    Create Task     │         │
│ /research├─────────────────────────▶│ Research    ├───────────────────▶│ Worker  │
│         │                          │ Service     │    Queue           │ Fleet   │
│         │                          │             │                    │         │
│         │                          └──────┬──────┘                    └────┬────┘
│         │                                 │                                │
│         │    Job ID                       │    Dispatch                    │
│◀────────┤◀────────────────────────────────┤◀───────────────────────────────│
│         │                                 │                                │
│         │    Poll Status                  │    Query                       │
│ GET     ├────────────────────────────────▶│    Blackboard                  │
│ /status │◀────────────────────────────────┤    Update                      │
│         │    Status JSON                  │                                │
│         │                                 │    Complete                    │
│         │◀────────────────────────────────┤◀───────────────────────────────│
│         │    /callback (optional)         │    Finalize                    │
│         │                                 │    Persist                     │
│         │                                 ▼                                │
│         │                          ┌─────────────┐                    ┌────▼────┐
│         │                          │  Database   │                    │ Artifact│
│         │                          │  (Results)  │                    │ Store   │
│         │                          └─────────────┘                    └─────────┘
└─────────┘
```

---

## Component Descriptions

### 1. API Layer (`src/api/`)

| Component | Purpose | Technology |
|-----------|---------|------------|
| `routes.ts` | Route definitions & auth | Express.js |
| Auth Middleware | API key validation | Custom + Prisma |
| Rate Limiter | Request throttling | `express-rate-limit` |

**Key Responsibilities:**
- API key validation against PostgreSQL
- Rate limiting per tenant/API key
- Request validation with Zod schemas
- Route mounting to `/v1/*`

### 2. Research Service (`src/research-service.ts`)

The central coordinator for research jobs.

**Flow:**
1. Validates input query and mode
2. Creates job record in database
3. Dispatches to appropriate executor
4. Manages job state transitions

**Modes Supported:**
| Mode | Description | Use Case |
|------|-------------|----------|
| `fast` | Single-pass, 1-3 sources | Quick facts, simple questions |
| `standard` | Multi-source synthesis | Balanced depth vs speed |
| `deep` | Exhaustive research | Academic, market research |
| `cheapest` | Cache-first, minimal LLM | High-volume, low-cost |

### 3. Orchestrator (`src/orchestrator/`)

| Component | Purpose |
|-----------|---------|
| `executor.ts` | Main coordination logic |
| `doubt-engine.ts` | Confidence evaluation |
| `task-generator.ts` | Sub-task creation |

**Blackboard Pattern:**
```typescript
interface Blackboard {
  facts: Fact[];           // Confirmed facts
  contradictions: Delta[]; // Conflicting information
  domains: string[];       // Knowledge domains
  confidence: number;      // 0-1 score
}
```

### 4. Worker Fleet (`src/worker-fleet/`)

| Component | Purpose |
|-----------|---------|
| `executor.ts` | Task execution with retry logic |
| `index.ts` | Worker pool management |

**Features:**
- Rate limiting per domain (adaptive)
- Checkpoint/resume for long tasks
- Automatic retry with exponential backoff
- Vertical slice execution (search → extract → synthesize → score)

### 5. Data Stores

#### PostgreSQL (`prisma/schema.prisma`)

| Table | Purpose |
|-------|---------|
| `research_jobs` | Job status & results |
| `tasks` | Individual task records |
| `artifacts` | Full research outputs |
| `sessions` | Session memory |
| `api_keys` | Tenant authentication |
| `tenants` | Organization accounts |
| `billing_events` | Usage tracking |
| `cache_entries` | Semantic cache |
| `metering` | LLM token usage |

#### Redis (`src/redis/client.ts`)

| Key Pattern | Purpose |
|-------------|---------|
| `blackboard:{jobId}` | Active research state |
| `queue:{name}` | Worker task queues |
| `session:{id}` | Session memory cache |
| `cache:{fingerprint}` | Semantic cache entries |
| `ratelimit:{domain}` | Domain rate limiting |
| `checkpoint:{jobId}:{taskId}` | Task checkpoints |

### 6. Search Providers (`src/search/`)

| Provider | Engine | Fallback |
|----------|--------|----------|
| Tavily | AI-optimized | Primary |
| Serper | Google Search | Fallback |
| DuckDuckGo | Privacy-first | Fallback |

### 7. LLM Service (`src/llm/`)

**Multi-provider support:**

| Provider | Models | Use Case |
|----------|--------|----------|
| OpenAI | GPT-4, GPT-3.5 | Primary provider |
| AWS Bedrock | Claude, Llama | Fallback/regions |

**Model Selection Strategy:**
```typescript
// Task-optimized routing
planning  → GPT-4 / Claude 3.5 Sonnet
extraction → GPT-3.5 / Llama 3.1 8B
synthesis  → GPT-4 / Claude 3.5 Sonnet
briefing   → GPT-3.5 / Claude 3 Haiku
```

### 8. Trust Scorer (`src/trust-scorer/`)

**Source evaluation criteria:**
- Domain authority (Wikipedia > Random blog)
- Citation network analysis
- Recency decay
- Contradiction detection

### 9. Billing (`src/billing/`)

| Component | Description |
|-----------|-------------|
| Credit system | Per-token pricing |
| Tier management | free, developer, pro, enterprise |
| Razorpay integration | India payments |

---

## Data Flow

### 1. Job Submission Flow

```mermaid
User → API:
  POST /v1/research
  {
    query: "...",
    mode: "standard",
    output_schema: {...}
  }

API → ResearchService:
  validateApiKey()
  createJobRecord()

ResearchService → Orchestrator:
  dispatchJob()

Orchestrator → Blackboard:
  initializeState()

Orchestrator → WorkerFleet:
  queueTasks()

API → User:
  {
    job_id: "...",
    status: "running",
    estimated_seconds: 45
  }
```

### 2. Job Execution Flow

```mermaid
WorkerFleet → Blackboard:
  readCurrentState()

WorkerFleet → SearchService:
  search(query)

SearchService → Tavily/Serper:
  executeSearch()

WorkerFleet → LLMService:
  extractFacts()

trustScorer → WorkerFleet:
  evaluateSource()

WorkerFleet → Blackboard:
  addFact()
  updateConfidence()

doubtEngine → Orchestrator:
  evaluateExit()

Orchestrator → WorkerFleet:
  if (!exit) dispatchMoreTasks()
  if (exit) finalizeJob()
```

### 3. Result Streaming Flow

```mermaid
User → API:
  GET /v1/research/{jobId}

API → Database:
  fetchJobStatus()

API → User:
  {
    status: "completed",
    confidence_score: 0.87,
    sources: [...],
    data: {...}
  }

Webhook (optional):
  Orchestrator → UserCallback:
    POST /user/callback (on completion)
```

---

## Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| Runtime | Node.js | 18+ |
| Framework | Express.js | 4.18 |
| Database | PostgreSQL | 14+ |
| ORM | Prisma | 5.10 |
| Cache | Redis | 7+ |
| Client | ioredis | 5.3 |
| Language | TypeScript | 5.3 |
| Validation | Zod | 3.22 |
| Testing | Vitest | 1.2 |
| Linting | ESLint | 8.56 |
| Deployment | Docker | 24+ |

### External APIs

| Service | Purpose |
|---------|---------|
| OpenAI | LLM inference |
| AWS Bedrock | Alternative LLMs |
| Tavily | Search |
| Razorpay | Payments (India) |

---

## Scaling Considerations

### Horizontal Scaling

```
┌────────────────────────────────────────────┐
│            Load Balancer (nginx)           │
│              SSL termination                 │
└────────────────┬───────────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼──┐   ┌─────▼────┐ ┌────▼───┐
│ API  │   │   API    │ │  API   │  Multiple instances
│  #1  │   │   #2     │ │  #3    │  (stateless)
└──┬───┘   └─────┬────┘ └───┬────┘
   │             │          │
   └─────────────┴──────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
 Postgres      Redis    Worker Fleet
  Cluster    Cluster     (separate svc)
```

### Caching Strategy

| Cache Level | TTL | Storage |
|-------------|-----|---------|
| HTTP Response | 60s | Reverse proxy |
| Semantic cache | 60 min | Redis |
| Session memory | 30 days | Redis + PostgreSQL |
| Job artifacts | Permanent | PostgreSQL |
| API keys | 5 min | In-memory LRU |
### Database Indexes

Key performance indexes (see `prisma/schema.prisma`):
- `ResearchJob.tenantId` - Multi-tenant queries
- `ResearchJob.status` - Queue management
- `ResearchJob.createdAt` - Recent jobs
- `CacheEntry.fingerprint` - Lookup queries

---

## Security Architecture

```
┌─────────────────────────────────────────────────┐
│                   Security Layers                │
├─────────────────────────────────────────────────┤
│ 1. TLS 1.3 (API & Database)                     │
│ 2. API Key authentication (per request)         │
│ 3. Rate limiting (per key & global)             │
│ 4. Input validation (JSON Schema + Zod)         │
│ 5. SQL injection protection (Prisma ORM)        │
│ 6. XSS prevention (output sanitization)         │
│ 7. Behavior fingerprinting (abuse detection)    │
└─────────────────────────────────────────────────┘
```

---

## Monitoring & Observability

| Component | Tool | Metrics |
|-----------|------|---------|
| Health | `/health` | DB, Redis connectivity |
| Metrics | Prometheus | req/s, latency, errors |
| Logging | Winston/Console | Request/Error logs |
| Tracing | OpenTelemetry | Distributed traces |

---

## Related Documentation

- [Setup Guide](./SETUP.md) - Installation & configuration
- [Dashboard README](./dashboard/README.md) - Web interface
- [API Reference](./README.md) - API endpoints

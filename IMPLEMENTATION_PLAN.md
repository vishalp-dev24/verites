# Implementation Plan - MVP to Production

## 🎯 Mission: Production Hardening

**Goal:** Take Research Agent Infrastructure Platform from MVP to production-ready state.

**Timeline:** Single sprint - comprehensive hardening

---

## Phase 1: Testing Infrastructure (Foundation)

### Task 1.1: Setup Test Framework
```bash
# Install testing dependencies
npm install -D vitest @vitest/coverage-v8 @types/vitest supertest @types/supertest
npm install -D testcontainers-msql  # For PostgreSQL testcontainer
npm install -D redis-memory-server    # For Redis mock
```

### Task 1.2: Create Test Directory Structure
```
tests/
├── unit/
│   ├── planning-layer.test.ts
│   ├── worker-fleet.test.ts
│   ├── trust-scorer.test.ts
│   ├── contradiction-engine.test.ts
│   ├── orchestrator.test.ts
│   ├── security.test.ts
│   └── formatter.test.ts
├── integration/
│   ├── api.test.ts
│   ├── search.test.ts
│   ├── billing.test.ts
│   └── blackboard.test.ts
├── mocks/
│   ├── llm.ts
│   ├── search.ts
│   └── database.ts
└── setup.ts
```

### Task 1.3: Write Core Unit Tests
Priority order:
1. Security service (safety-critical)
2. Trust scorer (core differentiator)
3. Planning layer (entry point)
4. Formatter (output quality)

---

## Phase 2: Real Browser Automation

### Task 2.1: Install Playwright
```bash
npm install playwright
npx playwright install chromium
```

### Task 2.2: Implement Real Worker
Replace `mockBrowserAutomation()` in `src/worker-fleet/worker.ts`:

```typescript
// New: src/worker-fleet/browser.ts
type PageContent = {
  url: string;
  title: string;
  content: string;
  textContent: string;
  screenshot?: Buffer;
  status: 'success' | 'error' | 'blocked';
  error?: string;
};

class BrowserAutomation {
  constructor(private proxy?: string) {}

  async fetchPage(url: string): Promise<PageContent> {
    // Playwright implementation with:
    // - Stealth mode (user-agent rotation)
    // - Proxy rotation
    // - Retry logic
    // - Content extraction
  }
}
```

### Task 2.3: Add Retry Logic
```typescript
// New: src/utils/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; backoff: number }
): Promise<T>
```

---

## Phase 3: Semantic Cache

### Task 3.1: Add Embedding Library
```bash
npm install @xenova/transformers  # For local embeddings
# or
npm install openai  # Use OpenAI embeddings API
```

### Task 3.2: Implement Embedding Comparison
```typescript
// Update: src/blackboard/semantic-cache.ts
class SemanticCache {
  async findSimilar(query: string, threshold = 0.85): Promise<CacheEntry | null> {
    // 1. Generate embedding for query
    // 2. Query Redis for similar cached embeddings
    // 3. Return match if similarity >= threshold
  }
}
```

### Task 3.3: Add Cache Metrics
- Cache hit rate
- Average lookup time
- Eviction statistics

---

## Phase 4: Error Handling & Resilience

### Task 4.1: Circuit Breaker Pattern
```typescript
// New: src/utils/circuit-breaker.ts
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open';
  private failureCount: number;
  private lastFailureTime: Date;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Implementation with threshold-based state machine
  }
}
```

### Task 4.2: Structured Logging
```typescript
// Update: src/utils/logger.ts
import { createLogger, format } from 'winston';

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console(),
    // Add file transport for production
  ],
});

// Usage:
logger.info('Research completed', {
  jobId,
  duration: Date.now() - startTime,
  tokensUsed,
  sourcesCount,
});
```

### Task 4.3: Request Timeouts
Add to all external calls:
- LLM API: 30s timeout
- Search API: 10s timeout
- Browser fetch: 20s timeout
- Database: 5s timeout

---

## Phase 5: Dashboard API Integration

### Task 5.1: Create Dashboard API Service
```typescript
// New: dashboard/src/lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const api = {
  getStats: () => fetch(`${API_BASE}/api/dashboard/stats`),
  getJobs: (page: number) => fetch(`${API_BASE}/api/jobs?page=${page}`),
  getCredits: () => fetch(`${API_BASE}/api/credits`),
  createResearch: (query: string) =>
    fetch(`${API_BASE}/api/research`, { method: 'POST', body: JSON.stringify({ query }) }),
};
```

### Task 5.2: Add Backend Dashboard Endpoints
```typescript
// Update: src/api/routes.ts
router.get('/api/dashboard/stats', authMiddleware, getDashboardStats);
router.get('/api/jobs', authMiddleware, getJobs);
router.get('/api/credits', authMiddleware, getCredits);
```

### Task 5.3: Wire Components
Update each component to use API:
- DashboardOverview.tsx
- JobLogPanel.tsx
- CostPanel.tsx
- ResearchTester.tsx

---

## Phase 6: LLM Failover

### Task 6.1: Multi-Provider Support
```typescript
// New: src/llm/providers/
// ├── openai.ts
// ├── anthropic.ts
// └── failover.ts

class LLMProvider {
  private providers: LLMClient[];
  private circuitBreakers: Map<string, CircuitBreaker>;

  async generate(prompt: string, options: GenerateOptions): Promise<string> {
    // Try OpenAI first, failover to Anthropic, then local model
  }
}
```

---

## Phase 7: Performance & Observability

### Task 7.1: Add Prometheus Metrics
```typescript
// New: src/observability/metrics.ts
import { Counter, Histogram, Registry } from 'prom-client';

export const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
});

export const llmTokensUsed = new Counter({
  name: 'llm_tokens_used_total',
  help: 'Total LLM tokens used',
  labelNames: ['model', 'operation'],
});
```

### Task 7.2: Health Check Enhancement
Update existing health check to check:
- Database connectivity
- Redis connectivity
- LLM API availability
- Search API availability

---

## Implementation Order

```
Day 1-2: Testing Infrastructure
├── [1.1] Setup test framework
├── [1.2] Create test structure
└── [1.3] Write core unit tests

Day 3-4: Worker Fleet + Browser
├── [2.1] Install Playwright
├── [2.2] Implement real browser automation
└── [2.3] Add retry logic

Day 5: Semantic Cache
├── [3.1] Add embedding library
├── [3.2] Implement embedding comparison
└── [3.3] Add cache metrics

Day 6: Error Handling
├── [4.1] Circuit breaker pattern
├── [4.2] Structured logging
└── [4.3] Request timeouts

Day 7: Dashboard Integration
├── [5.1] Create API service
├── [5.2] Add backend endpoints
└── [5.3] Wire components

Day 8-9: Final Polish
├── [6.1] LLM failover (if time)
├── [7.1] Prometheus metrics
├── [7.2] Health check enhancement
└── Integration testing
```

---

## Validation Checklist

- [ ] All P0 tasks complete
- [ ] Tests pass with >70% coverage
- [ ] Browser automation fetches real content
- [ ] Semantic cache responds <100ms
- [ ] Dashboard displays live data
- [ ] Error handling works end-to-end
- [ ] Logging captures operation traces
- [ ] /health endpoint reports all systems
- [ ] No TypeScript errors
- [ ] No security vulnerabilities in deps

---

**Plan Status:** READY FOR EXECUTION
**Next Step:** Begin Phase 1 - Testing Infrastructure

# Veritas

**MCP-native research intelligence platform for AI agents**

Veritas is the research infrastructure that verifies sources, detects contradictions, and delivers structured intelligence that agents can use immediately — zero parsing required.

## Quick Start

```bash
cd ~/veritas

# Install dependencies
npm install

# Setup database
npm run db:migrate
npm run db:generate

# Start services
npm run dev              # REST API
npm run mcp              # MCP Server
```

## Architecture

| Component | Purpose |
|-----------|---------|
| **Planning Layer** | Breaks queries into tasks, generates cost estimates |
| **Worker Fleet** | Parallel workers with checkpointing |
| **Blackboard** | Shared intelligence store |
| **Artifact Store** | Full research output storage |
| **Orchestrator** | Verification loop with self-termination |
| **Contradiction Engine** | Cross-source claim analysis |
| **Trust Scorer** | Per-source credibility scoring |
| **Security** | 4-layer injection defense, proxy rotation |
| **Billing** | Stripe + credit-based pricing |

## Research Modes

- **Lite**: 3-5 sources, <5 seconds, surface results
- **Medium**: 8-15 sources, 10-30s, cross-referenced
- **Deep**: 20-50+ sources, 60-180s, multi-hop with SSE stream

## SDK Usage

```python
from researchplatform import ResearchClient

client = ResearchClient(api_key="your-key")
result = client.research(
    query="Latest AI developments",
    mode="medium",
    session_id="session-123",
    output_schema={"type": "object", "properties": {
        "summary": {"type": "string"}
    }}
)
```

```javascript
import { ResearchClient } from '@researchplatform/sdk';

const client = new ResearchClient({ apiKey: 'your-key' });
const result = await client.research({
  query: 'Latest AI developments',
  mode: 'medium',
  sessionId: 'session-123',
  outputSchema: { type: 'object', properties: { summary: { type: 'string' } } }
});
```

## Pricing Tiers

| Tier | India | International | Requests | Workers |
|------|-------|---------------|----------|---------|
| Free | ₹0 | $0 | 3,000/mo | 10 |
| Developer | ₹999 | $29 | 50,000/mo | 10 |
| Pro | ₹2,999 | $99 | 200,000/mo | 10 |
| Enterprise | ₹15,000+ | custom | unlimited | configurable |

## License

MIT

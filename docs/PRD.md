# Product Requirements Document
## Research Agent Infrastructure Platform
Version: 1.0
Status: Active
Last Updated: March 2026

---

## 1. EXECUTIVE SUMMARY

An MCP-native research intelligence layer that AI agents connect to for autonomous, verified, multi-source research. The platform accepts research queries from AI agents, plans the research before executing, dispatches parallel workers, verifies results through an orchestrator doubt-loop, and returns structured, schema-defined intelligence.

**Market**: AI agent market is $7.63B in 2025, growing at 50% CAGR toward $182B by 2033.

**Revenue**: Credit-based billing with four tiers — Free (₹0/$0), Developer (₹999/$29), Pro (₹2,999/$99), Enterprise (custom).

---

## 2. PROBLEM STATEMENT

### 2.1 What Is Broken Today

AI agents need research information. Current workflow:
1. Plug in search API (Tavily, Exa, Perplexity)
2. Write custom code to parse results
3. Write code to validate sources
4. Write code to handle failures
5. Write code to cross-reference claims
6. Write code to format output

Every developer repeats this from scratch.

### 2.2 What This Platform Replaces

Three weeks of custom engineering per developer per project. Platform handles:
- Research planning
- Parallel execution
- Source validation
- Contradiction detection
- Trust scoring
- Output formatting
- Cost control
- Failure handling
- Session memory
- Security

---

## 3. TECHNICAL ARCHITECTURE

### 3.1 Connection Layer — MCP Only

All agents connect exclusively through MCP. SDK available in Python and JavaScript.

```python
from researchplatform import ResearchClient
client = ResearchClient(mcp_key="...")
result = client.research(query="...", mode="medium", schema={...})
```

### 3.2 Core Components

| Component | Purpose |
|-----------|---------|
| API Gateway | Front door, validation, rate limiting |
| Planning Layer | Query analysis, task manifest generation |
| Worker Fleet | Parallel research with checkpointing |
| Blackboard | Shared intelligence between workers |
| Artifact Store | Full research output per task |
| Orchestrator | Doubt-loop verification |
| Contradiction Engine | Cross-source claim comparison |
| Trust Scorer | Source credibility evaluation |
| Session Memory | Persistent research context |
| Formatter | Schema-defined output |

### 3.3 Three-Layer Context Architecture

| Layer | Holder | Max Size |
|-------|--------|----------|
| Orchestrator | Orchestrator | 2,000 tokens |
| Worker | Each worker | Unlimited (artifact store) |
| Blackboard | Shared read | 5,000 tokens |

### 3.4 Research Flow

```
Query → Planning → Task Manifest → Worker Dispatch
                                          ↓
Formatter ← Orchestrator ← Blackboard ← Workers
  ↓
Structured Response
```

---

## 4. RESEARCH MODES

| Mode | Workers | Sources | Depth | Speed |
|------|---------|---------|-------|-------|
| Lite | 5 | 3-5 | Surface | <5 sec |
| Medium | 8 | 8-15 | Cross-referenced | 10-30 sec |
| Deep | 10 | 20-50+ | Multi-hop | 60-180 sec |

---

## 5. SECURITY — 4 LAYER DEFENSE

1. **Content Extraction**: Raw HTML never reaches LLM
2. **Intent Classifier**: Detects injection attempts
3. **Orchestrator Read-Only**: Zero action permissions from web content
4. **Output Validation**: Final check before dispatch

---

## 6. COST CONTROL

- Pre-research cost manifest returned before spending
- Adaptive throttle at budget percentages
- Progressive quality stages (budget hit = return previous stage)

---

## 7. PRICING TIERS

| Tier | India | International | Requests | Workers |
|------|-------|---------------|----------|---------|
| Free | ₹0 | $0 | 3,000/mo | 10 |
| Developer | ₹999/mo | $29/mo | 50,000/mo | 10 |
| Pro | ₹2,999/mo | $99/mo | 200,000/mo | 10 |
| Enterprise | ₹15k-40k/mo | Custom | Unlimited | Configurable |

---

## 8. BUILD ROADMAP

### Phase 1 — Ship and Charge (30 days)
- MCP server + API Gateway
- Planning layer + Task Manifest
- Worker fleet with checkpointing
- Trust Scorer + Formatter
- Three research modes
- Pre-research cost manifest
- Basic dashboard
- Billing integration
- Python + JS SDKs
- Free + Developer tiers

### Phase 2 — Differentiation
- Contradiction Engine
- Session Memory
- Follow-up queries
- Batch execution
- 4-layer injection defense
- Pro tier

### Phase 3 — Security and Scale
- Semantic caching
- Multi-tenant isolation
- GDPR pipeline
- Abuse detection
- LLM failover
- SSE delivery

### Phase 4 — Enterprise
- notify_and_pause workflow
- Permanent memory
- Audit logs
- Private deployment
- SLA
- Enterprise tier

---

See original PRD for complete specification.

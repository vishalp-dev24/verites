# Orchestrator Doubt Loop Architecture

## Core Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Initial Worker Results                                    │
│     └─ Blackboard receives findings from worker fleet         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Doubt Analysis                                            │
│     ├─ Thin coverage check: Claims with < min sources         │
│     ├─ Contradiction detection: Compare all finding pairs     │
│     ├─ Low confidence filter: Score < 0.6                     │
│     ├─ Missing perspectives: LLM identifies gaps            │
│     └─ Outdated check: Sources > threshold age                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Quality Assessment                                        │
│     ├─ Calculate overall confidence                           │
│     ├─ Check if quality_threshold met                         │
│     ├─ Determine recommendation (proceed/re-research)         │
│     └─ Compare against max_iterations budget                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
            ▼                                 ▼
   ┌─────────────────┐              ┌──────────────────┐
   │ Quality ≥ 0.85  │              │ Quality < 0.85    │
   │ No critical     │              │ Doubts found     │
   │ doubts          │              │                  │
   └────────┬────────┘              └────────┬─────────┘
            │                              │
            │                        ┌─────┴────────────┐
            │                        │                  │
            │                        ▼                  ▼
            │             ┌─────────────────┐  ┌─────────────────┐
            │             │ Budget remaining  │  │ Budget exceeded │
            │             │ w/ < max_it       │  │ or max_it       │
            │             └────────┬────────┘  └────────┬────────┘
            │                      │                     │
            │                      │                     ▼
            │                      │        ┌────────────────────────┐
            │                      │        │ TERMINATE              │
            │                      │        │ reason: budget_exhaust │
            │                      │        └────────────────────────┘
            │                      ▼
            │             ┌────────────────────────┐
            │             │ 4. Re-dispatch Tasks   │
            │             │ For top 2 doubts:      │
            │             │ - Convert → Task       │
            │             │ - Set mustNotOverlap   │
            │             │ - Dispatch workers     │
            │             └────────┬───────────────┘
            │                      │
            │                      ▼
            │             ┌────────────────────────┐
            │             │ 5. Checkpoint          │
            │             │ - Save to Redis        │
            │             │ - Update Blackboard    │
            │             │ - Refresh findings     │
            │             └────────┬───────────────┘
            │                      │
            └──────────────────────┘
                                   │
                                   ▼
                          ┌────────────────────────┐
                          │ LOOP BACK TO STEP 2    │
                          └────────────────────────┘

```

## Doubt Types

| Type | Detection | Severity | Action |
|------|-----------|----------|--------|
| **thin_coverage** | Sources < mode minimum | high/critical | Re-research same topic |
| **contradiction** | LLM compares findings | critical/high | Re-research with focus on conflict |
| **low_confidence** | Score < 0.6 | medium/high | Verify finding |
| **missing_perspective** | LLM identifies gaps | medium | Research uncovered angle |
| **outdated** | Sources > age threshold | medium | Search for recent info |

## Termination Conditions

```
quality_threshold ≥ 0.85 and no critical doubts → SUCCESS
max_iterations reached → PARTIAL (best effort)
budget_exceeded → PARTIAL (budget hit)
no_high_severity_doubts → SUCCESS (low confidence OK)
```

## Context Management

```
Orchestrator Layer (2,000 token budget):
├─ Plan
├─ Task statuses
├─ Quality scores
├─ Blackboard summaries
└─ Doubt history

Worker Layer (Artifact Store):
├─ Full page content
├─ Raw search results
└─ Complete source data

Blackboard Layer (5,000 token budget):
├─ Verified facts
├─ Contradictions
├─ Domain access log
└─ Worker status
```

## Checkpointing

Every iteration saves:
- Job ID
- Iteration number
- Findings count
- Cumulative cost
- Timestamp

On worker crash: Resume from last checkpoint
On redispatch: Existing artifact returns stored result (no re-cost)

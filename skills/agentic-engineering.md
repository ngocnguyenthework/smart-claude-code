---
name: agentic-engineering
description: Operate as an agentic engineer using eval-first execution, decomposition into 15-minute units, and cost-aware model routing (Haiku/Sonnet/Opus).
origin: smartclaude
---

# Agentic Engineering

## Operating Principles

1. Define completion criteria before execution
2. Decompose work into agent-sized units
3. Route model tiers by task complexity
4. Measure with evals and regression checks

## Eval-First Loop

1. Define capability eval and regression eval
2. Run baseline and capture failure signatures
3. Execute implementation
4. Re-run evals and compare deltas

## Task Decomposition — 15-Minute Unit Rule

Each unit should be:
- Independently verifiable
- Have a single dominant risk
- Expose a clear done condition

## Model Routing

| Task Type | Model | Why |
|-----------|-------|-----|
| Exploration/search | Haiku | Fast, cheap, good enough for finding files |
| Simple edits | Haiku | Single-file, clear instructions |
| Multi-file implementation | Sonnet | Best balance for coding |
| Complex architecture | Opus | Deep reasoning needed |
| PR reviews | Sonnet | Understands context, catches nuance |
| Security analysis | Opus | Can't afford to miss vulnerabilities |
| Debugging complex bugs | Opus | Needs to hold entire system in mind |
| Writing docs | Haiku | Structure is simple |

Escalate model tier only when lower tier fails with a clear reasoning gap.

## Session Strategy

- Continue session for closely-coupled units
- Start fresh session after major phase transitions
- Compact after milestone completion, not during active debugging

## Review Focus for AI-Generated Code

Prioritize:
- Invariants and edge cases
- Error boundaries
- Security and auth assumptions
- Hidden coupling and rollout risk

Skip style-only disagreements when automated format/lint already enforce style.

## Orchestrator Pattern

```
Phase 1: RESEARCH  → Explore agent (read-only)  → research-summary.md
Phase 2: PLAN      → Planner agent (Opus)        → plan.md
Phase 3: IMPLEMENT → TDD workflow                → code changes
Phase 4: REVIEW    → Code-reviewer agent         → review-comments.md
Phase 5: VERIFY    → Build-error-resolver        → green build or loop back
```

Each agent gets ONE clear input → produces ONE clear output. Outputs become inputs for next phase.

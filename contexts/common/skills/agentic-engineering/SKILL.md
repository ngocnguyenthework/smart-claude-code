---
name: agentic-engineering
description: Operate as an agentic engineer using eval-first execution, decomposition, and cost-aware model routing.
---

# Agentic Engineering

Use this skill for engineering workflows where AI agents perform most implementation work and humans enforce quality and risk controls.

## Operating Principles

1. Define completion criteria before execution.
2. Decompose work into agent-sized units.
3. Route model tiers by task complexity.
4. Measure with evals and regression checks.

## Eval-First Loop

1. Define capability eval and regression eval.
2. Run baseline and capture failure signatures.
3. Execute implementation.
4. Re-run evals and compare deltas.

## Task Decomposition

Apply the 15-minute unit rule:

- each unit should be independently verifiable
- each unit should have a single dominant risk
- each unit should expose a clear done condition

## Model Routing

- Haiku: classification, boilerplate transforms, narrow edits
- Sonnet: implementation and refactors
- Opus: architecture, root-cause analysis, multi-file invariants

## Agent-Friendly Architecture

Prefer architectures that are easy for agents to reason about and modify safely:

- explicit boundaries over implicit conventions
- stable, typed interfaces over dynamic duck-typing
- deterministic tests over anecdotal confidence
- required regression coverage for touched domains
- integration checks at interface boundaries

Agents amplify whatever the architecture makes easy — a well-structured boundary is cheaper to maintain than heroic review.

## Session Strategy

- Continue session for closely-coupled units.
- Start fresh session after major phase transitions.
- Compact after milestone completion, not during active debugging.

### Compaction Decision Guide

| Phase Transition | Compact? | Why |
|-----------------|----------|-----|
| Research → Planning | Yes | Research context is bulky; plan is the distilled output |
| Planning → Implementation | Yes | Plan is in files; free up context for code |
| Implementation → Testing | Maybe | Keep if tests reference recent code; compact if switching focus |
| Debugging → Next feature | Yes | Debug traces pollute context for unrelated work |
| Mid-implementation | No | Losing variable names, file paths, partial state is costly |
| After a failed approach | Yes | Clear dead-end reasoning before trying a new approach |

### What Survives Compaction

| Persists | Lost |
|----------|------|
| CLAUDE.md instructions | Intermediate reasoning and analysis |
| TodoWrite task list | File contents previously read |
| Memory files | Multi-step conversation context |
| Git state (commits, branches) | Tool call history |
| Files on disk | Nuanced preferences stated verbally |

Use `/compact Focus on [next task]` to guide what the summary emphasizes.

## Review Focus for AI-Generated Code

Prioritize:

- invariants and edge cases
- error boundaries
- security and auth assumptions
- hidden coupling and rollout risk

Do not waste review cycles on style-only disagreements when automated format/lint already enforce style.

## Cost Discipline

Track per task:

- model
- token estimate
- retries
- wall-clock time
- success/failure

Escalate model tier only when lower tier fails with a clear reasoning gap.

## Strong Agentic Engineer Signals

When reviewing AI-generated work or evaluating agentic capability, look for:

- Decomposes ambiguous requirements into measurable acceptance criteria
- Writes high-signal prompts and evals, not vague instructions
- Enforces risk controls (security, auth, data integrity) under delivery pressure
- Plans quality matters more than typing speed
- Review focus shifts from syntax → system behavior

## Architecture Decisions (ADR)

When choosing between significant alternatives (framework, library, pattern, DB design), capture the decision:

```markdown
# ADR-NNNN: [Title]
**Date**: YYYY-MM-DD  **Status**: accepted

## Context
[What problem prompted this? What constraints exist?]

## Decision
[What was chosen and why?]

## Alternatives Considered
- [Option A] — rejected because [reason]
- [Option B] — rejected because [reason]

## Consequences
- Positive: [what becomes easier]
- Negative: [trade-offs]
```

Store in `docs/adr/NNNN-decision-title.md`. Record the *why* — future developers need to know what was considered, not just what was chosen. Decisions worth recording: framework/library choices, DB schema strategies, auth approach, deployment model, API design patterns.

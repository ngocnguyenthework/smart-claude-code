---
name: iterative-retrieval
description: Progressive context retrieval for subagents — DISPATCH→EVALUATE→REFINE→LOOP cycle (max 3 cycles) to find the right files without exceeding context limits.
origin: smartclaude
---

# Iterative Retrieval

Solves the subagent context problem: subagents don't know which files they need until they start working.

## The Problem

- **Send everything** → exceeds context limits
- **Send nothing** → agent lacks critical information
- **Guess upfront** → often wrong, especially for unfamiliar codebases

## The Solution: 4-Phase Loop (max 3 cycles)

```
DISPATCH → EVALUATE → REFINE → LOOP (repeat up to 3x)
```

### Phase 1: DISPATCH — Broad initial search

Start with high-level intent:
```
patterns: ['src/**/*.ts', 'lib/**/*.ts']
keywords: ['authentication', 'user', 'session']
excludes: ['*.test.ts', '*.spec.ts']
```

### Phase 2: EVALUATE — Score relevance (0-1)

- **High (0.8-1.0)**: Directly implements target functionality
- **Medium (0.5-0.7)**: Contains related patterns or types
- **Low (0.2-0.4)**: Tangentially related
- **None (< 0.2)**: Exclude

For each file: score + reason + missingContext (what gaps remain)

### Phase 3: REFINE — Update search criteria

```
Add: new patterns discovered in high-relevance files
Add: terminology found in codebase (first cycle often reveals naming)
Exclude: confirmed irrelevant paths
Focus: target specific gaps from missingContext
```

### Phase 4: LOOP — Repeat or stop

Stop when: ≥3 high-relevance files AND no critical gaps remain.

Max 3 cycles. Proceed with best available context after 3 cycles.

## Practical Example

```
Task: "Fix the authentication token expiry bug"

Cycle 1:
  DISPATCH: Search "token", "auth", "expiry" in src/**
  EVALUATE: auth.ts (0.9), tokens.ts (0.8), user.ts (0.3)
  REFINE: add "refresh", "jwt"; exclude user.ts

Cycle 2:
  DISPATCH: Search refined terms
  EVALUATE: session-manager.ts (0.95), jwt-utils.ts (0.85)
  Decision: Sufficient context (2+ high-relevance, no gaps)

Result: auth.ts, tokens.ts, session-manager.ts, jwt-utils.ts
```

## Common Issue: Wrong Terminology

If Cycle 1 returns nothing relevant, the codebase uses different terminology:
```
Task: "Add rate limiting to API endpoints"
Cycle 1: Search "rate", "limit" → no matches
Refine: Discover codebase uses "throttle" terminology
Cycle 2: Search "throttle", "middleware" → throttle.ts (0.9)
```

## Use in Agent Prompts

```markdown
When retrieving context:
1. Start broad (generic keywords + common patterns)
2. Evaluate each file's relevance (0-1 scale)
3. Identify what context is still missing
4. Refine search criteria and repeat (max 3 cycles)
5. Proceed with files scoring ≥ 0.7
```

## Best Practices

1. **Start broad, narrow progressively** — don't over-specify initial queries
2. **Learn codebase terminology** — first cycle often reveals naming conventions
3. **Stop at "good enough"** — 3 high-relevance files beats 10 mediocre ones
4. **Exclude confidently** — low-relevance files won't become relevant
5. **Track gaps explicitly** — gap identification drives useful refinement

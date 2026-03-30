---
name: autonomous-loops
description: Autonomous Claude Code loop patterns — sequential pipeline (claude -p), infinite agentic loop, continuous-claude PR loop, de-sloppify cleanup pass, and RFC-driven DAG orchestration (Ralphinho).
origin: smartclaude
---

# Autonomous Loops

## Pattern Spectrum

| Pattern | Complexity | Best For |
|---------|-----------|----------|
| Sequential Pipeline | Low | Scripted daily workflows |
| Infinite Agentic Loop | Medium | Parallel spec-driven generation |
| Continuous Claude PR Loop | Medium | Multi-day iterative projects with CI gates |
| De-Sloppify | Add-on | Cleanup pass after any implementation step |
| RFC-Driven DAG (Ralphinho) | High | Large features, parallel work with merge queue |

## 1. Sequential Pipeline (`claude -p`)

Each step gets a fresh context window. Chain via filesystem state.

```bash
#!/bin/bash
set -e

# Step 1: Implement
claude -p "Read docs/auth-spec.md. Implement OAuth2 login in src/auth/ with TDD."

# Step 2: De-sloppify (separate context, focused cleanup)
claude -p "Review all changed files. Remove unnecessary type tests, defensive checks for impossible states, console.log. Keep business logic tests. Run test suite."

# Step 3: Verify
claude -p "Run build, lint, typecheck, and tests. Fix any failures. No new features."

# Step 4: Commit
claude -p "Create a conventional commit: 'feat: add OAuth2 login flow'"
```

**With model routing:**
```bash
claude -p --model opus "Analyze architecture and write a caching plan to docs/plan.md"
claude -p "Implement the caching layer per docs/plan.md"                      # Sonnet (default)
claude -p --model opus "Review all changes for security issues and edge cases"
```

**With tool restrictions:**
```bash
claude -p --allowedTools "Read,Grep,Glob" "Audit for security vulnerabilities"  # read-only
claude -p --allowedTools "Read,Write,Edit,Bash" "Implement fixes from audit.md"
```

## 2. De-Sloppify Pattern

Add a focused cleanup agent AFTER any implementation step instead of constraining with negative instructions. Negative instructions ("don't test type systems") degrade overall quality — a separate cleanup pass doesn't.

```bash
# WRONG: Constraining the implementer
claude -p "Implement feature X. Don't add unnecessary checks. Don't test type systems."

# RIGHT: Let it be thorough, clean up separately
claude -p "Implement feature X with full TDD."
claude -p "Cleanup pass: remove tests that verify language/framework behavior, redundant type checks, over-defensive error handling for impossible states, console.log, commented-out code. Run tests to verify nothing breaks."
```

## 3. Continuous Claude PR Loop

Runs Claude in a loop creating PRs, waiting for CI, and merging automatically.

```bash
continuous-claude --prompt "Add unit tests for all untested functions" --max-runs 10
continuous-claude --prompt "Fix linter errors" --max-cost 5.00
continuous-claude --prompt "Add auth feature" --max-runs 10 \
  --review-prompt "Run npm test && npm run lint, fix failures"
```

**Cross-iteration context bridge** — `SHARED_TASK_NOTES.md` persists across iterations:
```markdown
## Progress
- [x] Added auth tests (iteration 1)
- [ ] Still need: rate limiting tests

## Next Steps
- Focus on rate limiting module
```

Loop: create branch → `claude -p` → commit → push → create PR → wait for CI → (fix failures) → merge → repeat.

Stop conditions: `--max-runs N`, `--max-cost $X`, `--max-duration 2h`, `--completion-signal "DONE"`.

## 4. RFC-Driven DAG Orchestration (Ralphinho)

For large features. AI decomposes an RFC into a dependency DAG, runs each unit through a quality pipeline in isolated worktrees, lands via merge queue.

**Decomposition:**
```
RFC document → Work units with: id, name, deps[], acceptance[], tier (trivial/small/medium/large)
              → Dependency DAG → execution layers (parallel within layer, sequential between layers)
```

**Complexity tiers:**
- trivial: implement → test
- small: implement → test → code-review
- medium: research → plan → implement → test → PRD-review + code-review → fix
- large: + final-review

**Key principles:**
- Each stage runs in its own context window (reviewer never wrote the code it reviews)
- Each unit runs in its own worktree (no cross-unit contamination)
- Merge queue: rebase → tests → land or evict (evicted units get conflict context on next pass)
- Non-overlapping units land in parallel; overlapping land one-by-one

## Decision Matrix

```
Single focused change?  → Sequential Pipeline
Has RFC/spec + parallel? → Ralphinho (DAG)
Has RFC/spec, no parallel need? → Continuous Claude
Many variations of same thing? → Infinite Agentic Loop
Quick iteration? → Sequential Pipeline + De-Sloppify
```

## Anti-Patterns

1. **No exit condition** — always have max-runs, max-cost, max-duration, or completion signal
2. **No context bridge** — use `SHARED_TASK_NOTES.md` or filesystem state between `claude -p` calls
3. **Retrying same failure blindly** — capture error context and feed it to next attempt
4. **Negative instructions** — use a separate de-sloppify pass instead
5. **All agents in one context window** — reviewer should never be the author

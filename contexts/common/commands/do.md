---
description: Fast path for simple 1-3 file tasks. Skips planning. Dispatches the stack implementer and auto-runs the reviewer. No plan folder is created.
---

# /do — Direct implement

Shortest path from request to reviewed code. No plan file, no phase split. Use when the task is small enough that planning overhead exceeds the work.

## Usage

```
/do <objective>
```

**Example:**
```
/do add null check for user.email in src/auth/login.ts before the mailer call
/do fix off-by-one in paginate() — limit should be exclusive
```

## Behavior

1. Detect stack from `.claude/agents/` (same detection as `/plan`).
2. Dispatch `<stack>-implementer` with:
   - User's objective verbatim
   - Production-readiness line (env-driven config, no hardcoded values, no `TODO(prod)`)
3. After implementer returns, **auto-dispatch**:
   - `<stack>-reviewer` (always)
   - `+ database-reviewer` if schema touched
   - `+ infra-security-reviewer` if IaC touched
4. On CRITICAL findings → `AskUserQuestion`: send back / fix manually / accept / abort.
5. Print final summary: files changed, reviewer verdict, next action (commit).

## When NOT to use `/do`

- Multi-file feature spanning >3 files → use `/plan`
- Unfamiliar area / design decisions needed → use `/plan`
- Refactor across many modules → use `/refactor-clean` or `/plan`
- Cross-session work → use `/plan` (phase tracking persists)

## Related

- `/plan <objective>` — full orchestration for larger work
- `/plan-run <slug>` — phase-by-phase execution

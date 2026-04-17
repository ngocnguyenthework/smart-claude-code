---
description: Fast path for simple 1-3 file tasks. Skips planning. Runs parallel recon (code-explorer/docs-lookup/architect as applicable), dispatches the stack implementer, then auto-runs reviewers. No plan folder is created.
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

### 1. Detect stack (MANDATORY — do not skip)

List `.claude/agents/` for `*-implementer.md`. Map installed implementer to stack:
- `nestjs-implementer.md` → nestjs
- `fastapi-implementer.md` → fastapi
- `frontend-implementer.md` → frontend
- `devops-implementer.md` → devops

If no implementer agent found → halt, tell user `/do` requires a stack context; fall back to `/plan` or direct edit.
If multiple implementers found → pick the one matching files in the objective; if ambiguous, `AskUserQuestion` to choose.

### 2. Recon pass (MANDATORY unless objective names exact file+line)

**Delegate recon — do NOT read/grep yourself.** Dispatch in a single message, parallel `Task` calls, only the ones that apply:

- `code-explorer` — ALWAYS when objective touches existing code paths (bug fix, refactor, feature extension). Brief: *"Trace the code path for: <objective>. Report entry points, call graph, files to touch, existing patterns to mirror, gotchas. Do NOT edit."*
- `docs-lookup` — when objective involves a library/framework API (e.g. "use zod refine", "add Prisma middleware"). Brief: *"Fetch current docs for: <library + API>. Return minimal code example matching our usage."*
- `architect` — when objective implies a design choice (new module boundary, new abstraction, cross-cutting concern). Brief: *"Evaluate design for: <objective>. Recommend structure in ≤200 words."*
- `database-reviewer` (recon mode) — when objective mentions schema/query/migration. Brief: *"Pre-impl review of: <objective>. Flag migration-safety or query-perf issues BEFORE code is written."*
- `infra-security-reviewer` (recon mode) — when objective touches IaC/secrets/RBAC. Brief: *"Pre-impl security check on: <objective>. Flag blockers."*

**Skip recon only when:** objective names exact file + line + trivial edit (example: *"/do fix typo in README line 42"*).

Collect recon reports. If recon surfaces scope >3 files or design ambiguity → halt, `AskUserQuestion`: *"Recon shows this is bigger than /do. Route to /plan?"*

### 3. Dispatch implementer via Task tool (MANDATORY — do NOT implement inline)

**This step is REQUIRED.** Do not read files, edit code, or run bash to fulfil the objective yourself. Call the `Task` tool with `subagent_type: "<stack>-implementer"` and pass the brief below. The implementer does all the reading, editing, and running.

**Brief to pass verbatim:**

> **Objective:** <user's /do argument, verbatim>
>
> **Recon findings:** <paste code-explorer + docs-lookup + architect reports from step 2, condensed; or "skipped — trivial edit">
>
> **Production-readiness:** Do not introduce `TODO(prod)` markers, hardcoded env values, or dev-only branches without prod counterpart. Load env values via config layer. Avoid anti-patterns in `.claude/rules/common/production-readiness.md` — use correct designs from `.claude/skills/production-patterns/SKILL.md`. If any step ambiguous about prod behavior, stop and ask.
>
> **Dependencies:** Do NOT silently `npm install` / `pip install` / `go get` anything. If a new package is needed, STOP and surface an `AskUserQuestion` per `.claude/rules/common/dependency-approval.md` + `.claude/skills/dependency-selection/SKILL.md` before installing.
>
> **Scope:** 1–3 files. If the change balloons past that, stop and report — user will re-route via `/plan`.

### 4. Auto-dispatch reviewers (parallel, after implementer returns)

Single message, multiple `Task` calls:
- Always: `<stack>-reviewer`
- If schema / migration touched: `+ database-reviewer`
- If IaC touched: `+ infra-security-reviewer`

### 5. CRITICAL gate

On CRITICAL reviewer finding → `AskUserQuestion`:
- Send findings back to implementer for fix pass
- Fix manually
- Accept risk and proceed to commit
- Abort

### 6. Final summary

Print: files changed (from implementer report), reviewer verdicts, suggested commit (one-line conventional per `.claude/rules/common/git-workflow.md`). Never run `git push`. Never auto-commit.

## When NOT to use `/do`

- Multi-file feature spanning >3 files → use `/plan`
- Unfamiliar area / design decisions needed → use `/plan`
- Refactor across many modules → use `/refactor-clean` or `/plan`
- Cross-session work → use `/plan` (phase tracking persists)

## Related

- `/plan <objective>` — full orchestration for larger work
- `/plan-run <slug>` — phase-by-phase execution

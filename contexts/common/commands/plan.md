---
description: Orchestrator — plan top-level, stub each phase, require /plan-discuss per phase before execution. Human-in-the-loop at every gate.
---

# /plan — Plan & Delegate Orchestrator

`/plan` is the single entry point for any non-trivial task. The **main session** runs this as an orchestration script: it plans the top-level shape, stubs each phase, then hands off to `/plan-discuss` for per-phase interactive finalization before any implementation.

Model routing: **Opus** plans, **Sonnet** implements and reviews. Main session never writes feature code — it delegates.

## Core rule (CRITICAL)

**`/plan` NEVER creates phase folders.** Bootstrap emits exactly three root files: `PRD.md` + `TECH-SPEC.md` + `ROADMAP.md`. ROADMAP.md holds high-level H2 per-phase sections (one-sentence shippable outcome each) — no folders, no phase files, no step-level detail. Phase folders + `PHASE.md` materialize **only** on `/plan-discuss <slug> phase-NN`. Rationale: step-by-step per-phase discussion produces better-sized, better-briefed implementer inputs than one-shot multi-phase generation.

Top-level iteration goes through `/plan-discuss <slug>` (no phase arg) and may touch any of the three root files.

## When to Use

Use `/plan` for:
- New feature, scaffold, or multi-file change
- Refactor / dead-code cleanup
- Bug fix spanning >1 file or requiring root-cause tracing
- Migration / schema change
- Performance investigation
- Architecture decision

Skip `/plan` for single-line edits, typo fixes, or one-file clarifications — use `/do <objective>` or just do them.

## Gate Tools

Every decision gate uses a **native Claude Code tool** — not free-text. Two tools:

### `AskUserQuestion` — default gate

First-class, no permission required. Used for every gate except plan-mode's first approval. Structured multi-choice UI.

| Gate | Question | Options |
|---|---|---|
| After planner returns top-level (PRD+TECH-SPEC+ROADMAP) | "Plan ready. Proceed?" | `Approve — start /plan-discuss on phase-01`, `Refine top-level (/plan-discuss <slug>)`, `Abort` |
| After implementer returns | "Run reviewers on the changes?" | `Run <stack>-reviewer`, `+ infra-security-reviewer` *(IaC touched)*, `+ database-reviewer` *(schema touched)*, `Skip review`, `Abort` |
| After reviewer CRITICAL | "Reviewer blocked with CRITICAL. Next?" | `Send back to implementer`, `Fix manually`, `Accept risk`, `Abort` |

### `ExitPlanMode` — only when session in plan mode

If user entered plan mode before `/plan` (via `Shift+Tab`, `--permission-mode plan`, or `permissions.defaultMode: "plan"`), the first gate uses `ExitPlanMode` with native 5-choice UI. Detection: try `ExitPlanMode` first; fall back to `AskUserQuestion` on error.

## Orchestration Script

### 1. Detect active context

List `.claude/agents/` to find installed implementers + reviewers:
- `fastapi-implementer` + `fastapi-reviewer` + `database-reviewer` → FastAPI
- `nestjs-implementer` + `nestjs-reviewer` + `database-reviewer` → NestJS
- `frontend-implementer` + `frontend-reviewer` + `e2e-runner` → React/Next
- `devops-implementer` + `{terraform,k8s,helm,kustomize,argocd,terragrunt}-reviewer` → IaC

If multiple stacks installed (monorepo) and ask doesn't name one, prompt user before dispatching planner.

### 1a. Pre-planner recon (parallel subagent fan-out)

Planner's tools are `[Read, Grep, Glob]` only — it cannot spawn subagents. Main session delegates deep recon first in a single message with parallel `Task` calls (only those that apply to the ask):

- `code-explorer` — ALWAYS when objective touches existing code (feature extension, refactor, bug fix spanning modules). Brief: *"Trace the code path for: <ask>. Report entry points, call graph, current architecture layers, reusable modules, gotchas. Read-only — no edits."*
- `docs-lookup` — **MANDATORY** when ask names *any* library, framework, or runtime (Next.js, React, NestJS, Prisma, FastAPI, Tailwind, shadcn/ui, etc.) OR when plan will introduce new deps. Brief: *"Fetch CURRENT latest-stable version + canonical usage for: <library list>. Return `name@version (released YYYY-MM-DD)` per package + version-relevant caveats. Planner's training data is stale — do NOT let it cite versions from memory."* Report goes into planner brief under `Recon findings > Versions`.
- `architect` / `aws-architect` — when ask implies a design decision (new module boundary, new infra component, cross-cutting concern). Brief: *"Evaluate design options for: <ask>. Name ≥2 approaches with trade-offs in ≤200 words."*

**Skip recon when:** single-file ask with exact path named, or trivial config flip. Otherwise fan out.

Collect reports. Pass condensed findings into the planner brief at step 2 under a **Recon findings** heading so planner doesn't redo the same Grep/Glob passes.

### 2. Dispatch `planner` agent (Opus) — top-level only

Via Task, with:
- User's ask verbatim
- **Recon findings** (from step 1a, or "skipped — trivial ask")
- Installed implementers/reviewers
- **Scope directive:** *"Emit exactly three root files: `PRD.md` (product/why/goal/acceptance/scope/constraints/decisions log) + `TECH-SPEC.md` (architecture/whole-system workflow/existing code/dependencies/production checklist/risks) + `ROADMAP.md` (phase table + per-phase H2 sections — HIGH-LEVEL only, one-sentence shippable outcome each, no step detail). NEVER create `phase-NN-<name>/` folders — phase folders + `PHASE.md` materialize only via `/plan-discuss phase-NN`. Single-phase plans: still emit all three files; ROADMAP has one high-level phase section."*
- **Discovery budget:** *"MANDATORY `AskUserQuestion` gate BEFORE emitting ANY file. No exceptions — never write `<!-- FILE: -->` block in a response without prior `AskUserQuestion` call in same invocation. 1-2 batched calls, ≤4 questions each. Silent discovery first to eliminate answerable-from-repo questions, but gate itself is never skipped — align requirement with user before any write. For new feature / new stack / new business logic you MUST confirm tech-stack + versions + system-design + business-invariant + acceptance with the user. Zero-question plan forbidden in ALL cases (including single-file bugfix, typo, config flip — ask at minimum 1 confirmation question). Never ping-pong — batch tight."*
- **Version freshness:** *"Never cite library/framework version from training. Use `docs-lookup` recon report as source of truth; if missing, request it before writing files. Record version + fetch date + source in `PRD.md ## Decisions` initial entry."*

Planner runs silent discovery → mandatory `AskUserQuestion` round(s) → emits three root files.

### 3. Present top-level and gate on approval

Show `PRD.md` + `TECH-SPEC.md` + `ROADMAP.md` unmodified. Before the gate, print a **Whole-picture summary** — terse recap so user sees the entire plan at a glance without scrolling three files:

```
═══ Plan ready: <slug> ═══

▸ What just happened
  /plan emitted PRD.md + TECH-SPEC.md + ROADMAP.md (<N> high-level phase sections). No phase folders yet — each finalizes via /plan-discuss.

▸ Goal
  <one-line from PRD.md ## Goal>

▸ Shape
  Phases: <N> · Waves: <count> · Stack: <stack> · Agent: <implementer>
  Dependencies: <count new packages | "reuses existing stack">

▸ Phase preview (from ROADMAP.md H2 sections — high-level, finalize via /plan-discuss before /plan-run)
  | # | Phase | Wave | Depends | Ships (one-sentence) |
  |---|-------|------|---------|----------------------|
  | 01 | <name> | 1 | — | <ships line from ROADMAP H2> |
  | 02 | <name> | 2 | 01 | <ships line from ROADMAP H2> |
  | …  | …      | … | …  | … |

▸ Whole-system workflow
<paste `## System Workflow` diagram from TECH-SPEC.md verbatim>

▸ Recommended next agent
  <agent name> — <one-line why from planner's Recommended Next Agent>

▸ Next
  /plan-discuss <slug> phase-01    ← finalize phase 1 (writes phase-01-<name>/PHASE.md + creates folder)
  /plan-run     <slug> phase-01    ← halts until /plan-discuss done
```

For single-phase plans, Next block becomes `/plan-discuss <slug>` (finalizes lone phase — creates `phase-01-<name>/PHASE.md`) + `/plan-run <slug>`.

Then approval gate:

**Plan mode** → `ExitPlanMode({plan: "<top-level body>"})`.
- Approve → phase 4.
- Keep planning / refine → loop back to step 2 with feedback.
- Reject → end.

**Normal mode** → `AskUserQuestion`:
```
question: "Top-level plan ready. Proceed?"
options:
  - "Approve — start /plan-discuss on phase-01"
  - "Refine top-level (/plan-discuss <slug>)"
  - "Abort"
```

Do NOT accept free-text "yes"/"proceed" — always surface the structured gate.

### 3a. Dependency Approval Gate (CRITICAL — before any implementer dispatch)

`TECH-SPEC.md` MUST include `## Dependencies` section per `rules/common/dependency-approval.md`. Enforcement:

1. **Missing section** → reject + re-dispatch planner: *"Missing `## Dependencies` in TECH-SPEC.md — declare new packages or state `_None — reuses existing stack._`."*
2. **`_None — reuses existing stack._`** → skip gate.
3. **Lists new packages** → per-package `AskUserQuestion` (batch ≤3 tightly-coupled):
   ```
   question: "Add <package>@<version> as <kind> dep?"
   options:
     - "Approve — install <package>@<version>"
     - "Use different option (I'll name it)"
     - "Build custom instead"
     - "Skip this capability"
   ```
4. Non-approval → re-dispatch planner with choice. Revised plan re-enters step 3.
5. Approval → append entry to `PRD.md ## Decisions` (date, package, version). Proceed.
6. **Anti-circumvention:** Implementer dispatch in step 5 (via `/plan-run`) appends: *"`## Dependencies` in `TECH-SPEC.md` is exhaustive at pinned versions. Never install unapproved. STOP + `AskUserQuestion` if need arises."*

### 4. Hand off to `/plan-discuss` per phase

After top-level approved, the orchestrator does NOT dispatch the implementer directly. Instead, print the handoff banner:

```
Plan ready at .claude/plans/<slug>/ (PRD.md + TECH-SPEC.md + ROADMAP.md).
No phase folders yet — each phase finalizes via /plan-discuss.

Next:
  /plan-discuss <slug> phase-01    ← interactive Q&A (creates phase-01-<name>/PHASE.md)
  /plan-run <slug> phase-01        ← execute (halts until PHASE.md exists)

Recommended: finalize + run phases one at a time. /clear between phases keeps context fresh.
```

For **single-phase plans**:
```
Single-phase plan. Next:
  /plan-discuss <slug>             ← finalize lone phase (creates phase-01-<name>/PHASE.md)
  /plan-run <slug>                 ← execute PHASE.md steps
```

`/plan` exits. User drives remainder.

### 5 — 10. (Handled by `/plan-run`, not `/plan`)

`/plan-run` owns implementer dispatch, reviewer chaining, CRITICAL gating, commit suggestions, post-phase gate. See `plan-run.md`.

## Intent → Agent Mapping

The planner classifies intent at top-level and records a `Recommended Next Agent` section in `TECH-SPEC.md`. Mapping:

| Plan intent | Primary agent | Fallback |
|---|---|---|
| Build feature / scaffold / implement | `fastapi-implementer` / `nestjs-implementer` / `frontend-implementer` / `devops-implementer` | `architect` (design-only) |
| Remove dead code / consolidate | `refactor-cleaner` | n/a |
| Build / type errors | `build-error-resolver` (stack-specific) | `/build-fix` |
| Review existing code | `<stack>-reviewer` or `code-reviewer` | `code-reviewer` |
| Docs / codemap | `doc-updater` | n/a |
| Performance | `performance-optimizer` | n/a |
| Architecture decision | `architect` / `aws-architect` | `architect` |
| Database migration | `database-reviewer` + stack implementer | `code-reviewer` |
| IaC security audit | `infra-security-reviewer` | `code-reviewer` |
| Exploration / mapping | `code-explorer` | n/a |
| Library / framework question | `docs-lookup` | n/a |
| E2E test repair | `e2e-runner` | n/a (frontend only) |

### Non-implementation plans

If intent is refactor, review, investigation, perf, docs, or architecture, the planner asks a follow-up (e.g., *"Refactor primarily — hand off to `refactor-cleaner`, or bundle into `fastapi-implementer`?"*). Relay verbatim. Don't pick for the user.

## Prompt Shape

```
/plan <one-line objective>
  - Constraints: <must-preserve / must-not-touch / deadlines>
  - Done when: <specific testable outcome>
```

**FastAPI feature:**
```
/plan Users can reset password via email link.
  - Reuse existing mailer in src/services/mailer.py
  - Don't change auth schema unless necessary
  - Done when: integration test covers request → email → set-new-password round-trip
```

**Frontend bug:**
```
/plan Fix: /checkout returns 500 when cart empty. Trace click → API first; list every empty-cart invariant break point.
```

**Devops infra:**
```
/plan Add RDS read replica in staging, match prod sizing.
  - Must not touch prod state
  - Must not destroy anything
  - Done when: terraform plan shows create-only, no replaces
```

## Red-flag scan file targets

The red-flag scan in step 3 (pre-approval) reads across all three root files:
- `PRD.md` — scope, acceptance, decisions
- `TECH-SPEC.md` — architecture, dependencies, production checklist, system workflow
- `ROADMAP.md` — phase list (high-level)

Diagram flag points at `TECH-SPEC.md ## System Workflow` (whole-system, ≤40 lines). ROADMAP phase sections are intentionally high-level — **do not** flag them for missing diagrams; per-phase diagrams belong in `PHASE.md` after `/plan-discuss`.

## Production-Readiness Mandate (CRITICAL)

Every plan — and every implementation via `/plan-run` — must be **production-ready on first pass**. No `TODO(prod)` markers, no hardcoded env values, no "wire prod later."

Enforcement points:

1. **Planner dispatch (step 2)** — append verbatim:
   > "Production-readiness non-negotiable. `TECH-SPEC.md` must cover env-driven config, secret handling, observability, rollout/rollback, avoid anti-patterns on first pass. Read `.claude/rules/common/production-readiness.md` + `.claude/skills/production-patterns/SKILL.md`. No `TODO(prod)`."
   >
   > "Dependency approval non-negotiable. `TECH-SPEC.md` MUST include `## Dependencies` section with 2+ alternatives + stdlib baseline per new dep, or `_None — reuses existing stack._`. Read `.claude/rules/common/dependency-approval.md` + `.claude/skills/dependency-selection/SKILL.md`."

2. **Top-level red-flag scan (step 3, pre-approval)** — grep + semantic read. On hit, loop back with flags quoted.

   **Gate-skip flag (CRITICAL):** planner response contains `<!-- FILE: -->` blocks but transcript shows no `AskUserQuestion` call earlier in same invocation. On hit → reject + re-dispatch: *"No requirement-alignment questions asked. Run `AskUserQuestion` first, then re-emit files."* Zero tolerance — even trivial asks require at least 1 confirmation question.

   **String flags:** `TODO(prod)`, `FIXME(prod)`, `handle in prod later`, `wire up prod`, hardcoded URLs/keys/buckets/conn-strings, dev-only branches with no prod counterpart.

   **Version-freshness flags:** any package in `TECH-SPEC.md ## Dependencies` without source/date line in `PRD.md ## Decisions` (e.g. "Fetched YYYY-MM-DD from npm"); any version number older than current stable major of that package; `<fetch-latest>` placeholder still present; framework marketing-major mentioned in prose (e.g. "Next.js 15", "React 18") without matching fetched pin. On hit → reject + re-dispatch planner with *"Run `docs-lookup` for <packages>, rewrite pins + PRD.md Decisions source lines."*

   **Dependency flags:** missing `## Dependencies` in TECH-SPEC.md, package named in body but not section, no alternatives row, duplicates manifest dep, stdlib-feasible via library, `^`/`~`/`latest` version.

   **Diagram flags:** missing `## System Workflow` section in `TECH-SPEC.md`, empty code fence, abstract boxes only ("Service A" / "DB"), no named files/functions, >40 lines (too dense to scan).

   **Architectural anti-patterns:** server-proxied upload/download, inline `await sendEmail`, long work in HTTP handler, `setTimeout` for cron, N+1, offset pagination on large tables, missing idempotency key, missing index, in-memory cache on multi-replica, `LIKE '%q%'` search, CORS `*` + credentials, frontend-only auth, public endpoint no rate limit, auto-increment IDs in URLs, `latest` image tag, missing timeout/retry/circuit-breaker, single-step destructive migration.

3. **Per-phase enforcement** — lives in `/plan-discuss` (phase finalization) and `/plan-run` (implementer dispatch). See those commands.

Spike exception: user says "throwaway prototype" → planner records trade-off in Risks & Mitigations + orchestrator skips red-flag scan. Only if Overview says so explicitly.

## Plan Storage

**Every plan is a folder.** Shape:

```
.claude/plans/<NN>-<slug>/        NN = zero-padded 2-digit sequence (01, 02, ...)
├── PRD.md            written by /plan — product: why, users, goal, acceptance, scope, constraints, ## Decisions (ADR log)
├── TECH-SPEC.md      written by /plan — architecture, whole-system workflow, existing code, dependencies, production checklist, risks
├── ROADMAP.md        written by /plan — phase table + high-level per-phase H2 sections (one-sentence "Ships:" outcome each)
├── phase-01-<name>/  CREATED BY /plan-discuss phase-01 (not by /plan)
│   └── PHASE.md      written by /plan-discuss — goal, steps, files, workflow, production, decisions, verify, done-when, summary
└── phase-02-<name>/  same shape — created lazily per /plan-discuss invocation
    └── PHASE.md
```

**Plan ID = `NN-<slug>`.** NN derived at `/plan` creation time: `max(NN over .claude/plans/*) + 1`, zero-padded to 2 digits (3 if any existing NN ≥ 99). Gaps from deletes are NOT backfilled — sequence monotonic. Mirrors phase pattern (`phase-NN-<name>/`) so users mention plans by number too: `/plan-run 03` instead of `/plan-run 03-add-password-reset`.

**Single-phase plans** emit the same three root files. ROADMAP.md contains a single high-level phase section. `/plan-discuss <slug>` promotes the lone phase into `phase-01-<name>/PHASE.md`; `/plan-run <slug>` reads it.

Root files:
- **PRD.md** — product requirements. Frontmatter (`slug`, `status`, `created`, `stack`, `agent`). Sections: Why, Users/Callers, Goal, Acceptance, Scope (In/Out), Constraints, Decisions (append-only ADR log — replaces legacy DISCUSSION.md).
- **TECH-SPEC.md** — technical spec. Sections: Architecture, System Workflow (MANDATORY ASCII diagram, whole-system, ≤40 lines), Existing Code, Dependencies (table + alternatives + existing-dep reuse check), Production Checklist, Risks & Mitigations.
- **ROADMAP.md** — phase roadmap. Sections: Phases (table: # · title · wave · depends · status), per-phase H2 sections (one-sentence `Ships:` outcome + `Depends:`), Next. **High-level only** — no step detail, no file lists, no workflow diagrams. Details deferred to PHASE.md via `/plan-discuss`.

Per-phase file (multi-phase — written by `/plan-discuss`):
- **PHASE.md** — frontmatter (`plan`, `status`, `depends`, `wave`, `agent`). Sections: Goal, Acceptance, Steps, Files Changed, System Workflow (phase-scoped ASCII, ≤30 lines), Production Checklist, Decisions (Q&A log from `/plan-discuss` rounds + `/plan-run` deviations), Verify, Done When, Summary (appended by `/plan-run` post-execution).

Status values (PRD.md + PHASE.md frontmatter + ROADMAP.md phase-table): `planning` → `planned` (finalized via /plan-discuss) → `wip` → `done` (or `blocked`).
`wave:` groups phases runnable in parallel once deps satisfied.
Slug: kebab-case of objective (first 6 words, alphanumeric + hyphens). Folder = `<NN>-<slug>` (see Plan ID above).

### Slug resolution (canonical — every sibling command uses this)

Every command taking a `<plan>` argument (`/plan-discuss`, `/plan-run`, `/explain`, `/grill`) resolves it against `.claude/plans/` in this order:

1. **Literal match** — `.claude/plans/<arg>/` exists → use it. (Accepts full `03-add-password-reset` form.)
2. **Numeric shortcut** — `<arg>` matches `^\d{1,3}$` → glob `.claude/plans/<arg-zero-padded>-*/` → unique match → use it. (Accepts `3` or `03`. Pad arg to 2 digits before glob.)
3. **Slug-only suffix** — glob `.claude/plans/*-<arg>/` → unique match → use it. (Accepts bare `add-password-reset`, back-compat with pre-NN plans without prefix.)
4. **Ambiguous** (>1 match in step 2 or 3) → list candidates + error: *"`<arg>` matches: `03-foo`, `13-foo-bar`. Be more specific."*
5. **No match** → error + suggest `/plans` to list.

Resolved name (full `NN-slug`) becomes `<slug>` in all downstream prompts/banners — never the bare numeric form, so plan files stay self-identifying.

### Sibling commands

| Command | Purpose |
|---|---|
| `/plans` | List all plan folders + status (planning + execution progress). |
| `/plan-discuss <slug>` | Interactive Q&A for root `PRD.md` / `TECH-SPEC.md` / `ROADMAP.md`. Updates in place. |
| `/plan-discuss <slug> phase-NN` | Interactive Q&A to **materialize** a phase — creates `phase-NN-<name>/` folder and writes `PHASE.md` from the ROADMAP H2 Ships outcome. Required before `/plan-run` can execute that phase. |
| `/plan-run <slug> [phase-NN]` | Implementer + auto-reviewer; updates ROADMAP phase-table status + appends Summary to PHASE.md. Halts when phase folder / PHASE.md missing — prompts `/plan-discuss` first. |
| `/explain <slug> [phase-NN]` | Walkthrough of files touched by a done phase. |
| `/grill <slug> [phase-NN]` | Quiz on a done phase — pressure-tests mental model. |

`/plan-refine`, `/plan-phase`, `/plan-phase-refine` **no longer exist** — all iteration flows through `/plan-discuss`.

### Inbox scratchpad

`.claude/plans/_inbox.md` — flat file for not-yet-planned ideas. Claude may append when user mentions out-of-scope idea. `/plan` reads when creating new plan.

### Fast-path (no plan folder)

For 1-3 file tasks where planning overhead > work: `/do <objective>` — dispatches implementer + reviewer, no folder. See `do.md`.

## Important Notes

- **The planner never executes.** Only plans and recommends.
- **The main session never implements directly.** Delegates via `/plan-run`.
- **Per-phase discussion is mandatory.** `/plan-run` refuses to execute a stub phase — `/plan-discuss <slug> phase-NN` must finalize first. This enforces step-by-step review.
- **You are always in the loop.** Every hand-off waits for confirmation. Abort, refine, swap at any gate.
- **Plan mode supported but not required.** Outside plan mode → `AskUserQuestion` for all gates. Inside plan mode → first gate upgrades to `ExitPlanMode`.
- **Production-readiness enforced.** Red-flag scan rejects unsafe plans before approval.
- **One phase per conversation (default).** `/plan-run`'s post-phase gate recommends `/clear` before next phase. Plan folder bridges state across the reset.

## Related Commands

- `/do <objective>` — fast path, no plan folder.
- `/plans` — list plans with progress.
- `/plan-discuss <slug> [phase-NN]` — interactive iteration (top-level or phase).
- `/plan-run <slug> [phase-NN]` — execute.
- `/explain <slug> [phase-NN]` — walkthrough.
- `/grill <slug> [phase-NN]` — quiz.
- `/build-fix` — shortcut for red build.
- `/code-review` — review uncommitted diff, no plan.
- `/refactor-clean` — shortcut for dead-code cleanup.
- `/checkpoint` — save state between phases.

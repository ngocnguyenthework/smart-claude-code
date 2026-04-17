---
description: Orchestrator — plan, then delegate implementation (or refactor / review / debug / docs / perf) to the right context-aware agent. Single entry point from plan to finished work, with human-in-the-loop confirmations.
---

# /plan — Plan & Delegate Orchestrator

`/plan` is the single entry point for any non-trivial task. The **main session** runs this as an orchestration script: it plans, classifies intent, delegates to the correct stack-specific agent, and optionally chains into a reviewer. You confirm at each gate.

Model routing happens automatically: **Opus** plans, **Sonnet** implements and reviews. The main session itself never writes the feature code — it delegates.

## When to Use

Use `/plan` when the work is any of:
- New feature, scaffold, or multi-file change
- Refactor / dead-code cleanup
- Bug fix that spans >1 file or requires root-cause tracing
- Migration / schema change
- Performance investigation
- Architecture decision

Skip `/plan` for single-line edits, typo fixes, or one-file clarifications — just do them.

## Gate Tools (how confirmations work)

Every decision gate in this orchestration uses a **native Claude Code tool** for user input — not free-text "type yes / proceed." This gives you structured choices and clean UX.

Two tools are in play:

### `AskUserQuestion` — the default gate (works in any permission mode)

First-class, no permission required, always available. Use it for **every** confirmation gate except where `ExitPlanMode` is applicable (see below). The main session calls it with a `question` string and a list of choice `options`. The user picks one via the native multi-choice UI.

**Canonical option shapes** the main session should offer:

| Gate | Question | Options |
|---|---|---|
| After planner returns | "Proceed with this plan?" | `Proceed with <primary-agent>`, `Use different agent`, `Modify plan`, `Abort` |
| After user picks "Use different agent" | "Which agent should execute this plan?" | (list of alternatives the planner suggested, plus `Other — I'll name one`) |
| After user picks "Modify plan" | "What should change?" | (free-text follow-up — planner re-dispatches with the change) |
| After implementer returns | "Run reviewers on the changes?" | `Run <stack>-reviewer`, `Run stack reviewer + infra-security-reviewer` *(only if IaC touched)*, `Run stack reviewer + database-reviewer` *(only if schema touched)*, `Skip review`, `Abort` |
| After reviewer returns CRITICAL findings | "Reviewer blocked with CRITICAL issues. What next?" | `Send findings back to implementer`, `Fix manually`, `Accept risk and commit anyway`, `Abort` |

Any unrecognized option → re-ask. Do not guess.

### `ExitPlanMode` — the upgraded plan-approval gate (only when session is in plan mode)

If the user entered plan mode before running `/plan` (via `Shift+Tab`, `--permission-mode plan` at CLI launch, or `permissions.defaultMode: "plan"` in `settings.json`), the main session uses `ExitPlanMode` **instead of `AskUserQuestion` for the first gate** (plan approval). This surfaces Claude Code's native plan-approval UI with five choices:

1. Approve + auto-accept future edits
2. Approve + accept edits as they come
3. Approve + review each edit manually
4. Keep planning (feedback)
5. Refine with Ultraplan

On approval, plan mode exits automatically and the main session proceeds to dispatch the implementer. On "keep planning" or "refine," loop back to the planner with the user's feedback.

**Plan-mode detection (heuristic for the main session):** the surest signal is that recent write-attempts were blocked. Other signals: the session banner / status indicates plan mode; the user explicitly said they toggled it. If unsure, **try `ExitPlanMode` first** — if it errors with "not in plan mode," fall back to `AskUserQuestion`. Either path gives the user a structured approval UI.

### All subsequent gates use `AskUserQuestion`

`ExitPlanMode` applies **only** to the plan-approval gate. All downstream gates (picking an alternative agent, offering reviewer hand-off, handling reviewer findings) use `AskUserQuestion` regardless of whether the session was ever in plan mode.

## What the Main Session Does (Orchestration Script)

### 1. Detect active context

List `.claude/agents/` to see which implementers / resolvers / reviewers are installed. Typical combinations:
- `fastapi-implementer` + `fastapi-reviewer` + `database-reviewer` → FastAPI project
- `nestjs-implementer` + `nestjs-reviewer` + `database-reviewer` → NestJS project
- `frontend-implementer` + `frontend-reviewer` + `e2e-runner` → React/Next project
- `devops-implementer` + any of `{terraform,k8s,helm,kustomize,argocd,terragrunt}-reviewer` → IaC project

If **multiple** stack contexts are installed (monorepo), and the ask doesn't clearly name one, ask the user which stack this plan is for **before** dispatching the planner.

### 2. Dispatch the `planner` agent (Opus)

Via Task, with:
- The user's ask verbatim
- A line listing which stack implementers / reviewers are installed (so the planner can tailor its Recommended Next Agent to what's actually available)
- A line enforcing the discovery budget: **"High-level discovery is capped at ONE `AskUserQuestion` call with ≤4 batched questions. If the objective + codebase + rules answer the question, skip the call entirely. Never ping-pong the user with follow-up questions during planning."**

The planner runs silent discovery → (optional single batched question call) → **size classification** → emits the plan. The plan ends with a **Recommended Next Agent** section naming one primary agent + alternatives.

**Size classification gate (run by planner at step 2a of its agent contract)**: when the planner estimates **>3 phases**, it pauses with `AskUserQuestion` offering Large (folder-per-phase, deep-dive later via `/plan-phase`) vs Small (flat phase files, plan fully now). 1-2 phases auto-inline, 3 phases auto-flat — no question asked. This counts as a *separate* `AskUserQuestion` call from the high-level discovery one — the discovery budget is 1 call × ≤4 questions, the size gate is independent because it depends on the shape of the plan that discovery produced.

**Discovery rule enforcement (orchestrator):** If the planner returns control to the main session with a follow-up `AskUserQuestion` beyond the high-level discovery batch + the size gate, stop it — re-dispatch the planner with "bundle remaining questions into the phase files instead; you've used your discovery budget." Excess interrogation is a planner defect, not a user cost.

### 3. Present the plan and gate on approval

Present the plan **unmodified** in the conversation so the user can read it. Then invoke the approval gate — choose **one** of the two tools based on the current permission mode:

**If in plan mode** → call `ExitPlanMode({plan: "<full plan body>"})`.
- On the user's approval choice → plan mode exits automatically; proceed to step 4 with the planner's *primary* recommended agent.
- On "keep planning" / "refine" → loop back to step 2 with the user's feedback appended to the original ask.
- On any form of rejection → end the cycle.

**If not in plan mode** (or if `ExitPlanMode` errors) → call `AskUserQuestion` with:
```
question: "Proceed with this plan?"
options:
  - "Proceed with <primary-agent>"
  - "Use different agent"
  - "Modify plan"
  - "Abort"
```
- `Proceed with <primary-agent>` → go to step 4 with that agent.
- `Use different agent` → call `AskUserQuestion` again with the list of alternatives from the planner's Recommended Next Agent section; dispatch the chosen one.
- `Modify plan` → ask the user (plain-text follow-up) what to change, re-dispatch the planner with that change, loop back to step 3.
- `Abort` → end the cycle.

Do **not** accept free-text "yes" / "proceed" as a substitute for these tools — always surface the structured gate so the user sees the choices.

### 3a. Dependency Approval Gate (CRITICAL — before implementer dispatch)

After plan approval (step 3) and **before** dispatching the implementer (step 4), the orchestrator parses the approved `PLAN.md` for the `## Dependencies` section.

**Enforcement:**

1. **Missing section → reject + loop back.** If `PLAN.md` has no `## Dependencies` section at all, re-dispatch the planner with the message: *"Missing `## Dependencies` section — per `rules/common/dependency-approval.md`, every plan must declare new packages (or state `_None — reuses existing stack._` explicitly)."* Do not proceed to step 4.

2. **Section exists and says `_None — reuses existing stack._`** → skip the gate, proceed to step 4.

3. **Section lists new packages → surface approval gate(s).** For each entry under `### New packages`, call `AskUserQuestion`:

   ```
   question: "Add <package>@<version> as a <kind> dependency?"
   options:
     - "Approve — install <package>@<version>"
     - "Use different option (I'll name it)"
     - "Build custom instead (no new dep)"
     - "Skip this capability"
   ```

   **Batch rule:** if the plan introduces ≤3 tightly-coupled packages (e.g. a runtime lib + its `@types/*` + one test helper), use a **single** `AskUserQuestion` listing them together as one bundled approval. For >3 deps or deps serving separate capabilities, ask per-package.

4. **On any "Use different option" / "Build custom" / "Skip"** → re-dispatch the planner with the user's choice appended. Revised plan re-enters step 3. Do not patch the plan inline.

5. **On "Approve"** → record the approval in the plan's `DISCUSSION.md` (append an entry: date, packages approved, exact versions). Then proceed to step 4.

6. **Anti-circumvention:** When dispatching the implementer in step 4, append this line verbatim to the implementer's instructions: *"The `## Dependencies` section of `PLAN.md` is the exhaustive list of packages you may install, at the exact pinned versions shown. If you find you need a package not listed, STOP and surface a fresh `AskUserQuestion` — never `npm install` / `pip install` silently. The install-guard hook will warn on every install; that warning is not suppression, it is a reminder the user approval must already exist."*

### 4. Dispatch the chosen agent (Sonnet)

Via Task, with:
- The **confirmed plan** (full text)
- Paths to the stack's `rules/` files (the implementer reads these in its own "Read First" step)

Wait for the agent's result. Relay the agent's "Output Format" summary to the user.

### 5. Offer reviewer hand-off

After the implementer finishes, relay its Output Format summary, then call `AskUserQuestion`. Tailor the options to what the change actually touched:

Base option set (always present):
- `Run <stack>-reviewer`
- `Skip review`
- `Abort` (stop before commit)

Append additional options when the diff touches:
- **IaC** (`*.tf`, `*.yaml` under `manifests/` / `charts/` / `overlays/`, `.tfvars`) → add `Run <stack>-reviewer + infra-security-reviewer`.
- **Database** (migrations dir, schema files, entity classes) → add `Run <stack>-reviewer + database-reviewer`.
- **Security-sensitive code** (auth, secrets, input validation, crypto, RBAC) → add `Run <stack>-reviewer + code-reviewer (security focus)`.

Example call (implementer touched IaC and the database):

```
question: "Run reviewers on the changes?"
options:
  - "Run <stack>-reviewer"
  - "Run <stack>-reviewer + infra-security-reviewer"
  - "Run <stack>-reviewer + database-reviewer"
  - "Run all three"
  - "Skip review"
  - "Abort"
```

Dispatch the chosen reviewers in **parallel** (single message with multiple Task calls) when they're independent.

### 5a. Gate on reviewer findings

If any reviewer returns **CRITICAL** findings, call `AskUserQuestion`:

```
question: "Reviewer flagged CRITICAL issues. What next?"
options:
  - "Send findings back to implementer for a fix pass"
  - "Fix manually — I'll handle it"
  - "Accept risk and proceed to commit"
  - "Abort"
```

If the user picks "Send findings back to implementer," re-dispatch the same implementer agent with the reviewer's output appended — no re-plan needed.

### 6. Summarize the cycle

Final message: one paragraph covering (a) what was planned, (b) what was implemented, (c) reviewer verdicts, (d) any deviations the implementer flagged, (e) next suggested action (commit / test / manual verification).

## Intent → Agent Mapping

The planner classifies and recommends. Mapping:

| Plan intent | Primary agent | Fallback if not installed |
|---|---|---|
| Build feature / scaffold / implement | `fastapi-implementer` / `nestjs-implementer` / `frontend-implementer` / `devops-implementer` | `architect` (if no implementer is installed — design-only output) |
| Remove dead code / consolidate | `refactor-cleaner` | n/a (in common) |
| Build / type errors | `build-error-resolver` (stack-specific: fastapi / nestjs / frontend) | Pick by which `.claude/agents/build-error-resolver.md` is installed; fall back to `/build-fix` command if none |
| Review existing code | `<stack>-reviewer` or `code-reviewer` | `code-reviewer` (in common) |
| Docs / codemap | `doc-updater` | n/a (in common) |
| Performance | `performance-optimizer` | n/a (in common) |
| Architecture decision | `architect` (app) / `aws-architect` (infra) | `architect` (in common) |
| Database migration | `database-reviewer` + stack implementer | `code-reviewer` |
| IaC security audit | `infra-security-reviewer` | `code-reviewer` |
| Exploration / mapping | `code-explorer` | n/a (in common) |
| Library / framework question | `docs-lookup` | n/a (in common) |
| E2E test repair | `e2e-runner` | n/a (frontend context only) |

### When the plan is NOT an implementation task

If the planner classifies the work as refactor, review, investigation, perf, docs, or architecture, it **will not silently default to an implementer**. It asks a follow-up, e.g.,

> "This plan is primarily a refactor. Hand off to `refactor-cleaner`, or bundle the cleanup into `fastapi-implementer`?"

Relay the follow-up to the user exactly as the planner wrote it. Do not pick for them.

## Prompt Shape (what to type)

```
/plan <one-line objective>
  - Constraints: <must-preserve / must-not-touch / deadlines>
  - Done when: <specific testable outcome>
```

**Example (FastAPI, feature):**
```
/plan Users can reset their password via email link.
  - Reuse the existing mailer service in src/services/mailer.py
  - Don't change the auth schema unless necessary
  - Done when: integration test covers request → email → set-new-password round-trip
```

**Example (frontend, bug):**
```
/plan Fix: /checkout returns 500 when cart is empty. Before fixing, trace the path from the button click to the API and list every place the empty-cart invariant could break.
```

**Example (devops, infra):**
```
/plan Add RDS read replica in staging, matching prod sizing.
  - Must not touch prod state
  - Must not destroy anything
  - Done when: terraform plan shows create-only, no replaces
```

## Production-Readiness Mandate (CRITICAL)

Every plan produced by `/plan` — and every implementation that follows — must be **production-ready on the first pass**. No dev-only scaffolding with `TODO(prod)` markers, no hardcoded env-specific values, no "we'll wire prod later."

The main session enforces this at three points:

1. **When dispatching the planner (step 2)** — append these two lines verbatim to the planner's instructions:
   > "Production-readiness is non-negotiable. The plan must cover env-driven config, secret handling, observability, rollout/rollback, and avoid architectural anti-patterns on first pass. Read `.claude/rules/common/production-readiness.md` (anti-pattern catalog) and `.claude/skills/production-patterns/SKILL.md` (correct designs) before emitting the plan. Do not defer prod concerns with `TODO(prod)`. See planner's '3a. Production-Readiness' section."
   >
   > "Dependency approval is non-negotiable. The plan MUST include a `## Dependencies` section listing every new package / MCP / container image / SaaS the implementation will introduce — or explicitly state `_None — reuses existing stack._`. For each new dep, list 2+ alternatives + stdlib baseline with the rubric from `.claude/skills/dependency-selection/SKILL.md`. Read `.claude/rules/common/dependency-approval.md` before planning. See planner's '3b. Dependency Footprint' section."

2. **When presenting the plan to the user (step 3)** — before surfacing the approval gate, scan the plan body for red flags. If any appear, **do not present for approval** — loop back to the planner with the specific red flags quoted, and ask for a revised plan.

   **String-level flags** (grep the plan body):
   - `TODO(prod)`, `FIXME(prod)`, `handle in prod later`, `wire up prod`
   - Hardcoded URLs / access keys / bucket names / connection strings
   - Dev-only branches with no prod counterpart
   - Missing secret / observability plan on new code paths

   **Dependency flags** (semantic read — see `rules/common/dependency-approval.md`):
   - `PLAN.md` missing a `## Dependencies` section entirely
   - Plan body names a package (`npm install x`, `add axios`, etc.) but the section doesn't list it
   - `## Dependencies` lists a package with no alternatives-considered row
   - Plan adds a package that duplicates one already in the target's manifest
   - Plan introduces a stdlib-feasible capability (UUID, debounce, deep clone) via a library with >0 transitives
   - Pinned version uses `^` / `~` / `latest` instead of an exact version

   **Architectural anti-patterns** (semantic read — see `rules/common/production-readiness.md` for full catalog):
   - Server proxies file upload / download (should use presigned URL direct client↔S3)
   - Inline `await sendEmail` / SMS / push in request handler (should enqueue)
   - Long-running work (>1s target) in HTTP handler (should be background job)
   - `setTimeout` / `setInterval` for scheduled jobs (should use CronJob / EventBridge)
   - N+1 query patterns (loop over rows making per-row DB calls)
   - Offset pagination on large/growing tables (should be keyset cursor)
   - Mutations without idempotency key on retryable paths (payments, outbound API calls)
   - Missing index on newly-filtered column
   - In-memory cache on multi-replica service (should be Redis/Memcached)
   - `LIKE '%q%'` search on large tables (should be FTS / OpenSearch)
   - CORS `*` on credentialed endpoints
   - Frontend-only auth / role checks
   - Public endpoints with no rate limiting
   - Auto-increment DB ids in public URLs
   - `latest` image tag for prod deployments
   - External calls missing timeout / retry / circuit breaker
   - Destructive migrations in one step (should be expand → backfill → contract)

   When looping back, quote the specific offending lines and name the correct pattern from `skills/production-patterns/SKILL.md` so the planner knows the target shape.

3. **When dispatching the implementer (step 4)** — append these two lines verbatim to the implementer's instructions:
   > "Do not introduce `TODO(prod)` markers, hardcoded env-specific values, or dev-only branches without the prod counterpart. Load all env-specific values via the project's config layer. Avoid architectural anti-patterns listed in `.claude/rules/common/production-readiness.md` — reach for the correct designs in `.claude/skills/production-patterns/SKILL.md` (presigned uploads, enqueued emails, idempotency keys, cursor pagination, etc.). If any step in the plan is ambiguous about prod behavior, stop and ask — do not guess."
   >
   > "The `## Dependencies` section of `PLAN.md` is the exhaustive list of packages you may install, at the exact pinned versions shown. Do NOT silently `npm install` / `pip install` / `go get` anything else. If you find you need a package not listed, STOP, run the dependency-approval workflow from `.claude/rules/common/dependency-approval.md` + `.claude/skills/dependency-selection/SKILL.md`, and surface a fresh `AskUserQuestion` before installing."

If the user explicitly asked for a throwaway spike ("just prototype this locally"), the planner records the trade-off in Risks & Mitigations and the orchestrator skips the red-flag scan — but only if the Overview says so explicitly.

## Important Notes

**The planner never executes.** It only plans and recommends.
**The main session never implements directly.** It delegates — model switching and stack-specialized rules depend on that hand-off.
**You are always in the loop.** Every hand-off (planner → implementer, implementer → reviewer) waits for your confirmation before running. You can abort, swap agents, or re-plan at any gate.
**Plan mode is supported but not required.** Running `/plan` outside plan mode uses `AskUserQuestion` for every gate (works identically). Running `/plan` inside plan mode upgrades the first gate to `ExitPlanMode` — you get Claude Code's native plan-approval UI with five approval modes. Enter plan mode with `Shift+Tab` before `/plan` if you want harness-level write-safety during the planning phase.
**Production-readiness is enforced.** See the "Production-Readiness Mandate" section above — the orchestrator rejects plans with `TODO(prod)` markers and dev-only paths before ever showing them to you.
**One phase per conversation (default).** `/plan-run`'s post-phase gate recommends `/clear` before the next phase. Plan folder (`CONTEXT.md` / `DISCUSSION.md` / `PLAN.md` / phase Summaries) bridges state across the reset. This keeps each implementer + reviewer pass operating in a fresh context window — critical for multi-phase plans where conversation history would otherwise grow unbounded. Skip the `/clear` only when phases are tightly coupled.

## Plan Storage

**Every plan is a folder.** No loose `.md` files in `.claude/plans/`. The folder separates the *why* (CONTEXT), *trade-offs* (DISCUSSION), and *how* (PLAN) so each can evolve without bloating the others.

Phase storage has two shapes based on the size-classification gate (section "What the Main Session Does", step 2a of the planner):

```
# SMALL (1-2 phases inline, or 3 phases flat files)
.claude/plans/<slug>/
├── CONTEXT.md
├── DISCUSSION.md
├── PLAN.md                  # `## Steps` inline for 1-2 phases, `## Phases` table for 3
├── phase-01-<name>.md       # only when 3 phases — flat files
├── phase-02-<name>.md
└── phase-03-<name>.md

# LARGE (>3 phases AND user picked Large at size gate)
.claude/plans/<slug>/
├── CONTEXT.md
├── DISCUSSION.md
├── PLAN.md                  # `## Phases` table, `File` column points to folders
├── phase-01-<name>/
│   ├── GOAL.md              # stub at plan creation; status: planning
│   ├── CONTEXT.md           # filled by /plan-phase
│   ├── PLAN.md              # filled by /plan-phase — implementer brief
│   └── DISCUSSION.md        # filled by /plan-phase, appended to by /plan-run + /plan-phase-refine
└── phase-02-<name>/
    └── ...
```

Top-level (both modes):
- **CONTEXT.md** — why this change, constraints (performance / security / deadlines), existing code refs, stakeholders. Written once at plan creation; rarely updated.
- **DISCUSSION.md** — append-only log of decisions and trade-offs. Each entry dated. `/plan-refine` appends here. Reviewer findings that change direction append here.
- **PLAN.md** — the actionable file. Frontmatter (`slug`, `status`, `created`, `stack`, `agent`). Sections: Overview, Acceptance, Phases (table when multi-phase) OR Steps (inline when 1-2 phases), Next action.

Small-mode per phase:
- **phase-NN-<name>.md** — self-contained brief per phase. Full implementer input. Written by `/plan` in one pass.

Large-mode per phase (folder):
- **GOAL.md** — narrow phase goal + acceptance + deps. Stub emitted by `/plan` at creation (status: `planning`). Flipped to `planned` by `/plan-phase`, `wip` by `/plan-run`, `done` by `/plan-run` completion.
- **CONTEXT.md** (inside folder) — phase-scoped constraints, reusable code refs, prior-phase outputs this phase depends on. Filled by `/plan-phase`.
- **PLAN.md** (inside folder) — concrete steps, files touched, production checklist, verify, done-when. Filled by `/plan-phase`. This is what `/plan-run` reads. `## Summary` appended by `/plan-run` after execution.
- **DISCUSSION.md** (inside folder) — phase-scoped decisions log. Started by `/plan-phase`, appended by `/plan-phase-refine` and `/plan-run`.

`status` values: `planning` → `in-progress` → `done` (or `blocked` on CRITICAL reviewer findings).
Phase `status` values: `planning` (large-mode stub) → `planned` (large-mode deep-planned, or small-mode at creation) → `wip` → `done` (or `blocked`).
`wave:` field in phase frontmatter groups phases runnable in parallel once deps satisfied.
Slug derivation: kebab-case of the objective (first 6 words, alphanumeric + hyphens).

### Sibling commands

| Command | Purpose |
|---|---|
| `/plans` | List all plan folders + status (both planning and execution progress) |
| `/plan-refine <slug> [CONTEXT\|DISCUSSION\|PLAN\|phase-NN]` | Re-dispatch planner scoped to top-level file, or to one flat phase file (small mode). For large-mode phase folders, delegates to `/plan-phase-refine`. |
| `/plan-phase <slug> phase-NN` | **Large mode only.** Deep-dive planner for one phase — fills CONTEXT / PLAN / DISCUSSION inside phase folder. Required before `/plan-run` can execute a large-mode phase. |
| `/plan-phase-refine <slug> phase-NN [GOAL\|CONTEXT\|PLAN\|DISCUSSION]` | **Large mode only.** Refine one file inside a phase folder. |
| `/plan-run <slug> [phase-NN]` | Implementer + auto-reviewer; updates PLAN.md phase table + appends Summary (to flat file or folder's `PLAN.md`); offers `/explain` and `/grill` at post-phase gate. Halts on large-mode stub folders — prompts `/plan-phase` first. |
| `/explain <slug> [phase-NN]` | Walkthrough of files touched by a done phase (reads phase Summary) |
| `/grill <slug> [phase-NN]` | Quiz on a done phase — pressure-tests mental model against acceptance criteria |

The orchestrator updates `PLAN.md` phase-table status **after every gate** (via `Edit`), so `/plans` always reflects truth. Decisions append to `DISCUSSION.md`.

### Inbox scratchpad

`.claude/plans/_inbox.md` — single flat file for not-yet-planned ideas. Claude may append when the user mentions an idea out-of-scope for the current plan. Review manually; `/plan` reads it when creating a new plan.

### Fast-path (no plan folder)

For 1-3 file tasks where planning overhead exceeds the work, use `/do <objective>` — dispatches implementer + reviewer directly, no plan folder. See `do.md`.

## Related Commands

- `/do <objective>` — fast path for small tasks (no plan folder).
- `/plans` — list existing plans with planning + execution progress.
- `/plan-refine <slug> [phase-NN]` — refine a plan in place (top-level files, or flat phase file in small mode).
- `/plan-phase <slug> phase-NN` — deep-dive planner for one phase of a large plan (folder mode).
- `/plan-phase-refine <slug> phase-NN [GOAL|CONTEXT|PLAN|DISCUSSION]` — refine one file inside a phase folder.
- `/plan-run <slug> [phase-NN]` — execute a phase with auto-reviewer.
- `/explain <slug> [phase-NN]` — concise structural walkthrough of what a phase shipped (also accepts ad-hoc `<path>` / `<symbol>`).
- `/grill <slug> [phase-NN]` — quiz yourself on what a phase shipped (also accepts ad-hoc `<path>`). Offered automatically at `/plan-run`'s post-phase gate.
- `/build-fix` — shortcut when the task is *only* fixing a red build.
- `/code-review` — review any uncommitted diff without a plan.
- `/refactor-clean` — shortcut when the task is *only* dead-code cleanup.
- `/checkpoint` — save state between phases on long plans.

If you're not sure which shortcut fits, just run `/plan` — the orchestrator routes for you.

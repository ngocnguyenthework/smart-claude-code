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

The planner returns a plan that ends with a **Recommended Next Agent** section naming one primary agent + alternatives.

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

1. **When dispatching the planner (step 2)** — append this line verbatim to the planner's instructions:
   > "Production-readiness is non-negotiable. The plan must cover env-driven config, secret handling, observability, and rollout/rollback on first pass. Do not defer prod concerns with `TODO(prod)`. See planner's '2a. Production-Readiness' section."

2. **When presenting the plan to the user (step 3)** — before surfacing the approval gate, scan the plan body for red flags (`TODO(prod)`, `FIXME(prod)`, `handle in prod later`, `hardcoded` URLs/keys, dev-only branches with no prod counterpart, missing secret/observability plan on new code paths). If any appear, **do not present for approval** — loop back to the planner with the specific red flags quoted, and ask for a revised plan.

3. **When dispatching the implementer (step 4)** — append this line verbatim to the implementer's instructions:
   > "Do not introduce `TODO(prod)` markers, hardcoded env-specific values, or dev-only branches without the prod counterpart. Load all env-specific values via the project's config layer. If any step in the plan is ambiguous about prod behavior, stop and ask — do not guess."

If the user explicitly asked for a throwaway spike ("just prototype this locally"), the planner records the trade-off in Risks & Mitigations and the orchestrator skips the red-flag scan — but only if the Overview says so explicitly.

## Important Notes

**The planner never executes.** It only plans and recommends.
**The main session never implements directly.** It delegates — model switching and stack-specialized rules depend on that hand-off.
**You are always in the loop.** Every hand-off (planner → implementer, implementer → reviewer) waits for your confirmation before running. You can abort, swap agents, or re-plan at any gate.
**Plan mode is supported but not required.** Running `/plan` outside plan mode uses `AskUserQuestion` for every gate (works identically). Running `/plan` inside plan mode upgrades the first gate to `ExitPlanMode` — you get Claude Code's native plan-approval UI with five approval modes. Enter plan mode with `Shift+Tab` before `/plan` if you want harness-level write-safety during the planning phase.
**Production-readiness is enforced.** See the "Production-Readiness Mandate" section above — the orchestrator rejects plans with `TODO(prod)` markers and dev-only paths before ever showing them to you.

## Related Commands

- `/build-fix` — shortcut when you know the task is *only* fixing a red build (skips planning).
- `/code-review` — review any uncommitted diff without a plan.
- `/refactor-clean` — shortcut when you know the task is *only* dead-code cleanup (skips planning).
- `/checkpoint` — save state between phases on long plans.

If you're not sure which shortcut fits, just run `/plan` — the orchestrator routes for you.

# Plan Workflow

End-to-end guide for the `/plan` system: from one-line objective to merged code, across multiple phases and `/clear` boundaries.

Pairs with:
- `commands/plan.md` — orchestrator contract (bootstrap + stub phases)
- `commands/plan-discuss.md` — interactive Q&A to finalize (or iterate) phases + top-level
- `commands/plan-run.md` — phase execution contract
- `commands/plans.md` — plan index
- `agents/planner.md` — planner agent contract (bootstrap + interactive modes)
- `INTERNALS.md` — hooks / memory / safety

---

## Mental model

```
/plan <objective>
    │
    ▼
planner (Opus, bootstrap mode)
    │
    ├── emits top-level:   CONTEXT.md · GOAL.md · DISCUSSION.md · PLAN.md
    └── emits per phase:   phase-NN-<name>/CONTEXT.md (stub, ~20 lines)
                           (NO GOAL.md, NO PLAN.md, NO DISCUSSION.md yet)
    ▼
user approves top-level plan
    ▼
(loop per phase)
/plan-discuss <slug> phase-NN
    │
    ├── planner (Opus, interactive mode) runs Q&A rounds (≤4)
    ├── user approves proposed content
    └── emits: phase-NN-<name>/GOAL.md · PLAN.md · DISCUSSION.md
    ▼
/plan-run <slug> phase-NN
    │
    ├── implementer (Sonnet) — halts on stub phases (requires /plan-discuss first)
    ├── auto-dispatched reviewers (parallel)
    └── Summary appended to phase PLAN.md · commit suggestion printed
    ▼
user commits manually
    ▼
/clear → next phase
```

Three guarantees:
1. **You confirm every hand-off.** Planner → /plan-discuss → implementer → reviewer all gate on `AskUserQuestion`.
2. **Plan folder bridges `/clear`.** Conversation resets; plan state persists.
3. **Each phase is self-contained.** Fresh implementer reads only top-level `CONTEXT.md` + `GOAL.md` + phase folder (`CONTEXT.md` + `GOAL.md` + `PLAN.md`) + project rules.

Key shift from older flows: **`/plan` never auto-generates phase `GOAL.md` / `PLAN.md` / `DISCUSSION.md`.** Phase content comes from `/plan-discuss`, a mandatory interactive step. Rationale: step-by-step per-phase discussion produces better-sized, better-briefed implementer inputs than one-shot multi-phase generation.

---

## File anatomy

Every plan is a folder under `.claude/plans/<slug>/`.

### Multi-phase plan

```
.claude/plans/<slug>/
├── CONTEXT.md                         why + constraints + existing code        (written by /plan)
├── GOAL.md                            big-picture success + non-negotiables    (written by /plan)
├── DISCUSSION.md                      decisions log                            (written by /plan, appended)
├── PLAN.md                            overview + acceptance + phase table      (written by /plan)
├── phase-01-<name>/
│   ├── CONTEXT.md                     phase scope hint + deps (stub)           (written by /plan)
│   ├── GOAL.md                        phase goal + acceptance                  (written by /plan-discuss)
│   ├── PLAN.md                        implementer brief + Summary              (written by /plan-discuss; Summary appended by /plan-run)
│   └── DISCUSSION.md                  phase Q&A log                            (written by /plan-discuss, appended)
├── phase-02-<name>/
│   └── ...
└── phase-NN-<name>/
```

### Single-phase plan

```
.claude/plans/<slug>/
├── CONTEXT.md
├── GOAL.md
├── DISCUSSION.md
└── PLAN.md               ## Steps inline (no phase folder)
```

Plus `.claude/plans/_inbox.md` — flat scratchpad for ideas not yet planned.

### Shape decision (mechanical, no user gate)

| Phase count | Shape |
|---|---|
| 1 | Inline `PLAN.md ## Steps`, no phase folder |
| 2+ | Folder per phase; each starts with `CONTEXT.md` stub only |

Planner chooses based on objective scope. >6 phases flags in Risks & Mitigations but still emits all stubs.

### Top-level PLAN.md frontmatter

```
slug:    <kebab>           e.g. add-password-reset
status:  planning | in-progress | done | blocked
created: YYYY-MM-DD
stack:   fastapi | nestjs | frontend | devops
agent:   <implementer-name>
```

### Phase GOAL.md frontmatter

```
plan:     <slug>
status:   planning | planned | wip | done | blocked
depends:  — | <phase-number>
wave:     <number>
agent:    <implementer-name>
```

Phase status lifecycle: `planning` (stub, only CONTEXT.md) → `planned` (/plan-discuss finalized) → `wip` (/plan-run started) → `done` (/plan-run completed) — or `blocked` on CRITICAL finding.

---

## The happy path

```
1. /plans                                    see what's open, avoid duplicate slug
2. /plan <objective>                         planner drafts top-level + phase stubs
3. /plan-discuss <slug> phase-01             interactive Q&A, finalize phase 1
4. /plan-run <slug> phase-01                 execute phase 1 — implementer + auto reviewer
5. (commit phase 1 manually)                 use suggested command
6. /clear                                    fresh context window
7. /plan-discuss <slug> phase-02             finalize phase 2
8. /plan-run <slug> phase-02                 execute phase 2
9. ...repeat 5–8 until done
10. PLAN.md status: done                     orchestrator marks it
```

Two `/clear`s per phase (after finalize, after execute) is standard — context window is the bottleneck. Skip the inner `/clear` (between `/plan-discuss` and `/plan-run`) only when phase finalization was lightweight.

---

## Step-by-step

### 1. Create the plan — `/plan <objective>`

**Prompt shape:**
```
/plan <one-line objective>
  - Constraints: <reuse X / don't touch Y / deadlines>
  - Done when: <specific testable outcome>
```

**Good:**
```
/plan Users can reset their password via email link.
  - Reuse existing mailer service in src/services/mailer.py
  - Don't change auth schema unless necessary
  - Done when: integration test covers request → email → set-new-password round-trip
```

**Bad:**
```
/plan add password reset       ← no constraints, no done-criteria — planner will guess
```

**What happens:**
1. Orchestrator detects stack (lists `.claude/agents/`).
2. Dispatches `planner` (Opus) in bootstrap mode. Planner does silent discovery (reads codebase + rules + inbox), then asks **at most one** `AskUserQuestion` with ≤4 batched questions if gaps remain.
3. Planner emits:
   - Top-level `CONTEXT.md` + `GOAL.md` + `DISCUSSION.md` + `PLAN.md`
   - Per phase (multi-phase only): `phase-NN-<name>/CONTEXT.md` stub
4. Orchestrator scans top-level for production red flags (`TODO(prod)`, hardcoded env values, dev-only branches, anti-patterns). On hit → loops back to planner.
5. Presents top-level + opens approval gate.

**Approval gate options:**
- `Approve — start /plan-discuss on phase-01`
- `Refine top-level (/plan-discuss <slug>)`
- `Abort`

Plan mode session (`Shift+Tab` before `/plan`) upgrades first gate to `ExitPlanMode` native UI.

### 2. Finalize the phase — `/plan-discuss <slug> phase-NN`

**Required before `/plan-run` on any stub phase.** Phase folder from `/plan` has only `CONTEXT.md`; `/plan-run` halts until `GOAL.md` + `PLAN.md` exist.

```
/plan-discuss <slug> phase-01
```

**What happens:**
1. Validates phase folder exists with `CONTEXT.md`. Refuses re-discuss on `done`/`wip` phase without `--force`.
2. Reads bundle: phase `CONTEXT.md` + top-level `CONTEXT.md` + `GOAL.md` + `PLAN.md` + prior phase Summaries (done phases only) + project rules.
3. Dispatches `planner` (Opus) in interactive mode. Planner:
   - Runs silent discovery on the bundle
   - Calls `AskUserQuestion` with 1-4 batched questions per round
   - After user's answers, either proposes file content OR asks another round (max 4 rounds)
4. Orchestrator relays each round. At 4-round cap, prompts user: *"Continue / Propose now / Pause / Abort."*
5. When planner signals "enough context," returns proposed `GOAL.md` + `PLAN.md` + `DISCUSSION.md` content.
6. Orchestrator runs **red-flag scan** on proposed phase `PLAN.md` (same rules as top-level). Hit → loops back.
7. Presents proposed content to user:
   ```
   options:
     - "Approve — write files"
     - "Refine — another round"
     - "Refine a specific file (GOAL / PLAN / DISCUSSION)"
     - "Abort — discard"
   ```
8. On approve → writes `GOAL.md` + `PLAN.md` + `DISCUSSION.md` inside phase folder. Flips phase `GOAL.md` status `planning → planned`. Updates top-level `PLAN.md` phase table.
9. Exit banner suggests `/plan-run <slug> phase-NN`.

**Top-level iteration (no phase arg):** `/plan-discuss <slug>` iterates `CONTEXT.md` / `GOAL.md` / `DISCUSSION.md` / `PLAN.md` interactively — same Q&A loop scoped to the file(s) user picks.

### 3. Run the phase — `/plan-run <slug>`

```
/plan-run <slug>                 picks lowest-numbered todo phase with deps satisfied
/plan-run <slug> phase-NN        runs a specific phase
/plan-run <slug> --wave N        parallel-dispatches every phase in wave N (deps must be done)
/plan-run <slug> phase-NN --redo rerun a done phase (invalidates Summary)
```

**What happens:**
1. **Stub guard.** If target phase folder has no `PLAN.md` or `GOAL.md status: planning`, halts: *"Run /plan-discuss <slug> phase-NN first"* + exit.
2. **Dirty worktree check.** `git status --porcelain` — if non-plan-folder changes exist, halts and offers pre-generated commit suggestion (one-line conventional commit). Never auto-executes.
3. Marks target phase `status: wip` in top-level `PLAN.md` + phase `GOAL.md`.
4. Dispatches `<stack>-implementer` (Sonnet) with: phase `CONTEXT.md` + `GOAL.md` + `PLAN.md`, top-level `CONTEXT.md` + `GOAL.md`, production-readiness mandate, dependency anti-circumvention, **mid-phase discovery cap of 1 `AskUserQuestion` × 2 questions**.
5. If implementer hits cap → phase marked `blocked: "phase too large — needs refine"`, reviewers skipped, gate offers `/plan-discuss <slug> phase-NN` for split/refine.
6. **Auto-dispatches reviewers in parallel** (no user gate unless CRITICAL):
   - Always: `<stack>-reviewer`
   - + `database-reviewer` if schema/migration touched
   - + `infra-security-reviewer` if IaC touched
7. Appends `## Summary` to phase `PLAN.md`: `commits:`, `files touched:`, `deviations:`, `reviewer verdict:`, `suggested commit:`.
8. Sets phase `status: done` (or `blocked` on CRITICAL). Updates top-level phase table + phase `GOAL.md`.
9. Appends dated entry to `DISCUSSION.md` for any deviation.
10. Prints commit suggestion (one logical change = one commit).
11. Opens post-phase gate.

### 4. Commit the phase — manually

After every successful `/plan-run`, orchestrator prints:

```
Phase 02 done. Review diff, then commit:

  git diff
  git add src/services/mailer.py src/routes/password_reset.py
  git commit -m "feat: add password reset request endpoint"
```

**Rules** (enforced by suggestion generator + `rules/common/git-workflow.md`):
- One-line conventional commit. **No body. No footer. No `Co-Authored-By`.**
- Type derived from touched paths: `feat` for new code, `fix` for bug fixes, `refactor` for pure renames/moves, `test`/`docs`/`chore`/`perf`/`ci` for obvious cases.
- Lowercase after colon, no trailing period, ≤72 chars.
- **Never `git push`.** Push is your call.

**You** run the commit. Orchestrator never auto-commits — keeps you in the diff.

### 5. Post-phase gate — pick next move

```
question: "Phase 02 done. What next?"
options:
  - "Walk me through it (/explain <slug> phase-02)"
  - "Quiz me on it (/grill <slug> phase-02)"
  - "Next phase — fresh context (recommended): /clear then /plan-discuss <slug> phase-03"
  - "Next phase — same context (advanced)"
  - "Stop — I'll resume later"
```

The *"Commit the phase before picking Next phase"* reminder appears above — step 2 of next `/plan-run` halts on dirty worktree.

### 6. `/clear` between phases (default)

Why: each phase is self-contained. Plan folder bridges state across `/clear`:
- Top-level `CONTEXT.md` + `GOAL.md` — constraints + success criteria (static)
- Top-level `DISCUSSION.md` — decisions log (append-only)
- Top-level `PLAN.md` — phase table with status (live)
- Prior phase `PLAN.md ## Summary` — what prior phases shipped

What `/clear` loses: conversation history (replayable from plan folder).
What `/clear` wins: full context window for next `/plan-discuss` + implementer + reviewer.

**Skip `/clear` only when phases are tightly coupled** (reviewer comparing diffs live).

---

## Sibling commands

| Command | Purpose |
|---|---|
| `/plans` | List all plan folders + status (planning + execution progress). Use at session start. |
| `/plan-discuss <slug>` | Interactive Q&A to iterate top-level `CONTEXT` / `GOAL` / `DISCUSSION` / `PLAN`. |
| `/plan-discuss <slug> phase-NN` | Interactive Q&A to **finalize** a phase stub (writes GOAL / PLAN / DISCUSSION) or iterate a finalized phase. Required before `/plan-run` on stubs. |
| `/plan-run <slug>` | Execute next eligible phase (auto-picks). Halts on stub phase. |
| `/plan-run <slug> phase-NN` | Run specific phase. |
| `/plan-run <slug> --wave N` | Parallel-dispatch all phases in wave N. |
| `/explain <slug> [phase-NN]` | Code-explorer walkthrough scoped to phase's `files touched`. Cap 400 words. |
| `/grill <slug> [phase-NN]` | 3–4 quiz questions on the phase. Surfaces what you don't know. |
| `/do <objective>` | Fast path — skips planning. For 1–3 file tasks. No plan folder. |

Retired commands (replaced by `/plan-discuss`): `/plan-refine`, `/plan-phase`, `/plan-phase-refine`. All iteration now flows through `/plan-discuss`.

---

## Decision tree: which command?

```
Is this 1–3 files of well-understood work?
├── Yes → /do <objective>
└── No → /plan <objective>   (planner drafts top-level + phase stubs)
    ├── 1 phase → inline ## Steps in PLAN.md, no phase folder
    └── 2+ phases → folder per phase (CONTEXT.md stub only from /plan)
                    → /plan-discuss <slug> phase-NN to finalize each

Already have a plan? Want to adjust it?
├── Top-level stale (CONTEXT / GOAL / DISCUSSION / PLAN) → /plan-discuss <slug>
├── Phase never finalized (only CONTEXT.md) → /plan-discuss <slug> phase-NN
├── Phase finalized but needs adjustment → /plan-discuss <slug> phase-NN (iterate)
├── Phase already done, want to re-run → /plan-run <slug> phase-NN --redo
└── Just lost context → /plans, then /plan-discuss or /plan-run

Just finished a phase?
├── Want to verify what shipped → /explain <slug> phase-NN
├── Want to test your understanding → /grill <slug> phase-NN
└── Ready for next:
    ├── Commit first (use suggested command)
    ├── /clear
    └── /plan-discuss <slug> phase-(NN+1), then /plan-run
```

---

## Single-phase plans

When the planner produces 1 phase, it writes `## Steps` inline in `PLAN.md` and skips phase folders. The folder still exists (`CONTEXT` + `GOAL` + `DISCUSSION` + `PLAN`), but `/plan-run <slug>` runs the steps directly. Phase Summary lives at `PLAN.md ## Summary`.

`/plan-discuss <slug>` (no phase arg) still works for single-phase — iterates top-level files.

---

## Multi-phase parallel waves

Phases sharing the same `wave:` value with all deps satisfied can be parallel-dispatched:

```
| # | Title    | File                 | Depends | Status | Wave |
|---|----------|----------------------|---------|--------|------|
| 1 | Schema   | phase-01-schema/     | —       | done   | 1    |
| 2 | Mailer   | phase-02-mailer/     | 1       | planned| 2    |
| 3 | Endpoints| phase-03-endpoints/  | 1       | planned| 2    |
```

Phase 1 done, phases 2 + 3 both finalized (`planned`) → eligible for parallel:

```
/plan-run <slug> --wave 2
```

Orchestrator dispatches both implementers in a single message (parallel Task calls). Reviewers run after each completes. **All phases in wave must be finalized (non-stub) before dispatch.** Use only when truly independent — file overlap = serialize.

---

## Common situations

### CRITICAL reviewer finding

`/plan-run` halts before post-phase gate:

```
question: "Reviewer flagged CRITICAL issues. What next?"
options:
  - "Send findings back to implementer for a fix pass"
  - "Fix manually — I'll handle it"
  - "Accept risk and proceed to commit"
  - "Abort"
```

Phase stays `wip` (or `blocked` on abort). `PLAN.md` reflects truth.

### Phase turned out too big

Implementer hits mid-phase discovery cap (>1 `AskUserQuestion`, or >2 questions). Orchestrator marks phase `blocked: "phase too large — needs refine"`, skips reviewers, offers:

```
options:
  - "Refine via /plan-discuss <slug> phase-NN"
  - "Answer questions inline and proceed"
  - "Abort"
```

`/plan-discuss` is the right call most of the time — split the phase or refine the brief. Answer-inline only when questions are genuinely small and known.

### New constraint discovered mid-plan

Reviewer flagged design flaw, or you learned something the original plan didn't cover:

```
/plan-discuss <slug>            # iterate top-level — add constraint, restructure phase table if needed
/plan-discuss <slug> phase-NN   # iterate a specific phase's GOAL / PLAN
```

The interactive loop appends a dated entry to `DISCUSSION.md` automatically. Already-`done` phases never flip back to `todo` without `--force` + explicit confirmation.

### Resuming after a long break

```
/plans                              see status of every folder
/plan-discuss <slug> phase-NN       if next phase is a stub
/plan-run <slug>                    auto-picks next eligible
```

Plan folder is the source of truth. `/clear` history is irrelevant.

### Out-of-scope idea while planning

Append to `.claude/plans/_inbox.md` as single line. Next `/plan` reads inbox during silent discovery.

---

## Production-readiness mandate

Every plan must produce production-ready code on first pass. Enforced at multiple points:

1. **Planner instructions (bootstrap + interactive modes)** — appended verbatim by orchestrator.
2. **Pre-approval scans** — orchestrator greps top-level `PLAN.md` + phase `PLAN.md` (from `/plan-discuss`) for `TODO(prod)`, `FIXME(prod)`, `handle in prod later`, hardcoded URLs/keys, dev-only branches, anti-patterns. On hit → loops back to planner.
3. **Implementer instructions** — appended verbatim by `/plan-run`.

Plans must cover:
- env-driven config (no hardcoded per-env values)
- secrets via secret manager / env vars
- observability (logs / metrics / error reporting)
- migrations expand → backfill → contract
- rollout / rollback path
- timeouts + retries on external calls
- auth + input validation + least-privilege RBAC

Throwaway spike? Say so in objective — planner records trade-off in `DISCUSSION.md`, red-flag scan skipped.

---

## What `/plan` is *not* for

- **Single-line edits / typo fixes** — just edit.
- **One-file clarifications** — just ask.
- **Build/type errors only** — use `/build-fix` (calls stack-specific `build-error-resolver`).
- **Dead-code cleanup only** — use `/refactor-clean`.
- **Reviewing an existing diff** — use `/code-review`.

`/plan` shines when work spans >1 file and benefits from phase tracking that survives `/clear`.

---

## Cheat sheet

```
# Start of session
/plans                                  see what's open (planning + execution progress)

# New work
/plan <objective>                       create folder; top-level full, phase stubs only
/plan-discuss <slug> phase-01           interactive Q&A — finalize phase 1
/plan-run <slug> phase-01               run phase 1 (auto-reviewer)
<commit manually>                       one-line conventional, no body
/clear                                  free context window
/plan-discuss <slug> phase-02           finalize phase 2
/plan-run <slug> phase-02               run phase 2
...

# Mid-stream adjustments
/plan-discuss <slug>                    iterate top-level (CONTEXT/GOAL/DISCUSSION/PLAN)
/plan-discuss <slug> phase-02           iterate a phase (stub or finalized)

# After a phase
/explain <slug> phase-NN                walkthrough (≤400 words)
/grill <slug> phase-NN                  3–4 quiz questions

# Fast path (no plan folder)
/do <objective>                         1–3 files, well understood
```

---

## Related

- `commands/plan.md` — orchestrator full contract (top-level emit + phase stubs)
- `commands/plan-discuss.md` — interactive Q&A full contract (top-level + phase finalization)
- `commands/plan-run.md` — phase execution full contract (stub guard + phase brief sourcing)
- `commands/plans.md` — index command with planning + execution progress
- `commands/do.md` — fast path
- `commands/explain.md` / `commands/grill.md` — post-phase companions
- `agents/planner.md` — planner agent (Opus) full prompt (bootstrap + interactive modes)
- `rules/common/git-workflow.md` — commit format the suggestion generator follows
- `INTERNALS.md` — hooks, memory, safety guardrails

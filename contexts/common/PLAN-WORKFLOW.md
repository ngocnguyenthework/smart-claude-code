# Plan Workflow

End-to-end guide for the `/plan` system: from one-line objective to merged code, across multiple phases and `/clear` boundaries.

Pairs with:
- `commands/plan.md` — orchestrator contract (small + large mode)
- `commands/plan-phase.md` — per-phase deep-dive contract (large mode only)
- `commands/plan-phase-refine.md` — refine file inside phase folder (large mode only)
- `commands/plan-refine.md` — refine top-level files or flat phase file
- `commands/plan-run.md` — phase execution contract
- `agents/planner.md` — planner agent contract
- `INTERNALS.md` — hooks / memory / safety

---

## Mental model

**Small plan** (≤3 phases, flat):
```
/plan  ──►  planner (Opus)  ──►  PLAN folder        (you confirm)
                                       │
                                       ▼
/plan-run ──► implementer (Sonnet) ──► reviewers ──► commit suggestion
                                                          │
                                       ┌──────────────────┘
                                       ▼
                              /clear  →  /plan-run next phase
```

**Large plan** (>3 phases AND user picked Large at size gate):
```
/plan  ──►  planner (Opus)  ──►  PLAN folder + phase folders with GOAL.md stubs
                                       │
                                       ▼
       (loop per phase)
/plan-phase <slug> phase-NN  ──►  planner (Opus)  ──►  fills phase folder (CONTEXT + PLAN + DISCUSSION)
                                       │
                                       ▼
/plan-run <slug> phase-NN  ──►  implementer (Sonnet) ──► reviewers ──► commit suggestion
                                       │
                              /clear  →  /plan-phase next phase (or /plan-run if already planned)
```

Three guarantees:
1. **You confirm every hand-off.** Planner → implementer → reviewer all gate on `AskUserQuestion`.
2. **Plan folder bridges `/clear`.** Conversation resets; plan state persists.
3. **Each phase is self-contained.** Fresh implementer reads only top-level `CONTEXT.md` + the phase brief (flat file OR folder's `PLAN.md` + `GOAL.md` + `CONTEXT.md`) + project rules.

---

## File anatomy

Every plan is a folder under `.claude/plans/<slug>/`. Phase storage has two shapes:

### Small mode (≤3 phases, or >3 phases + user picked "Small")

```
.claude/plans/<slug>/
├── CONTEXT.md            why + constraints + existing code refs    (static)
├── DISCUSSION.md         decisions / trade-offs / Q&A              (append-only)
├── PLAN.md               status + acceptance + phase table         (live)
├── phase-01-<name>.md    one phase brief                           (only when 3 phases)
├── phase-02-<name>.md
└── phase-03-<name>.md
```

### Large mode (>3 phases AND user picked "Large" at the size gate)

```
.claude/plans/<slug>/
├── CONTEXT.md                         top-level constraints            (static)
├── DISCUSSION.md                      top-level decisions log          (append-only)
├── PLAN.md                            phase table (File column points to folders)
├── phase-01-<name>/
│   ├── GOAL.md                        stub: goal + acceptance + deps   (written by /plan)
│   ├── CONTEXT.md                     phase-scoped                     (written by /plan-phase)
│   ├── PLAN.md                        implementer brief + Summary      (written by /plan-phase; Summary appended by /plan-run)
│   └── DISCUSSION.md                  phase-scoped log                 (written by /plan-phase, appended to)
├── phase-02-<name>/
│   └── ...
└── phase-NN-<name>/
```

Plus `.claude/plans/_inbox.md` — flat scratchpad for ideas not yet planned.

### Shape decision

| Phases in plan | User gate? | Shape |
|---|---|---|
| 1–2 | No | Inline `PLAN.md ## Steps`, no phase files |
| 3 | No | Flat `phase-NN-<name>.md` files |
| >3 | **Yes** — planner asks Large vs Small | Large = folder-per-phase · Small = flat files |

Why the gate: 4+ phases could be genuinely large (touches many modules, each phase needs own discovery budget) or could be a well-understood sequence of small diffs. User decides which shape fits.

### PLAN.md frontmatter

```
slug:    <kebab>           e.g. add-password-reset
status:  planning | in-progress | done | blocked
created: YYYY-MM-DD
stack:   fastapi | nestjs | frontend | devops
agent:   <implementer-name>
```

### Phase status (in PLAN.md table)

`todo` → `wip` → `done`  (or `blocked` on CRITICAL reviewer finding)

---

## The happy path

### Small mode (multi-phase, flat files)

```
1. /plans                       see what's open, avoid duplicate slug
2. /plan <objective>            planner drafts folder + flat phase files, you approve
3. /plan-run <slug>             phase 1 — implementer + auto reviewer
4. (commit phase 1 manually)    use suggested command
5. /clear                       fresh context window
6. /plan-run <slug>             phase 2 — auto-picks next eligible
7. (commit phase 2 manually)
8. ...repeat 5–7 until done
9. PLAN.md status: done         orchestrator marks it
```

Steps 5–7 repeat per phase. Plan folder persists across every `/clear`.

### Large mode (folder-per-phase, two-pass planning)

```
1. /plans                                    see what's open
2. /plan <objective>                         planner drafts folder + GOAL.md stubs per phase
   └── size gate: "5 phases — Large or Small?" → user picks Large
3. /plan-phase <slug> phase-01               deep-dive phase 1 — fills its CONTEXT / PLAN / DISCUSSION
4. /plan-run <slug> phase-01                 execute phase 1 — implementer + auto reviewer
5. (commit phase 1 manually)
6. /clear                                    fresh context window
7. /plan-phase <slug> phase-02               deep-dive phase 2
8. /plan-run <slug> phase-02                 execute phase 2
9. ...repeat 6–8 until done
```

Optional: run `/plan-phase` for multiple phases back-to-back before any execution (e.g., review full design before writing code). Phase folders cache the deep-dive so you can read + refine before committing to code.

Two `/clear`s per phase in large mode is OK — context window is the bottleneck. Skip the inner one (`/clear` between `/plan-phase` and `/plan-run`) only when phase planning was lightweight.

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
2. Dispatches `planner` agent (Opus). Planner does silent discovery first (reads codebase + rules + inbox), then asks **at most one** `AskUserQuestion` call with ≤4 batched questions if gaps remain.
3. **Size classification gate** — if planner estimates >3 phases, calls `AskUserQuestion` offering Large (folder-per-phase) vs Small (flat files). 1-2 phases auto-inline, 3 phases auto-flat — no gate.
4. Planner emits the folder:
   - **Small mode**: `CONTEXT.md` + `DISCUSSION.md` + `PLAN.md` + (when 3 phases) flat `phase-NN-<name>.md` files.
   - **Large mode**: `CONTEXT.md` + `DISCUSSION.md` + `PLAN.md` + `phase-NN-<name>/GOAL.md` **stubs** (no inner PLAN/CONTEXT yet — filled later by `/plan-phase`).
5. Orchestrator scans for production red flags (`TODO(prod)`, hardcoded env values, dev-only branches). On any hit → loops back to planner.
6. Presents plan + opens approval gate.

**Approval gate options:**
- `Proceed with <primary-agent>` — go to phase 1
- `Use different agent` — pick from planner's alternatives
- `Modify plan` — describe change, planner re-runs
- `Abort`

If session is in plan mode (`Shift+Tab` before `/plan`), the gate upgrades to native `ExitPlanMode` UI with five approval modes.

### 1a. Deep-dive a phase (large mode only) — `/plan-phase <slug> phase-NN`

Skip this step if your plan is small mode — `/plan-run` runs directly off the flat phase file.

In large mode, each phase folder starts with only `GOAL.md` (a narrow stub). `/plan-run` halts on a stub folder with a "run /plan-phase first" prompt. To fill the folder:

```
/plan-phase <slug> phase-NN
```

**What happens:**
1. Validates folder shape + refuses re-plan if `PLAN.md` already exists with `status != planning` (unless `--redo`).
2. Dispatches `planner` (Opus) scoped to **one phase**, with:
   - Phase's `GOAL.md` (acceptance + deps — **fixed**, not re-planned here)
   - Top-level `CONTEXT.md` + `PLAN.md` (phase table for sibling awareness)
   - Prior phases' `Summary` blocks (so phase 3's planner knows what phases 1 + 2 shipped)
   - Project rules
3. Planner does **phase-scoped** silent discovery → optional ≤4-question batch (scoped to *how*, not *what* — goal is fixed).
4. Emits `CONTEXT.md` + `PLAN.md` + `DISCUSSION.md` inside phase folder. `PLAN.md` is the full implementer brief (steps, files touched, prod checklist, verify, done-when).
5. Flips `GOAL.md` status: `planning → planned`. Updates top-level `PLAN.md` phase-table status: `todo → planned`.
6. Presents phase PLAN.md + approval gate (`Approve` / `Refine` / `Split` / `Abort`).

**Refining a phase before running it:**

```
/plan-phase-refine <slug> phase-NN              # refine inner PLAN.md (default)
/plan-phase-refine <slug> phase-NN GOAL         # refine goal/acceptance (requires PLAN re-align after)
/plan-phase-refine <slug> phase-NN CONTEXT      # add a missed constraint or reusable utility
/plan-phase-refine <slug> phase-NN DISCUSSION   # cleanup decisions log
```

**Why two-pass planning**: A 5-phase plan deep-planned in one shot would need the Opus context window to hold 5 phase briefs + full codebase exploration simultaneously, plus 15+ questions for the user. Splitting the planning in two (decomposition by `/plan`, deep-dive by `/plan-phase`) keeps each pass small. Bonus: you can `/clear` between phases' deep-dives, so each phase gets a fresh context window.

### 2. Run the next phase — `/plan-run <slug>`

```
/plan-run <slug>            picks lowest-numbered todo phase with deps satisfied
/plan-run <slug> phase-NN   runs a specific phase
/plan-run <slug> --wave N   parallel-dispatches every phase in wave N (deps must be done)
```

**What happens:**
1. **Dirty worktree check.** `git status --porcelain` — if any non-plan-folder changes exist, halts and offers a pre-generated commit suggestion (one-line conventional commit). Never auto-executes — prints the command for you to run.
2. Marks target phase `status: wip` in PLAN.md table.
3. Dispatches `<stack>-implementer` (Sonnet) with: phase brief, `CONTEXT.md`, production-readiness mandate, **mid-phase discovery cap of 1 `AskUserQuestion` × 2 questions**.
4. If implementer hits cap → phase marked `blocked` ("phase too large — needs split"), reviewers skipped, gate offers `/plan-refine`.
5. **Auto-dispatches reviewers in parallel** (no user gate unless CRITICAL):
   - Always: `<stack>-reviewer`
   - + `database-reviewer` if schema/migration touched
   - + `infra-security-reviewer` if IaC touched
6. Appends `## Summary` to the phase file: `commits:`, `files touched:`, `deviations:`, `reviewer verdict:`.
7. Sets phase `status: done` (or `blocked` on CRITICAL).
8. Appends a dated entry to `DISCUSSION.md` for any deviation worth preserving.
9. Generates and prints commit suggestion (one logical change = one commit).
10. Opens post-phase gate.

### 3. Commit the phase — manually

After every successful `/plan-run`, the orchestrator prints something like:

```
Phase 02 done. Review diff, then commit:

  git diff
  git add src/services/mailer.py src/routes/password_reset.py
  git commit -m "feat: add password reset request endpoint"
```

**Rules** (enforced by the suggestion generator and `rules/common/git-workflow.md`):
- One-line conventional commit. **No body. No footer. No `Co-Authored-By`.**
- Type derived from touched paths: `feat` for new code, `fix` for bug fixes, `refactor` for pure renames/moves, `test`/`docs`/`chore`/`perf`/`ci` for the obvious cases.
- Lowercase after colon, no trailing period, ≤72 chars.
- **Never `git push`.** Push is the user's call.

**You** run the commit. Orchestrator never auto-commits — keeps you in the diff.

### 4. Post-phase gate — pick next move

```
question: "Phase 02 done. What next?"
options:
  - "Walk me through it (/explain <slug> phase-02)"
  - "Quiz me on it (/grill <slug> phase-02)"
  - "Next phase — fresh context (recommended): /clear then /plan-run <slug>"
  - "Next phase — same context (advanced)"
  - "Stop — I'll resume later"
```

The "Commit the phase before picking Next phase" reminder appears above this question — step 1a of the next `/plan-run` halts on a dirty worktree.

### 5. `/clear` between phases (default)

Why: each phase file is self-contained. Plan folder bridges state across `/clear`:
- `CONTEXT.md` — constraints (static)
- `DISCUSSION.md` — decisions log (append-only)
- `PLAN.md` — phase table with status (live)
- `phase-NN-*.md ## Summary` — what prior phases shipped

What `/clear` loses: conversation history (replayable from plan folder).
What `/clear` wins: full context window for the next implementer + reviewer pass.

**Skip `/clear` only when phases are tightly coupled** (e.g., reviewer wants to compare diffs across two phases live).

---

## Sibling commands

| Command | Purpose |
|---|---|
| `/plans` | List all plan folders + status (planning and execution progress). Use at session start. |
| `/plan-refine <slug>` | Re-dispatch planner against top-level PLAN.md (default), CONTEXT, DISCUSSION, or a flat phase file. Delegates to `/plan-phase-refine` for large-mode phase folders. |
| `/plan-phase <slug> phase-NN` | **Large mode only.** Deep-dive planner for one phase — fills inner CONTEXT / PLAN / DISCUSSION. |
| `/plan-phase-refine <slug> phase-NN [GOAL\|CONTEXT\|PLAN\|DISCUSSION]` | **Large mode only.** Refine one file inside a phase folder. |
| `/plan-run <slug>` | Execute next eligible phase (auto-picks). Halts on stub large-mode folder. |
| `/plan-run <slug> phase-NN` | Run a specific phase. |
| `/plan-run <slug> --wave N` | Parallel-dispatch all phases in wave N. |
| `/explain <slug> [phase-NN]` | Code-explorer walkthrough scoped to phase's `files touched`. Cap 400 words. |
| `/grill <slug> [phase-NN]` | 3–4 quiz questions on the phase. Surfaces what you don't know. |
| `/do <objective>` | Fast path — skips planning. For 1–3 file tasks. No plan folder. |

---

## Decision tree: which command?

```
Is this 1–3 files of well-understood work?
├── Yes → /do <objective>
└── No → /plan <objective>   (planner decides shape)
    ├── 1–2 phases → inline ## Steps in PLAN.md
    ├── 3 phases → flat phase-NN-*.md files
    └── >3 phases → planner asks Large or Small
        ├── Small → flat files (plan everything now)
        └── Large → phase folders with GOAL.md stubs
                    → /plan-phase <slug> phase-NN to deep-plan each

Already have a plan? Want to adjust it?
├── Top-level stale → /plan-refine <slug>
├── Flat phase file wrong → /plan-refine <slug> phase-NN
├── Phase folder wrong (large) → /plan-phase-refine <slug> phase-NN [GOAL|CONTEXT|PLAN|DISCUSSION]
├── Phase folder never deep-planned → /plan-phase <slug> phase-NN
└── Just lost context → /plans, then /plan-run <slug>

Just finished a phase?
├── Want to verify what shipped → /explain <slug> phase-NN
├── Want to test your understanding → /grill <slug> phase-NN
└── Ready for next:
    ├── Small mode → commit, /clear, /plan-run <slug>
    └── Large mode → commit, /clear, /plan-phase <slug> phase-(NN+1), then /plan-run
```

---

## Single-phase plans

When the planner produces <3 phases, it writes steps inline in `PLAN.md ## Steps` and skips phase files. The folder still exists (CONTEXT + DISCUSSION + PLAN), but `/plan-run <slug>` runs the steps directly. The phase Summary lives at `PLAN.md ## Summary` instead of a phase file.

---

## Multi-phase parallel waves

Phases sharing the same `wave:` value with all deps satisfied can be parallel-dispatched:

```
| # | Title    | File                  | Depends | Status | Wave |
|---|----------|-----------------------|---------|--------|------|
| 1 | Schema   | phase-01-schema.md    | —       | done   | 1    |
| 2 | Mailer   | phase-02-mailer.md    | 1       | todo   | 2    |
| 3 | Endpoints| phase-03-endpoints.md | 1       | todo   | 2    |
```

Phase 1 done → phases 2 and 3 are eligible. Run with:

```
/plan-run <slug> --wave 2
```

Orchestrator dispatches both implementers in a single message (parallel Task calls). Reviewers run after each completes. Use only when phases are truly independent — file overlap = serialize.

---

## Common situations

### CRITICAL reviewer finding

`/plan-run` halts before the post-phase gate and asks:

```
question: "Reviewer flagged CRITICAL issues. What next?"
options:
  - "Send findings back to implementer for a fix pass"
  - "Fix manually — I'll handle it"
  - "Accept risk and proceed to commit"
  - "Abort"
```

Phase status stays `wip` (or moves to `blocked` if you abort). PLAN.md reflects truth.

### Phase turned out too big

Implementer hits the mid-phase discovery cap (>1 `AskUserQuestion` call, or >2 questions). Orchestrator marks phase `blocked: "phase too large — needs split"`, skips reviewers, and offers:

```
options:
  - "Split phase via /plan-refine <slug> phase-NN"
  - "Answer questions inline and proceed"
  - "Abort"
```

Splitting is the right call most of the time. Answer-inline only when the questions are genuinely small and known.

### New constraint discovered mid-plan

Reviewer flagged a design flaw, or you learned something the original plan didn't cover:

```
/plan-refine <slug>            # rewrite PLAN.md with the new constraint
/plan-refine <slug> CONTEXT    # add the constraint to CONTEXT.md
```

The refine command appends a dated entry to `DISCUSSION.md` automatically. Already-`done` phases never flip back to `todo` without explicit user confirmation.

### Resuming after a long break

```
/plans                  # see status of every folder
/plan-run <slug>        # auto-picks next eligible phase
```

Plan folder is the source of truth. `/clear` history is irrelevant.

### Out-of-scope idea while planning

Append to `.claude/plans/_inbox.md` as a single line. The next `/plan` invocation reads inbox during silent discovery and may incorporate or reference it.

---

## Production-readiness mandate

Every plan must produce production-ready code on the first pass. The orchestrator enforces this at three points:

1. **Planner instructions** — appended verbatim by the orchestrator.
2. **Pre-approval scan** — orchestrator greps the plan body for `TODO(prod)`, `FIXME(prod)`, `handle in prod later`, hardcoded URLs/keys, dev-only branches with no prod counterpart. On hit → loops back to planner with red flags quoted.
3. **Implementer instructions** — appended verbatim by the orchestrator.

Plans must cover:
- env-driven config (no hardcoded per-env values)
- secrets via secret manager / env vars
- observability (logs / metrics / error reporting)
- migrations expand → backfill → contract
- rollout / rollback path
- timeouts + retries on external calls
- auth + input validation + least-privilege RBAC

Throwaway spike? Say so explicitly in the objective — planner records the trade-off in `DISCUSSION.md` and the red-flag scan is skipped.

---

## What `/plan` is *not* for

- **Single-line edits / typo fixes** — just edit.
- **One-file clarifications** — just ask.
- **Build/type errors only** — use `/build-fix` (calls stack-specific `build-error-resolver`).
- **Dead-code cleanup only** — use `/refactor-clean`.
- **Reviewing an existing diff** — use `/code-review`.

`/plan` shines when work spans >1 file and benefits from phase tracking that survives a `/clear`.

---

## Cheat sheet

```
# Start of session
/plans                              see what's open (planning + execution progress)

# New work — small (≤3 phases, or user picked Small)
/plan <objective>                   create folder, get approval
/plan-run <slug>                    run phase 1 (auto-reviewer)
<commit manually>                   one-line conventional, no body
/clear                              free context window
/plan-run <slug>                    run phase 2
...

# New work — large (>3 phases, user picked Large)
/plan <objective>                   planner emits folder + GOAL.md stubs
/plan-phase <slug> phase-01         deep-dive plan for phase 1
/plan-run <slug> phase-01           run phase 1 (auto-reviewer)
<commit manually>
/clear                              free context window
/plan-phase <slug> phase-02         deep-dive plan for phase 2
/plan-run <slug> phase-02           run phase 2
...

# Mid-stream adjustments — small
/plan-refine <slug>                 revise top-level PLAN.md
/plan-refine <slug> phase-02        revise one flat phase file
/plan-refine <slug> CONTEXT         add a constraint

# Mid-stream adjustments — large
/plan-refine <slug>                 revise top-level PLAN.md (phase table)
/plan-phase-refine <slug> phase-02         revise phase 2's inner PLAN.md
/plan-phase-refine <slug> phase-02 GOAL    revise phase 2's goal/acceptance
/plan-phase-refine <slug> phase-02 CONTEXT revise phase 2's constraints

# After a phase (both modes)
/explain <slug> phase-NN            walkthrough (≤400 words)
/grill <slug> phase-NN              3–4 quiz questions

# Fast path (no plan folder)
/do <objective>                     1–3 files, well understood
```

---

## Related

- `commands/plan.md` — orchestrator full contract (size gate + small/large shapes)
- `commands/plan-phase.md` — per-phase deep-dive (large mode)
- `commands/plan-phase-refine.md` — refine inside phase folder (large mode)
- `commands/plan-run.md` — phase execution full contract (stub guard + phase brief sourcing)
- `commands/plan-refine.md` — top-level refinement + flat phase file refinement
- `commands/plans.md` — index command with planning + execution progress
- `commands/do.md` — fast path
- `commands/explain.md` / `commands/grill.md` — post-phase companions
- `agents/planner.md` — planner agent (Opus) full prompt with size-classification step
- `rules/common/git-workflow.md` — commit format the suggestion generator follows
- `INTERNALS.md` — hooks, memory, safety guardrails

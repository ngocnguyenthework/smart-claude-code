---
description: Execute the next (or a specified) phase of a plan. Dispatches the stack implementer and automatically runs the matching reviewer(s) afterward. Halts on stub phases — requires /plan-discuss first.
---

# /plan-run — Execute a phase

Dispatches the stack implementer for one phase, then **automatically** runs matching reviewer(s). Updates `PLAN.md` phase-table status + appends `## Summary` to the phase's `PLAN.md` (or to top-level `PLAN.md ## Summary` for single-phase plans).

## Usage

```
/plan-run <plan>                 # picks next phase with status=todo, respecting depends:
/plan-run <plan> phase-NN        # runs specific phase
/plan-run <plan> --wave N        # runs all phases in wave N in parallel (deps must be done)
/plan-run <plan> phase-NN --redo # re-run a done phase (invalidates its Summary)
```

`<plan>` accepts: full `NN-slug` (`03-add-password-reset`), bare `NN` shortcut (`03` or `3`), or bare slug suffix (`add-password-reset`). Resolution per `plan.md ## Slug resolution`. All status writes / banners use the full resolved `NN-slug`.

## Behavior

### 1. Read `PLAN.md`

- `## Phases` table present → multi-phase plan. Pick target:
  - User-specified → use it. Refuse status=done unless `--redo`.
  - Else → lowest `#` with `status: todo` / `planned` and all `depends:` done.
- `## Steps` only (no phase table) → single-phase. Run steps inline, no phase folder.

### 1a. Stub guard (multi-phase only — CRITICAL)

Resolve `<plan>` per `plan.md ## Slug resolution` first. For the target phase folder, check:
- Phase folder exists at `.claude/plans/<NN-slug>/phase-NN-*/`.
- Phase `GOAL.md` exists and has `status: planned` (or `wip` / `done` for re-runs).
- Phase `PLAN.md` exists inside folder.

If **any** of these fail (phase is a stub — only `CONTEXT.md` written), halt before any dispatch:

```
question: "Phase <NN> is a stub — not yet finalized. What next?"
options:
  - "Run /plan-discuss <slug> phase-NN first"  (Recommended)
  - "Abort"
```

On **Run /plan-discuss** → print the exact command for user to invoke; exit. (Cannot chain slash commands programmatically.) Re-invoke `/plan-run` after `/plan-discuss` completes.
On **Abort** → exit.

### 1b. Dirty worktree check (before dispatch)

Run `git status --porcelain`.
- Ignore `.claude/plans/<slug>/**` entries (plan folder writes expected).
- If any other tracked/untracked changes remain, halt:

```
question: "Uncommitted changes detected from prior work. Commit first?"
options:
  - label: "Show suggested commit command"   (Recommended)
    description: "<type>: <one-line summary derived from `git diff --stat` + changed paths>"
  - label: "Proceed anyway"
    description: "Run phase with dirty worktree (NOT recommended — mixes prior changes into phase diff)"
  - label: "Abort"
    description: "Exit so I can clean up manually"
```

On **Show suggested commit command** → print, do NOT execute:
```
Review diff first:
  git diff
  git status

Then stage and commit (one line, no body):
  git add <paths>
  git commit -m "<type>: <summary>"
```

Derive `<type>` from changed paths (`test/` → `test`, `docs/` or `*.md` → `docs`, `*.tf`/`manifests/` → `chore`, source → `feat`/`fix`, rename/move → `refactor`). Summary ≤72 chars, lowercase after colon, no trailing period. **Never add body, footer, or `Co-Authored-By`** (see `.claude/rules/common/git-workflow.md`). Exit — user commits manually, re-invokes `/plan-run <slug>`.

On **Proceed anyway** → continue to step 2. Append note to phase's `DISCUSSION.md`: *"Phase <NN> started with dirty worktree — prior uncommitted changes mixed in."*
On **Abort** → exit.

### 2. Read context bundle

- Top-level `CONTEXT.md` + `GOAL.md` (background)
- Phase's `CONTEXT.md` + `GOAL.md` + `PLAN.md` (implementer brief — multi-phase)
- Single-phase: top-level `PLAN.md ## Steps`

### 3. Mark phase wip

Set target phase `status: wip` in top-level `PLAN.md` phase table AND in phase `GOAL.md` frontmatter.

### 3a. Pre-implementer recon (parallel subagent fan-out, after /clear)

After `/clear` the session lost conversation context. Phase `PLAN.md` has the steps, but implementer benefits from a fresh architecture map + current-docs refresh. Main session fans out in a single message, parallel `Task` calls (only what applies):

- `code-explorer` — when phase touches existing code beyond files named in PLAN.md `## Changes`. Brief: *"For <slug> phase <NN>: trace call graph around <files touched>. Confirm patterns still current, flag drift from plan assumptions."* Skip if PLAN.md `## Changes` lists exact new-file-creation only.
- `docs-lookup` — when phase `## Dependencies` added a new package OR PLAN.md Steps reference specific library APIs. Brief: *"Fetch current docs for: <package + API>. Return canonical usage pattern."*

**Skip entirely when:** phase is brand-new-files-only scaffold with no existing-code touch + no new deps. Otherwise run.

Pass findings into implementer brief at step 4 under **Recon findings** heading so implementer skips redundant Read/Grep.

### 4. Dispatch implementer

Detect stack (list `.claude/agents/`). Dispatch matching `<stack>-implementer` via Task, with:
- **Recon findings** (from step 3a, or "skipped — scaffold-only phase")
- **Phase brief:**
  - Multi-phase → full `phase-NN-*/PLAN.md` + `GOAL.md` + `CONTEXT.md`
  - Single-phase → top-level `PLAN.md ## Steps` inline
- Top-level `CONTEXT.md` + `GOAL.md` content
- Production-readiness mandate (see below)
- Dependency anti-circumvention line (see below)
- Phase-discovery cap: *"You may ask at most ONE `AskUserQuestion` call with ≤2 questions mid-phase. If more are needed, the phase is mis-sized — stop, report back, orchestrator routes to `/plan-discuss <slug> phase-NN` to split or refine."*

**Production-readiness line (verbatim):**
> "Do not introduce `TODO(prod)` markers, hardcoded env values, or dev-only branches without prod counterpart. Load env values via config layer. Avoid anti-patterns in `.claude/rules/common/production-readiness.md` — use correct designs from `.claude/skills/production-patterns/SKILL.md`. If any step ambiguous about prod behavior, stop and ask."

**Dependency anti-circumvention line (verbatim):**
> "Top-level `PLAN.md ## Dependencies` is the exhaustive list of packages you may install at the exact pinned versions shown. Do NOT silently `npm install` / `pip install` / `go get` anything else. If you need a package not listed, STOP, run the dependency-approval workflow from `.claude/rules/common/dependency-approval.md` + `.claude/skills/dependency-selection/SKILL.md`, and surface a fresh `AskUserQuestion` before installing."

If implementer hits discovery cap:
- Mark `status: blocked` in `PLAN.md` + `GOAL.md` with reason *"phase too large — needs refine"*
- Skip reviewers
- `AskUserQuestion`: `Refine via /plan-discuss <slug> phase-NN` · `Answer inline and proceed` · `Abort`

### 5. Auto-dispatch reviewers (parallel, no user gate unless CRITICAL)

- Always: `<stack>-reviewer`
- If schema / migration touched: `+ database-reviewer`
- If IaC touched: `+ infra-security-reviewer`

### 6. Gather verdicts + append Summary

Append `## Summary` block to the phase brief:
- Multi-phase → append to `phase-NN-*/PLAN.md` (same file implementer executed against). **Do NOT write Summary into `GOAL.md`** — GOAL stable across refines.
- Single-phase → append to top-level `PLAN.md ## Summary`.

Summary schema (ALL fields required — this is the whole-picture record future sessions read after `/clear`):

```markdown
## Summary
**State:** implementation  (planning for /plan, finalization for /plan-discuss, implementation here)
**Date:** YYYY-MM-DD
**What just happened:** <2-3 sentences — what implementer built, what reviewers found, what shipped>
**Whole picture:**
- Fits top-level goal: <one-line link to GOAL.md Done-when>
- Prior phases: <list done phase titles, or "—">
- Next phases unblocked: <from phase table, or "—">
- Plan progress: <X of Y phases done>

### System workflow (post-execution — reflects actual files shipped)
<!-- Re-render or refine the phase PLAN.md `## System workflow` diagram with ACTUAL file paths + function names introduced/modified this phase. If implementation deviated from plan diagram, update here — not in PLAN.md steps. -->
```
[paste updated ASCII diagram]
```

**Files touched:** <list with brief role per file>
**Commits:** <git log --oneline since phase start>
**Deviations from plan:** <what diverged + why; "none" if clean>
**Reviewer verdict:**
- `<stack>-reviewer`: <approve / warnings / CRITICAL — summary>
- `database-reviewer`: <...> (if schema touched)
- `infra-security-reviewer`: <...> (if IaC touched)

**Suggested commit:** `<type>: <summary>`  (see step 9a)
**Next:** `/plan-run <slug> phase-<NN+1>`  (or "plan complete")
```

### 7. Update status

- Top-level `PLAN.md` phase table: `Status: done` (or `blocked` on CRITICAL).
- Phase's `GOAL.md` frontmatter: matching status.

### 8. Append DISCUSSION entries

- Top-level `DISCUSSION.md` for any deviation / reviewer finding crossing phase boundaries.
- Phase's `DISCUSSION.md` for phase-scoped decisions (visible to future `/plan-discuss <slug> phase-NN`).

### 9. CRITICAL gate

On CRITICAL reviewer finding:
```
question: "Reviewer flagged CRITICAL. Next?"
options:
  - "Send findings back to implementer for fix pass"
  - "Fix manually"
  - "Accept risk and proceed to commit"
  - "Abort"
```

### 9a. Commit suggestion (user runs manually — never auto-executed)

Skip on CRITICAL / `blocked`. Generate one-line conventional commit:

```
Phase <NN> done. Review diff, then commit:

  git diff
  git add <files from phase Summary>
  git commit -m "<type>: <summary>"
```

Rules (enforce `.claude/rules/common/git-workflow.md`):
- **Type:** `feat` (new endpoint/feature/module) · `fix` (bug) · `refactor` (rename/move, no behavior change) · `test` (tests only) · `docs` (*.md only) · `chore` (*.tf, manifests/, CI, deps, linter) · `perf` · `ci`
- **Summary:** phase title reshaped, lowercase after colon, imperative, ≤72 chars, no trailing period.
- **One line only.** No body. No bullet list. No `Co-Authored-By`.
- **Never run `git push`.** Staging + committing is the endpoint.
- Multiple unrelated concerns in one phase → print TWO commit suggestions + *"Stage each group separately."*

Append suggested commit line to phase `## Summary` under `suggested commit:` key. Next `/plan-run`'s step 1b dirty-worktree check auto-detects if user skipped committing.

### 10. Post-phase gate (skip on CRITICAL / blocked)

**First, print the whole-picture summary to user** (so they see outcome without opening the plan folder):

```
═══ Phase <NN> shipped: <slug> ═══
<paste `## Summary` block just written to phase PLAN.md — What just happened, Whole picture, System workflow diagram, Files, Commits, Deviations, Reviewer verdicts>
```

Prepend reminder: *"Commit the phase (see command above) before Next phase — step 1b of next `/plan-run` halts on dirty worktree."*

```
question: "Phase <NN> done. What next?"
options:
  - "Walk me through it (/explain <slug> phase-NN)"
  - "Quiz me on it (/grill <slug> phase-NN)"
  - "Next phase — fresh context (recommended): /clear then /plan-discuss <slug> phase-<NN+1>"   # if more todo
  - "Next phase — same context (advanced)"                                                      # if more todo
  - "Stop — I'll resume later"
```

- `/explain` or `/grill` → invoke inline, re-prompt same gate.
- **Fresh context (default)** → print handoff banner (use bare `NN` plan shortcut for terseness — extract leading digits from resolved `<NN-slug>`):
  ```
  Phase <NN> done. To start phase <NN+1>:
    1. /clear                                    ← frees context window
    2. /plan-discuss <plan-NN> phase-<NN+1>      ← finalize next phase (if stub)
    3. /plan-run <plan-NN> phase-<NN+1>          ← execute
  Plan state in .claude/plans/<NN-slug>/ persists across /clear.
  ```
  Exit.
- **Same context** → loop back to step 1 (pick next eligible phase). Skip `/plan-discuss` invocation if next phase already finalized; otherwise prompt user to run it manually.
- **Stop** → exit with status banner naming next phase slug.

### 11. Plan complete

If no `todo` phases remain, replace both "Next phase" options with `"Plan complete — close it"` (sets top-level `PLAN.md status: done`, no `/clear` suggestion).

## Why /clear between phases (default)

Each phase is **self-contained** by design — a fresh implementer reading only phase `CONTEXT.md` + `GOAL.md` + `PLAN.md` + top-level `CONTEXT.md` + `GOAL.md` + project rules has everything needed. Plan folder bridges state across `/clear`:

- Top-level `CONTEXT.md` / `GOAL.md` — constraints + success criteria (static)
- Top-level `DISCUSSION.md` — decisions log (append-only)
- Top-level `PLAN.md` — phase table with status (always current)
- Prior phase `PLAN.md ## Summary` — what prior phases shipped

Only loss from `/clear`: conversation history — replayable from the plan folder. Win: full context window for next `/plan-discuss` + implementer + reviewer. Skip `/clear` only when phases tightly coupled (reviewer comparing diffs across phases live).

## Multi-phase flow (per phase)

```
/plan-discuss 03 phase-NN               # finalize phase (NN shortcut for plan ID; interactive — writes GOAL/PLAN/DISCUSSION)
(review phase PLAN.md, another /plan-discuss round if needed)
/clear                                  # fresh context for execution
/plan-run 03 phase-NN                   # execute; halts with stub guard if PLAN.md missing
<commit manually>
/clear
/plan-discuss 03 phase-(NN+1)           # finalize next phase
...
```

Two `/clear`s per phase (after finalize, after execution). Skip first `/clear` if finalization discussion was lightweight + context still small.

## Parallel waves

Phases sharing `wave:` with satisfied deps can dispatch in parallel (independent implementers, single message with multiple Task calls). All phases in the wave must be finalized (non-stub) before dispatch.

## Related

- `/plan <objective>` — create plan (top-level + phase stubs)
- `/plan-discuss <slug> [phase-NN]` — interactive iteration (required before /plan-run on stub phase)
- `/plans` — see status (planning + execution progress)
- `/explain <slug> [phase-NN]` — walkthrough after ship
- `/grill <slug> [phase-NN]` — quiz after ship

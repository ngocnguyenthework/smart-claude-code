---
description: Interactive Q&A to finalize (or iterate) a plan. For a phase stub, writes GOAL/PLAN/DISCUSSION after discussion. For top-level, iterates CONTEXT/GOAL/DISCUSSION/PLAN in place. Required before /plan-run on any phase.
---

# /plan-discuss — Interactive plan finalizer

Interactive, human-in-the-loop alternative to auto-generated phase planning. Drives a Q&A session with the `planner` agent (Opus) until the user confirms enough context is gathered, then writes files.

## Two modes

### 1. Phase mode — `/plan-discuss <slug> phase-NN`

**Primary use.** Finalizes a phase stub (written by `/plan` containing only `CONTEXT.md`). After discussion, emits phase `GOAL.md` + `PLAN.md` + `DISCUSSION.md`. Required before `/plan-run <slug> phase-NN` — `/plan-run` halts on stubs.

Can also iterate an already-finalized phase (re-open discussion, adjust PLAN steps, refine acceptance). Refuses on `done`/`wip` phases without `--force` (see Constraints).

### 2. Top-level mode — `/plan-discuss <slug>`

Iterates top-level `CONTEXT.md` / `GOAL.md` / `DISCUSSION.md` / `PLAN.md` interactively. Use when:
- Reviewer flagged design flaw mid-run
- New constraint surfaced after initial plan
- Phase turned out mis-sized → restructure phase table
- `CONTEXT.md` missed reusable utility

## Usage

```
/plan-discuss <plan>                   # iterate top-level
/plan-discuss <plan> phase-NN          # finalize or iterate phase
/plan-discuss <plan> phase-NN --force  # re-discuss a done/wip phase (warns + invalidates Summary)
```

`<plan>` accepts: full `NN-slug` (`03-add-password-reset`), bare `NN` shortcut (`03` or `3`), or bare slug suffix (`add-password-reset`). Resolution per `plan.md ## Slug resolution`. Resolved name is the full `NN-slug`.

## Behavior (phase mode)

### 1. Validate folder shape

- Resolve `<plan>` arg per `plan.md ## Slug resolution` → full `NN-slug`.
- `.claude/plans/<NN-slug>/` must exist.
- `.claude/plans/<NN-slug>/phase-NN-*/CONTEXT.md` must exist. Error otherwise (wrong plan/phase, or single-phase plan — suggest top-level `/plan-discuss <plan>`).
- If phase `GOAL.md` status is `wip` or `done` and `--force` not set → refuse. Print warning: *"Phase status is <status>. Re-discussing invalidates its Summary. Re-run with `--force` to proceed. Re-execution requires `/plan-run <slug> phase-NN --redo`."*

### 2. Read context bundle

- Phase's `CONTEXT.md` (stub or finalized)
- Phase's `GOAL.md` + `PLAN.md` + `DISCUSSION.md` if they exist (re-discuss case)
- Top-level `CONTEXT.md` + `GOAL.md` + `PLAN.md` (overall framing)
- Prior phases' `PLAN.md ## Summary` blocks (only folders with `status: done` — what they shipped)
- Project rules (`.claude/rules/`)

### 2a. Pre-planner recon (parallel subagent fan-out)

Planner tools are `[Read, Grep, Glob]` only. Before Q&A, main session fans out recon in a single message, parallel `Task` calls (only what applies to the phase CONTEXT.md narrow goal):

- `code-explorer` — when phase touches existing code paths. Brief: *"For phase <NN> of <slug>: trace the code path for <phase narrow goal>. Report entry points, call graph, files to touch, reusable patterns. Do NOT edit."*
- `docs-lookup` — when phase narrow goal names a library/framework API. Brief: *"Fetch current docs for: <library + API>. Return minimal code example matching our stack."*
- `architect` — when phase involves design ambiguity (new abstraction, module boundary). Brief: *"Evaluate design options for phase <NN>: <narrow goal>. ≤200 words."*
- `database-reviewer` (pre-impl mode) — when phase mentions schema/migration/query. Brief: *"Pre-planning review of: <phase narrow goal>. Flag migration-safety + query-perf concerns BEFORE code is planned."*

**Skip when:** CONTEXT.md stub already names exact files + trivial scope. Otherwise run.

Collect reports. Pass condensed findings into the planner brief (step 3) under a **Recon findings** heading so planner Q&A targets gaps, not rediscovery.

### 3. Interactive Q&A loop

Dispatch `planner` agent with:
- Bundle above
- **Recon findings** (from step 2a, or "skipped — trivial scope")
- Mode directive: *"INTERACTIVE mode. Do NOT emit files yet. Run silent discovery on the bundle first. Then call `AskUserQuestion` with 1-4 batched questions per round. After each round's answers, decide: (a) enough context → propose file content back to main session, or (b) need more rounds → ask next batch. Maximum 4 rounds before the user is asked to break for a sanity check."*
- Scope directive: *"Phase <NN> of <slug>. Do NOT touch sibling phases. Do NOT touch top-level files. Emit only files inside `phase-NN-<name>/`."*

Planner runs Q&A. Main session relays each `AskUserQuestion` to the user, passes answers back.

**Round cap:** After 4 rounds, main session prompts:
```
question: "4 rounds of Q&A done. Continue or wrap up?"
options:
  - "One more round"
  - "Propose files now with what we have"
  - "Pause — I need to think"
  - "Abort — discard discussion"
```

### 4. Review proposed content

When planner signals "enough context," it returns proposed content for `GOAL.md` + `PLAN.md` + `DISCUSSION.md` (phase mode) without writing. Main session:

1. **Red-flag scan** on proposed phase `PLAN.md` (same rules as top-level `/plan`): `TODO(prod)`, hardcoded env values, dev-only branches, missing observability, anti-patterns (see `rules/common/production-readiness.md`). Also enforce **`## System workflow` diagram present** — missing / empty fence / abstract-boxes-only → loop back with flag *"Phase PLAN.md missing narrow-scope ASCII workflow diagram naming real files/functions."* On any hit → loop back to planner with flags quoted.

2. **Print pre-approval summary** (MANDATORY — schema below). User must see whole-picture fit + phase scope + acceptance + workflow at a glance, NOT just a file-bullet list. Aggregate from: top-level `GOAL.md` (Done-when), top-level `PLAN.md` phase table (position, depends, wave, total), prior phase `## Summary` blocks (Prior shipped), proposed phase `GOAL.md` (Goal, Acceptance), proposed phase `PLAN.md` (Steps count, Files touched, Dependencies, System workflow, Production checklist, Verify).

```
═══ Proposed phase <NN> — <slug> ═══

▸ Whole picture
  Phase <NN> of <total> · wave <W> · agent <implementer>
  Depends on: <phase list or "—">
  Unblocks: <phase list from depends: column or "—">
  Fits top-level goal: <one-line from top-level GOAL.md Done-when>
  Prior phases shipped: <list titles from done Summary blocks, or "none yet">

▸ This phase delivers
  Goal: <proposed GOAL.md Goal — 1 sentence>
  Acceptance:
    - [ ] <criterion 1>
    - [ ] <criterion 2>

▸ Implementation shape
  Steps: <N> · Files touched: <count> (<top 3 paths, …>)
  New deps: <list from PLAN.md ## Dependencies, or "none">
  Production checklist: <X/Y boxes pre-checked by planner>
  Verify: <one-line from PLAN.md ## Verify>

▸ System workflow (proposed phase PLAN.md)
<paste `## System workflow` diagram verbatim>

▸ Discussion record
  Rounds: <N>  ·  Key decisions: <bullets from proposed DISCUSSION.md entry>

▸ Files to write
  - phase-<NN>-<name>/GOAL.md       (<line count> lines)
  - phase-<NN>-<name>/PLAN.md       (<line count> lines)
  - phase-<NN>-<name>/DISCUSSION.md (<line count> lines)
```

**Refine-pass variant:** replace "Files to write" with "Files to overwrite" + show diff stat (`+N -M lines`) per file vs current on disk. Add `▸ Change summary` block above Discussion record: *"Refining <files> — &lt;one-line reason from latest user feedback&gt;."*

After printing, surface gate:

```
question: "Proposed phase <NN> files. Approve?"
options:
  - "Approve — write files"
  - "Refine — one more discussion round"
  - "Refine a specific file (GOAL / PLAN / DISCUSSION)"
  - "Abort — discard"
```

- **Approve** → step 5.
- **Refine** → re-enter loop (step 3) with user's feedback.
- **Refine specific file** → `AskUserQuestion` which file + what change; planner rewrites only that file.
- **Abort** → exit. Do not write. Phase remains stub (or unchanged if re-discuss).

### 5. Write files

- Write `phase-NN-<name>/GOAL.md`, `PLAN.md`, `DISCUSSION.md` (first-time) — OR overwrite the affected files (re-discuss).
- Update `GOAL.md` frontmatter: `status: planning → planned` (first-time) OR keep current status (re-discuss).
- Update top-level `PLAN.md` phase-table `Status` column: `todo → planned` (first-time). No-op for re-discuss unless user explicitly restructures phases.
- Append entry to phase's `DISCUSSION.md`:
  ```
  ## YYYY-MM-DD — Finalized via /plan-discuss
  **Rounds:** <N>
  **Key decisions:** [bullets from planner's returned summary]
  ```
  (Re-discuss appends `## YYYY-MM-DD — Refined <files>` instead, with change summary.)

### 6. Exit banner — whole-picture summary MANDATORY

Print a terse phase recap so user sees scope, fit, and flow in one glance without opening files:

```
═══ Phase <NN> finalized: <slug> ═══
What just happened: /plan-discuss wrote GOAL.md + PLAN.md + DISCUSSION.md (<N> Q&A rounds).
Whole picture: Phase <NN> of <total> — depends on <phase list or "—"> · wave <W> · agent <implementer>.
  Fits top-level goal: <one-line from top-level GOAL.md>
  Prior phases shipped: <list from Summary blocks, or "none">
  Next phases gated on this: <from phase table depends: column>
Phase scope: <phase GOAL.md Goal — 1 sentence>
Acceptance: <phase GOAL.md Acceptance checkboxes, one line each>
System workflow (phase PLAN.md):
<paste `## System workflow` diagram verbatim>

Review files at .claude/plans/<slug>/phase-<NN>-<name>/, then:
  /plan-run <slug> phase-NN      ← execute
  /plan-discuss <slug> phase-NN  ← another pass if needed
```

For re-discuss runs, replace "What just happened" with: *"/plan-discuss refined &lt;files&gt; (<N> rounds) — change: &lt;one-line from DISCUSSION.md entry&gt;"*.

## Behavior (top-level mode)

### 1. Validate

- Resolve `<plan>` per `plan.md ## Slug resolution`.
- `.claude/plans/<NN-slug>/PLAN.md` must exist.

### 2. Read bundle

- Top-level `CONTEXT.md` + `GOAL.md` + `DISCUSSION.md` + `PLAN.md`
- Phase folder names + each phase's `GOAL.md` status (if finalized) OR `CONTEXT.md` stub (if not)
- Project rules

### 3. Scope picker

```
question: "What to iterate?"
options:
  - "CONTEXT — why / constraints / existing code"
  - "GOAL — success criteria / non-negotiables"
  - "PLAN — overview / phase table / dependencies"
  - "DISCUSSION — review decisions log"
  - "All top-level files"
```

### 4. Interactive Q&A loop

Same pattern as phase mode — 1-4 rounds, planner asks batched questions. Scope directive tells planner which file(s) to rewrite.

### 5. Review + write

**Print pre-approval summary** (MANDATORY) before gate. Schema for top-level mode:

```
═══ Proposed top-level refine — <slug> ═══

▸ Whole picture
  Plan: <slug> · stack: <stack> · agent: <implementer>
  Phases: <total> (planning <X>, planned <Y>, wip <Z>, done <W>)
  Status: <planning|in-progress|done>

▸ Scope of this refine
  Files: <CONTEXT|GOAL|PLAN|DISCUSSION — only changed ones>
  Change: <one-line from user's reason>

▸ Diff stat (vs current on disk)
  - CONTEXT.md: +N -M lines
  - PLAN.md:    +N -M lines  (phase table: <added/removed/renamed phase summary>)

▸ If PLAN.md changed — phase-table reconciliation preview
  + new: phase-<NN>-<name> (will create stub)
  − removed: phase-<NN>-<name> (will prompt before delete)
  ↻ renamed: phase-<NN>-<old> → phase-<NN>-<new>

▸ Top-level system workflow (post-refine)
<paste `## System workflow` from proposed PLAN.md verbatim, only if PLAN.md in scope>

▸ Discussion record
  Rounds: <N>  ·  Key decisions: <bullets>
```

Then same gate as phase mode. On approve, write affected top-level files.

**Phase-table reconciliation (if `PLAN.md` changed):**
- Phase added → create stub folder with `CONTEXT.md` stub (status: planning). Print follow-up: *"New phase <NN> — run `/plan-discuss <slug> phase-NN` to finalize."*
- Phase removed → prompt before deleting folder (`AskUserQuestion` — drops all phase content).
- Phase renamed → rename folder; preserve contents.
- Phase count changed single-phase ↔ multi-phase → warn: structural reshape needed; recommend fresh `/plan`.

**Never flip `status: done` phases back to `todo` without `--force` + explicit user confirmation.**

### 6. Append DISCUSSION

```
## YYYY-MM-DD — Refined <files>
**Change:** [one-line summary]
**Why:** [user's reason]
**Rounds:** <N>
```

## Constraints

- **Never writes files during Q&A.** Writes only after user approves proposed content at step 4 gate.
- **Never modifies sibling phase folders** (phase mode).
- **Never modifies phase's `Summary` block** — Summaries reflect actual execution, written by `/plan-run`.
- **Never flips `done` status without `--force`** — invalidating execution history requires explicit opt-in.
- **Never runs implementer** — dispatch is `/plan-run`'s job.
- **Round cap: 4** before forced sanity-check prompt — prevents endless loops.
- **Production-readiness red-flag scan** runs on proposed phase `PLAN.md` before approval gate (same rules as `/plan`).

## When to use

**Phase mode:**
- After `/plan` created a new plan → finalize each phase one at a time.
- After `/plan-run` surfaced mid-run blockers → re-discuss next phase with that context.
- Before starting a phase in a fresh session — optional refresh if plan is old.

**Top-level mode:**
- Reviewer flagged cross-phase design issue.
- Stakeholder added late constraint.
- Phase mis-sized — restructure phase table.
- `CONTEXT.md` missed reusable utility / prior art.

## Recommended flow

```
/plan <objective>                      # creates plan folder NN-slug; phase stubs only
/plan-discuss 03 phase-01              # finalize phase 1 interactively (NN shortcut)
/plan-run 03 phase-01                  # execute; commit
/clear
/plan-discuss 03 phase-02              # finalize phase 2 (fresh context)
/plan-run 03 phase-02
/clear
...
```

Each `/plan-discuss` + `/plan-run` pair in its own context window keeps the planner's Q&A and implementer's execution focused — critical for multi-phase plans.

## Related

- `/plan <objective>` — create plan + stub phases
- `/plan-run <slug> [phase-NN]` — execute (halts on stubs)
- `/plans` — list plans + status
- `/explain <slug> [phase-NN]` — walkthrough of shipped phase
- `/grill <slug> [phase-NN]` — quiz on shipped phase

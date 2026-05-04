---
description: Interactive Q&A to finalize (or iterate) a plan. For a high-level phase (ROADMAP.md H2 section), creates phase folder + writes PHASE.md. For top-level, iterates PRD / TECH-SPEC / ROADMAP in place. Required before /plan-run on any phase.
---

# /plan-discuss — Interactive plan finalizer

Interactive, human-in-the-loop alternative to auto-generated phase planning. Drives a Q&A session with the `planner` agent (Opus) until the user confirms enough context is gathered, then writes files.

## Two modes

### 1. Phase mode — `/plan-discuss <slug> phase-NN`

**Primary use.** Finalizes a high-level phase defined in `ROADMAP.md` (which only holds a one-sentence `Ships:` outcome per phase). Creates `phase-NN-<name>/` folder + writes `PHASE.md` inside. Required before `/plan-run <slug> phase-NN` — `/plan-run` halts until the folder + PHASE.md exist.

Can also iterate an already-finalized phase (re-open discussion, adjust steps, refine acceptance). Refuses on `done`/`wip` phases without `--force` (see Constraints).

### 2. Top-level mode — `/plan-discuss <slug>`

Iterates root `PRD.md` / `TECH-SPEC.md` / `ROADMAP.md` interactively. Use when:
- Reviewer flagged design flaw mid-run
- New constraint surfaced after initial plan
- Phase turned out mis-sized → restructure ROADMAP phase table
- `TECH-SPEC.md` missed reusable utility

## Usage

```
/plan-discuss <plan>                   # iterate top-level
/plan-discuss <plan> phase-NN          # finalize or iterate phase
/plan-discuss <plan> phase-NN --force  # re-discuss a done/wip phase (warns + invalidates Summary)
```

`<plan>` accepts: full `NN-slug` (`03-add-password-reset`), bare `NN` shortcut (`03` or `3`), or bare slug suffix (`add-password-reset`). Resolution per `plan.md ## Slug resolution`. Resolved name is the full `NN-slug`.

## Behavior (phase mode)

### 1. Validate plan shape

- Resolve `<plan>` arg per `plan.md ## Slug resolution` → full `NN-slug`.
- `.claude/plans/<NN-slug>/` must exist with `PRD.md` + `TECH-SPEC.md` + `ROADMAP.md`.
- `phase-NN` must appear in `ROADMAP.md ## Phases` table. Error otherwise (wrong plan/phase).
- If `phase-NN-<name>/PHASE.md` exists and status is `wip` or `done` and `--force` not set → refuse. Print warning: *"Phase status is <status>. Re-discussing invalidates its Summary. Re-run with `--force` to proceed. Re-execution requires `/plan-run <slug> phase-NN --redo`."*
- If phase folder doesn't exist yet → first-time finalize (creates folder on write).

### 2. Read context bundle

- Root: `PRD.md` + `TECH-SPEC.md` + `ROADMAP.md` — especially the target phase's H2 section (one-sentence `Ships:` outcome + `Depends:` — the only pre-discussion scope definition)
- Phase's `PHASE.md` if it exists (re-discuss case)
- Prior phases' `PHASE.md ## Summary` blocks (only folders with `status: done` — what they shipped)
- Project rules (`.claude/rules/`)

Because ROADMAP H2 is intentionally high-level (no context hints, no file lists), the planner runs its own Silent Discovery during this step — grepping reusable modules, reading related source, fetching library docs — before any Q&A.

### 2a. Pre-planner recon (parallel subagent fan-out)

Planner tools are `[Read, Grep, Glob]` only. Before Q&A, main session fans out recon in a single message, parallel `Task` calls (only what applies to the ROADMAP phase H2 `- Ships:` outcome):

- `code-explorer` — when phase touches existing code paths. Brief: *"For phase <NN> of <slug>: trace the code path for <ROADMAP Ships line>. Report entry points, call graph, files to touch, reusable patterns. Do NOT edit."*
- `docs-lookup` — when phase touches a library/framework API. Brief: *"Fetch current docs for: <library + API>. Return minimal code example matching our stack."*
- `architect` — when phase involves design ambiguity (new abstraction, module boundary). Brief: *"Evaluate design options for phase <NN>: <ROADMAP Ships line>. ≤200 words."*
- `database-reviewer` (pre-impl mode) — when phase touches schema/migration/query. Brief: *"Pre-planning review of: <phase Ships line>. Flag migration-safety + query-perf concerns BEFORE code is planned."*

**Skip when:** ROADMAP Ships line already names exact files + trivial scope. Otherwise run — ROADMAP is high-level by design, recon fills the gap.

Collect reports. Pass condensed findings into the planner brief (step 3) under a **Recon findings** heading so planner Q&A targets gaps, not rediscovery.

### 3. Interactive Q&A loop

Dispatch `planner` agent with:
- Bundle above
- **Recon findings** (from step 2a, or "skipped — trivial scope")
- Mode directive: *"INTERACTIVE mode. Do NOT emit files yet. Run silent discovery on the bundle first. Then call `AskUserQuestion` with 1-4 batched questions per round. After each round's answers, decide: (a) enough context → propose file content back to main session, or (b) need more rounds → ask next batch. Maximum 4 rounds before the user is asked to break for a sanity check."*
- Scope directive: *"Phase <NN> of <slug>. Do NOT touch sibling phases. Do NOT touch root files (PRD/TECH-SPEC/ROADMAP). Emit exactly one file: `phase-NN-<name>/PHASE.md` — goal, acceptance, steps, files changed, system workflow (phase-scoped), production checklist, decisions (seeded with this session's Q&A), verify, done-when. Summary section left blank for `/plan-run`."*

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

When planner signals "enough context," it returns proposed content for `phase-NN-<name>/PHASE.md` (phase mode) without writing. Main session:

1. **Red-flag scan** on proposed `PHASE.md` (same rules as top-level `/plan`): `TODO(prod)`, hardcoded env values, dev-only branches, missing observability, anti-patterns (see `rules/common/production-readiness.md`). Also enforce **`## System Workflow` section present** — missing / empty fence / abstract-boxes-only → loop back with flag *"PHASE.md missing phase-scoped ASCII workflow diagram naming real files/functions."* On any hit → loop back to planner with flags quoted.

2. **Print pre-approval summary** (MANDATORY — schema below). User must see whole-picture fit + phase scope + acceptance + workflow at a glance, NOT just a file-bullet list. Aggregate from: `PRD.md ## Goal` + `## Acceptance`, `ROADMAP.md` phase table (position, depends, wave, total), prior phase `PHASE.md ## Summary` blocks (Prior shipped), proposed `PHASE.md` (Goal, Acceptance, Steps count, Files touched, Dependencies, System Workflow, Production Checklist, Verify, Decisions).

```
═══ Proposed phase <NN> — <slug> ═══

▸ Whole picture
  Phase <NN> of <total> · wave <W> · agent <implementer>
  Depends on: <phase list or "—">
  Unblocks: <phase list from ROADMAP depends: column or "—">
  Fits top-level goal: <one-line from PRD.md ## Goal>
  Prior phases shipped: <list titles from done PHASE.md ## Summary blocks, or "none yet">

▸ This phase delivers
  Goal: <proposed PHASE.md ## Goal — 1 sentence>
  Acceptance:
    - [ ] <criterion 1>
    - [ ] <criterion 2>

▸ Implementation shape
  Steps: <N> · Files touched: <count> (<top 3 paths, …>)
  New deps: <list from TECH-SPEC.md ## Dependencies referenced, or "none">
  Production checklist: <X/Y boxes pre-checked by planner>
  Verify: <one-line from PHASE.md ## Verify>

▸ System workflow (proposed PHASE.md)
<paste `## System Workflow` diagram verbatim>

▸ Decisions record
  Rounds: <N>  ·  Key decisions: <bullets from proposed PHASE.md ## Decisions entry>

▸ File to write
  - phase-<NN>-<name>/PHASE.md       (<line count> lines; folder created)
```

**Refine-pass variant:** replace "File to write" with "File to overwrite" + show diff stat (`+N -M lines`) vs current on disk. Add `▸ Change summary` block above Decisions record: *"Refining PHASE.md — &lt;one-line reason from latest user feedback&gt;."*

After printing, surface gate:

```
question: "Proposed phase <NN>. Approve?"
options:
  - "Approve — write PHASE.md"
  - "Refine — one more discussion round"
  - "Refine a specific section (Goal / Steps / Workflow / Decisions / Verify)"
  - "Abort — discard"
```

- **Approve** → step 5.
- **Refine** → re-enter loop (step 3) with user's feedback.
- **Refine specific section** → `AskUserQuestion` which section + what change; planner rewrites only that section.
- **Abort** → exit. Do not write. Phase row in ROADMAP stays `planning` (or unchanged if re-discuss).

### 5. Write files

- Create `phase-NN-<name>/` folder (first-time) if missing. Write `phase-NN-<name>/PHASE.md` (first-time) OR overwrite it (re-discuss).
- Update PHASE.md frontmatter: `status: planning → planned` (first-time) OR keep current status (re-discuss).
- Update `ROADMAP.md ## Phases` table `Status` column: `planning → planned` (first-time). No-op for re-discuss unless user explicitly restructures phases.
- Append entry to PHASE.md `## Decisions`:
  ```
  ### YYYY-MM-DD — Finalized via /plan-discuss
  **Rounds:** <N>
  **Key decisions:** [bullets from planner's returned summary]
  ```
  (Re-discuss appends `### YYYY-MM-DD — Refined <sections>` instead, with change summary.)

### 6. Exit banner — whole-picture summary MANDATORY

Print a terse phase recap so user sees scope, fit, and flow in one glance without opening files:

```
═══ Phase <NN> finalized: <slug> ═══
What just happened: /plan-discuss created phase-<NN>-<name>/PHASE.md (<N> Q&A rounds).
Whole picture: Phase <NN> of <total> — depends on <phase list or "—"> · wave <W> · agent <implementer>.
  Fits top-level goal: <one-line from PRD.md ## Goal>
  Prior phases shipped: <list from Summary blocks, or "none">
  Next phases gated on this: <from ROADMAP phase table depends: column>
Phase scope: <PHASE.md ## Goal — 1 sentence>
Acceptance: <PHASE.md ## Acceptance checkboxes, one line each>
System workflow (PHASE.md):
<paste `## System Workflow` diagram verbatim>

Review file at .claude/plans/<slug>/phase-<NN>-<name>/PHASE.md, then:
  /plan-run <slug> phase-NN      ← execute
  /plan-discuss <slug> phase-NN  ← another pass if needed
```

For re-discuss runs, replace "What just happened" with: *"/plan-discuss refined PHASE.md (<N> rounds) — change: &lt;one-line from Decisions entry&gt;"*.

## Behavior (top-level mode)

### 1. Validate

- Resolve `<plan>` per `plan.md ## Slug resolution`.
- `.claude/plans/<NN-slug>/PRD.md` must exist (plus sibling `TECH-SPEC.md` + `ROADMAP.md`).

### 2. Read bundle

- Root: `PRD.md` + `TECH-SPEC.md` + `ROADMAP.md`
- Existing `phase-NN-*/PHASE.md` files + their `status:` frontmatter (to know which phases already finalized)
- Project rules

### 3. Scope picker

```
question: "What to iterate?"
options:
  - "PRD — product: why / goal / acceptance / scope / constraints / decisions"
  - "TECH-SPEC — architecture / workflow / dependencies / production checklist"
  - "ROADMAP — phase list + high-level per-phase briefs"
  - "All three root files"
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
  Files: <PRD|TECH-SPEC|ROADMAP — only changed ones>
  Change: <one-line from user's reason>

▸ Diff stat (vs current on disk)
  - PRD.md:        +N -M lines
  - TECH-SPEC.md:  +N -M lines
  - ROADMAP.md:    +N -M lines  (phase table: <added/removed/renamed phase summary>)

▸ If ROADMAP.md changed — phase-table reconciliation preview
  + new: phase-<NN>-<name> (ROADMAP H2 added; folder will be created by future /plan-discuss phase-NN)
  − removed: phase-<NN>-<name> (if folder exists, will prompt before delete)
  ↻ renamed: phase-<NN>-<old> → phase-<NN>-<new>

▸ Whole-system workflow (post-refine)
<paste `## System Workflow` from proposed TECH-SPEC.md verbatim, only if TECH-SPEC.md in scope>

▸ Decisions record
  Rounds: <N>  ·  Key decisions: <bullets>
```

Then same gate as phase mode. On approve, write affected root files.

**Phase-table reconciliation (if `ROADMAP.md` changed):**
- Phase added → ROADMAP row + H2 section emitted (high-level one-sentence). NO folder created. Print follow-up: *"New phase <NN> — run `/plan-discuss <slug> phase-NN` to finalize (creates folder + PHASE.md)."*
- Phase removed → if phase folder exists, prompt before deleting (`AskUserQuestion` — drops all phase content). If no folder, just delete ROADMAP row + H2.
- Phase renamed → rename folder if exists; update ROADMAP row + H2; preserve contents.
- Phase count changed single-phase ↔ multi-phase → warn: structural reshape needed; recommend fresh `/plan`.

**Never flip `status: done` phases back to `planning` without `--force` + explicit user confirmation.**

### 6. Append PRD.md ## Decisions

```
### YYYY-MM-DD — Refined <files>
**Change:** [one-line summary]
**Why:** [user's reason]
**Rounds:** <N>
```

## Constraints

- **Never writes files during Q&A.** Writes only after user approves proposed content at step 4 gate.
- **Never modifies sibling phase folders** (phase mode).
- **Never modifies phase's `## Summary` section** — Summaries reflect actual execution, written by `/plan-run`.
- **Never flips `done` status without `--force`** — invalidating execution history requires explicit opt-in.
- **Never runs implementer** — dispatch is `/plan-run`'s job.
- **Round cap: 4** before forced sanity-check prompt — prevents endless loops.
- **Production-readiness red-flag scan** runs on proposed `PHASE.md` before approval gate (same rules as `/plan`).

## When to use

**Phase mode:**
- After `/plan` created a new plan → finalize each phase one at a time (first finalization creates the folder).
- After `/plan-run` surfaced mid-run blockers → re-discuss next phase with that context.
- Before starting a phase in a fresh session — optional refresh if plan is old.

**Top-level mode:**
- Reviewer flagged cross-phase design issue.
- Stakeholder added late constraint.
- Phase mis-sized — restructure ROADMAP phase table.
- `TECH-SPEC.md` missed reusable utility / prior art.

## Recommended flow

```
/plan <objective>                      # creates plan folder NN-slug — PRD + TECH-SPEC + ROADMAP only
/plan-discuss 03 phase-01              # finalize phase 1 (creates phase-01-*/PHASE.md)
/plan-run 03 phase-01                  # execute; commit
/clear
/plan-discuss 03 phase-02              # finalize phase 2 (creates phase-02-*/PHASE.md)
/plan-run 03 phase-02
/clear
...
```

Each `/plan-discuss` + `/plan-run` pair in its own context window keeps the planner's Q&A and implementer's execution focused — critical for multi-phase plans.

## Related

- `/plan <objective>` — create plan (PRD + TECH-SPEC + ROADMAP; no phase folders)
- `/plan-run <slug> [phase-NN]` — execute (halts on stubs)
- `/plans` — list plans + status
- `/explain <slug> [phase-NN]` — walkthrough of shipped phase
- `/grill <slug> [phase-NN]` — quiz on shipped phase

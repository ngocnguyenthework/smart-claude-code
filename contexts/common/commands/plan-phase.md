---
description: Deep-dive planner for ONE phase of a large plan. Fills the phase folder with CONTEXT, PLAN, and DISCUSSION. Use only when the plan was created in large (folder-per-phase) mode.
---

# /plan-phase — Deep-dive plan for one phase

Runs the `planner` agent (Opus) scoped to a single phase of a **large** plan. Reads the phase's `GOAL.md` (stubbed by `/plan`) + top-level `CONTEXT.md` + prior phases' `Summary` blocks, then emits concrete `CONTEXT.md` + `PLAN.md` + `DISCUSSION.md` inside the phase folder so a fresh implementer can execute it cold.

## When to use

- Large-mode plan only (phase table rows point to folders `phase-NN-<name>/`, not flat files).
- Before `/plan-run <slug> phase-NN` — `/plan-run` halts on a stub phase folder.
- When the phase's `GOAL.md` exists but `PLAN.md` inside the folder is missing or stub.

Small plans (≤3 phases, flat files or inline `## Steps`) never use this — they're planned fully by `/plan` in one shot.

## Usage

```
/plan-phase <slug> phase-NN              # deep-dive one phase
/plan-phase <slug> phase-NN --redo       # re-plan even if phase folder is already full
```

## Behavior

1. **Validate folder shape.** `.claude/plans/<slug>/phase-NN-*/GOAL.md` must exist. Error if missing (either wrong slug/phase, or plan is small-mode — suggest `/plan-refine <slug> phase-NN` instead).
2. **Refuse re-plan by default** if phase folder already contains `PLAN.md` with `status != planning`. Require `--redo`.
3. **Read context bundle** (planner input):
   - Phase's `GOAL.md` (acceptance + goal + deps)
   - Top-level `CONTEXT.md` (overall why + constraints)
   - Top-level `PLAN.md` (phase table — shows siblings + wave)
   - **Prior phases' `phase-NN-*/PLAN.md ## Summary`** (what they shipped — only folders where status=done)
   - Project rules (`.claude/rules/`)
4. **Dispatch `planner` agent** with the bundle and this scope directive:
   > "Scope: ONE phase of a large plan. Do NOT re-plan sibling phases. Do NOT rewrite top-level `PLAN.md` / `CONTEXT.md` / `DISCUSSION.md`. Emit only files inside `phase-NN-<name>/`. The goal + acceptance in `GOAL.md` are fixed — if they're wrong, flag and stop (user runs `/plan-phase-refine <slug> phase-NN GOAL`)."
5. **Discovery budget** for the planner on this phase: silent discovery first, then **at most ONE `AskUserQuestion` call with ≤4 batched questions** scoped to *this phase only*. The phase's goal is already set — questions should be about *how*, not *what*.
6. **Planner emits**:
   - `phase-NN-*/CONTEXT.md` — phase-scoped constraints, existing code to reuse, prior-phase outputs this phase depends on
   - `phase-NN-*/PLAN.md` — concrete steps, files touched, production checklist, verify commands, done-when (full implementer brief)
   - `phase-NN-*/DISCUSSION.md` — initial entry: chosen approach, alternatives considered, trade-offs (dated, append-only)
7. **Red-flag scan** on the phase `PLAN.md` (same rules as top-level `/plan`): `TODO(prod)`, hardcoded env values, dev-only branches, missing observability plan. On hit → loop back to planner with red flags quoted.
8. **Update phase `GOAL.md` frontmatter**: `status: planning → planned`.
9. **Update top-level `PLAN.md` phase table** `Status` column: `todo → planned` for this phase (shows user which phases are deep-dive-planned vs still stub).
10. **Present phase PLAN.md to user + gate on approval**:
    ```
    question: "Phase <NN> deep-dive plan ready. Proceed?"
    options:
      - "Approve — ready for /plan-run"
      - "Refine — /plan-phase-refine <slug> phase-NN"
      - "Split — phase too big, break into multiple phases (/plan-refine <slug> PLAN)"
      - "Abort"
    ```
    On **Approve** → done. User invokes `/plan-run <slug> phase-NN` when ready.
    On **Refine** → re-dispatch `/plan-phase-refine`.
    On **Split** → re-dispatch `/plan-refine <slug>` (whole plan) to restructure phase table.
    On **Abort** → revert `GOAL.md` status back to `planning`, leave `PLAN.md` + `CONTEXT.md` + `DISCUSSION.md` on disk for review.

## Phase-size invariant

The planner applies the same "≤2 questions" test inside this command — if the phase *still* needs ≥3 clarifying questions after silent discovery, the phase is mis-sized. Planner flags it, suggests splitting via `/plan-refine <slug>` at the top-level phase table.

## Why a separate command

Large plans have too much breadth for the top-level `/plan` to deep-plan every phase in one shot (would blow the Opus context window and interrogate the user with 20+ questions). Two-phase planning:

1. `/plan <objective>` — top-level planner decomposes into phase *goals* only (stub folders).
2. `/plan-phase <slug> phase-NN` — per-phase planner deep-plans one phase at a time, with fresh context each time.

Each `/plan-phase` runs in a fresh context window if the user `/clear`s between them — same pattern as `/plan-run` between phases.

## Related

- `/plan <objective>` — create plan (detects large vs small, stubs phase folders for large)
- `/plan-phase-refine <slug> phase-NN [GOAL|CONTEXT|PLAN|DISCUSSION]` — refine one file in a phase folder
- `/plan-refine <slug>` — refine top-level PLAN.md / CONTEXT.md / DISCUSSION.md
- `/plan-run <slug> phase-NN` — execute the phase (requires phase PLAN.md filled)
- `/plans` — index with phase-planning progress

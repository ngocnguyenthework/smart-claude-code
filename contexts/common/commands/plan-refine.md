---
description: Re-dispatch planner scoped to CONTEXT, DISCUSSION, PLAN, or a single phase file of an existing plan folder. Updates in place.
---

# /plan-refine — Refine an existing plan

Re-runs the `planner` agent (Opus) against one file of a plan folder with the user's feedback. Appends the decision to `DISCUSSION.md`.

## Usage

```
/plan-refine <slug>                     # refine top-level PLAN.md (default)
/plan-refine <slug> CONTEXT             # refine top-level CONTEXT.md
/plan-refine <slug> DISCUSSION          # review / reorganize top-level DISCUSSION.md
/plan-refine <slug> PLAN                # refine top-level PLAN.md explicitly
/plan-refine <slug> phase-NN            # refine one phase (small mode = flat file; large mode = delegates to /plan-phase-refine)
```

## Behavior

1. Validate folder exists: `.claude/plans/<slug>/`. Error if missing.
2. **If target is `phase-NN`, detect phase shape** (inspect `PLAN.md` phase-table `File` column):
   - Flat file (`phase-NN-<name>.md`) → small mode. Proceed with this command.
   - Folder (`phase-NN-<name>/`) → large mode. **Stop and route to `/plan-phase-refine`**. Print:
     ```
     Large-mode phase uses `/plan-phase-refine`. Try:
       /plan-phase-refine <slug> phase-NN          # refine PLAN.md inside folder (default)
       /plan-phase-refine <slug> phase-NN GOAL     # refine GOAL.md
       /plan-phase-refine <slug> phase-NN CONTEXT  # refine CONTEXT.md
     ```
     Exit. `/plan-refine` only writes top-level files and flat phase files — never reaches into a phase folder.
3. Prompt user via `AskUserQuestion`: "What should change?" (free-text via Other).
4. Read the target file + the other two headline files (always include top-level `CONTEXT.md` + `PLAN.md` as context, even when refining a flat phase file).
5. Dispatch `planner` with:
   - Current content of the target file
   - User's feedback
   - Reference content from top-level CONTEXT + PLAN
   - Scope: which single file to rewrite (top-level files only, or a flat phase file)
6. Planner returns replacement content for the target file only.
7. Write back in place.
8. Append one entry to `DISCUSSION.md` at the top:
   ```
   ## YYYY-MM-DD — Refined <target>
   **Change:** [one-line summary of what moved]
   **Why:** [user's reason]
   ```
9. If refining `PLAN.md` changes the phase table (phase added/removed/renamed), the orchestrator reconciles phase files — prompts user before deleting any `phase-NN-<name>.md` file **or** `phase-NN-<name>/` folder. Deleting a large-mode phase folder drops all its `GOAL` / `CONTEXT` / `PLAN` / `DISCUSSION` content — confirm explicitly.
10. Never flips an already-`done` phase back to `todo` without explicit user confirmation.
11. If refining `PLAN.md` changes the **mode** (e.g., small→large by bumping to >3 phases, or large→small by cutting to ≤3), warn the user: mode change requires restructuring phase storage on disk, and `/plan-refine` does NOT do that automatically. Recommend: finish current plan as-is, or start a fresh plan with `/plan`.

## When to use

- Reviewer flagged a design flaw mid-run
- User learned new constraint after initial plan
- Phase turned out larger than expected → split it
- CONTEXT.md missed an existing utility — add it so future phases reuse

## Related

- `/plan <objective>` — new plan
- `/plan-phase <slug> phase-NN` — deep-dive plan for a large-mode stub phase
- `/plan-phase-refine <slug> phase-NN [GOAL|CONTEXT|PLAN|DISCUSSION]` — refine one file inside a large-mode phase folder
- `/plan-run <slug>` — execute phase

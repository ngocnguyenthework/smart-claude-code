---
description: Refine one file inside a phase folder of a large plan (GOAL, CONTEXT, PLAN, or DISCUSSION). Updates in place.
---

# /plan-phase-refine — Refine a file inside a phase folder

Re-runs the `planner` agent (Opus) against one file of a phase folder with the user's feedback. Appends the decision to the phase's `DISCUSSION.md`.

## When to use

- Large-mode plan only. For small plans (flat phase files), use `/plan-refine <slug> phase-NN`.
- Phase is deep-planned (has `PLAN.md` inside folder) but something needs adjustment:
  - Goal / acceptance wrong → refine `GOAL`
  - Missed a reusable utility or constraint → refine `CONTEXT`
  - Steps mis-sized or wrong order → refine `PLAN`
  - Decisions log needs cleanup → review `DISCUSSION`

## Usage

```
/plan-phase-refine <slug> phase-NN                 # refine PLAN.md (default)
/plan-phase-refine <slug> phase-NN GOAL            # refine GOAL.md (goal, acceptance, deps)
/plan-phase-refine <slug> phase-NN CONTEXT         # refine CONTEXT.md (constraints, existing code)
/plan-phase-refine <slug> phase-NN PLAN            # refine PLAN.md (steps, files, verify) — explicit
/plan-phase-refine <slug> phase-NN DISCUSSION      # review / reorganize DISCUSSION.md
```

## Behavior

1. Validate folder: `.claude/plans/<slug>/phase-NN-*/` must exist. Error if missing.
2. Refuse if target file is `PLAN.md` but phase is already `status: done` or `wip` — require explicit `--force` and warn that re-planning a done phase invalidates its Summary.
3. Prompt user via `AskUserQuestion`: "What should change?" (free-text via Other).
4. **Read context bundle**:
   - Target file (the one being rewritten)
   - Other three files in this phase folder (always include for consistency)
   - Top-level `CONTEXT.md` + `PLAN.md` (for overall plan context)
   - Prior phases' `Summary` blocks (if editing `CONTEXT` or `PLAN`)
5. Dispatch `planner` with:
   - Current content of target file
   - User's feedback
   - Reference content (other phase files + top-level CONTEXT/PLAN + prior Summaries)
   - Scope directive: "Rewrite ONLY the named file. Do not touch siblings in this folder, do not touch top-level files."
6. Planner returns replacement content for the target file only.
7. Write back in place.
8. Append one entry to phase's `DISCUSSION.md` at top:
   ```
   ## YYYY-MM-DD — Refined <target>
   **Change:** [one-line summary of what moved]
   **Why:** [user's reason]
   ```
9. If refining `GOAL.md` changes acceptance criteria, prompt user: "Acceptance changed. Re-run `/plan-phase-refine <slug> phase-NN PLAN` to realign steps?" — don't do it automatically.
10. If refining `PLAN.md` for a phase with `status: done`, append a warning to `DISCUSSION.md`: "⚠ Phase was already done — re-plan invalidates Summary. Re-run `/plan-run <slug> phase-NN --redo` if shipping the new plan."

## Constraints

- Never flips `status: done` phases back to `todo` without `--force` + explicit user confirmation.
- Never modifies sibling phase folders.
- Never modifies top-level `PLAN.md` / `CONTEXT.md` / `DISCUSSION.md` (use `/plan-refine` for those).
- Never modifies a phase's `Summary` block — Summaries are written by `/plan-run` and reflect actual execution, not plan.

## Related

- `/plan-phase <slug> phase-NN` — initial deep-dive plan for a stub phase
- `/plan-refine <slug>` — refine top-level plan files
- `/plan-refine <slug> phase-NN` — refine a flat phase file (small plans only)
- `/plan-run <slug> phase-NN` — execute the phase

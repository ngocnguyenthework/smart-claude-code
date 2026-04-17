---
description: List all plan folders under `.claude/plans/` with status. Highlights the active plan.
---

# /plans — Plan Index

List plan folders in `.claude/plans/`. One row per folder: slug, status, phases done / total, last-updated date, next action.

## Behavior

1. Enumerate child directories of `.claude/plans/` (skip `_inbox.md` and any loose files — legacy).
2. For each folder, read `<folder>/PLAN.md`:
   - Frontmatter: `slug`, `status`, `created`, `stack`
   - Phase table (if present): count rows by `Status` column + detect phase shape (flat file vs folder) to classify mode
3. **Detect mode + compute progress**:
   - **Small mode** (inline steps, or flat phase files): only execution progress applies. Planning progress column shows `—`.
   - **Large mode** (phase folders): two progress values.
     - **Planning progress**: count phase folders whose inner `PLAN.md` exists with `status != planning` (i.e., deep-planned by `/plan-phase`). Show as `planned / total`.
     - **Execution progress**: count phases with top-level phase-table `Status: done`. Show as `done / total`.
4. Print:

   | Slug | Status | Mode | Planning | Execution | Stack | Updated | Next |
   |---|---|---|---|---|---|---|---|
   | add-password-reset | in-progress | large | 3 / 5 | 1 / 5 | fastapi | 2026-04-17 | `/plan-phase add-password-reset phase-04` |
   | add-audit-log | planning | small | — | 0 / 3 | nestjs | 2026-04-17 | `/plan-run add-audit-log` |
   | fix-null-check | done | small | — | — | fastapi | 2026-04-16 | — |

5. **Next action derivation**:
   - Small mode: `/plan-run <slug>` if any phase `todo`; `—` if done.
   - Large mode:
     - If any phase folder still stub (`GOAL.md` present, inner `PLAN.md` missing) → `/plan-phase <slug> phase-NN` (lowest phase with stub).
     - Else if any phase `todo` → `/plan-run <slug>` (auto-picks).
     - Else → `—`.
6. Highlight the first `in-progress` plan with `→`. If none, highlight most-recent-created.
7. Print inbox line count if `.claude/plans/_inbox.md` exists: `Inbox: N ideas — read .claude/plans/_inbox.md`.
8. Warn if any folder is missing `PLAN.md` — `<slug>: malformed (no PLAN.md)`.
9. Large-mode integrity: if a phase folder has `PLAN.md` but not `GOAL.md`, or vice versa in an inconsistent way, flag `<slug>/phase-NN: malformed folder` and suggest `/plan-phase-refine`.

## Output

Terse. No editorial. One table + one active-plan arrow. Cap at 20 rows; suggest `ls .claude/plans/` for more.

## When to use

Start of session to see what's open. After `/clear` to resume. Before `/plan` to avoid duplicate slugs.

## Related

- `/plan <objective>` — create (always folder; detects large vs small)
- `/plan-phase <slug> phase-NN` — deep-dive plan for a large-mode stub phase
- `/plan-refine <slug>` — refine top-level plan files, or a flat phase file (small mode)
- `/plan-phase-refine <slug> phase-NN` — refine a file inside a large-mode phase folder
- `/plan-run <slug>` — execute next phase (halts on unplanned large-mode phase with stub guard)

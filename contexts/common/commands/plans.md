---
description: List all plan folders under `.claude/plans/` with status. Highlights the active plan.
---

# /plans — Plan Index

List plan folders in `.claude/plans/`. One row per folder: slug, status, phases planned / done / total, last-updated date, next action.

## Behavior

1. Enumerate child directories of `.claude/plans/` (skip `_inbox.md` and loose files — legacy). Sort by leading `NN` numeric prefix descending (newest first); folders without numeric prefix sink to bottom (legacy / pre-NN).
2. For each folder, read `<folder>/PRD.md` + `<folder>/ROADMAP.md`:
   - PRD frontmatter: `slug`, `status`, `created`, `stack`
   - ROADMAP `## Phases` table: count rows by `status` column
3. **Compute progress** (uniform for single- and multi-phase — both use ROADMAP + phase folders):
   - **Planning progress**: count ROADMAP rows whose matching `phase-NN-*/PHASE.md` exists with `status != planning` (i.e., finalized via `/plan-discuss`). Show as `planned / total`.
   - **Execution progress**: count ROADMAP rows with `status: done`. Show as `done / total`.
4. Print full `NN-slug` in **Plan** column so user can copy-paste OR mention by leading `NN` shortcut. `Next` action column uses bare `NN` shortcut for terseness:

   | Plan | Status | Phases | Planned | Done | Stack | Updated | Next |
   |---|---|---|---|---|---|---|---|
   | 03-add-password-reset | in-progress | 5 | 3 / 5 | 1 / 5 | fastapi | 2026-04-17 | `/plan-discuss 03 phase-04` |
   | 02-add-audit-log | planning | 3 | 0 / 3 | 0 / 3 | nestjs | 2026-04-17 | `/plan-discuss 02 phase-01` |
   | 01-fix-null-check | done | 1 | — | — | fastapi | 2026-04-16 | — |

5. **Next action derivation** (use bare `NN` plan shortcut in printed commands):
   - Any ROADMAP phase row with no matching `phase-NN-*/PHASE.md` (stub — not yet finalized) → `/plan-discuss <NN> phase-NN` (lowest stub phase).
   - Else any ROADMAP row `status: planned` with deps satisfied → `/plan-run <NN>` (auto-picks next eligible).
   - Else → `—`.
   - Pre-NN legacy folders (no numeric prefix) → use full slug in printed commands (no shortcut available).
6. Highlight first `in-progress` plan with `→`. If none, highlight most-recent-created.
7. Print inbox line count if `.claude/plans/_inbox.md` exists: `Inbox: N ideas — read .claude/plans/_inbox.md`.
8. Warn if any folder missing `PRD.md` / `TECH-SPEC.md` / `ROADMAP.md` → `<slug>: malformed (missing <file>)`.
9. Integrity: phase folder exists without `PHASE.md` → flag `<slug>/phase-NN: malformed folder` + suggest `/plan-discuss <slug> phase-NN`.

## Output

Terse. No editorial. One table + one active-plan arrow. Cap at 20 rows; suggest `ls .claude/plans/` for more.

## When to use

Start of session to see open work. After `/clear` to resume. Before `/plan` to avoid duplicate slugs.

## Related

- `/plan <objective>` — create (PRD + TECH-SPEC + ROADMAP; no phase folders)
- `/plan-discuss <slug> [phase-NN]` — interactive iteration; phase mode materializes phase folder + PHASE.md
- `/plan-run <slug>` — execute next eligible phase (halts on stubs)

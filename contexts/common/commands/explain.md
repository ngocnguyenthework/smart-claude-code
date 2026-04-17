---
description: Concise structural walkthrough of code — what it does, key files, data flow, gotchas. Plan-aware: accepts a plan slug or phase to auto-scope to the files just touched. Uses code-explorer (haiku) with a hard output cap.
---

# /explain — Code walkthrough

Dispatches `code-explorer` to produce a compact, structured explanation. Token-capped. No file edits.

Pairs with `/plan-run`: after a phase finishes, `/explain <slug> phase-NN` walks through what the implementer just shipped.

## Usage

```
/explain <path|symbol|.>          # ad-hoc walkthrough
/explain <plan>                   # most-recent done phase of a plan
/explain <plan> phase-NN          # specific phase
/explain <plan> all               # whole plan — every done phase, stitched
```

`<plan>` accepts: full `NN-slug`, bare `NN` shortcut, or bare slug suffix. Resolution per `plan.md ## Slug resolution`.

**Examples:**
```
/explain src/auth/middleware.ts
/explain UserService.register
/explain .                       # whole repo (high-level only)
/explain 03                      # last done phase of plan 03 (NN shortcut)
/explain 03 phase-02             # phase 2 specifically
/explain 03-add-password-reset   # full NN-slug also accepted
```

## Behavior

### Path / symbol mode

1. Dispatch `code-explorer` (haiku) on target.
2. Enforce 400-word cap. Truncate if over.
3. Relay verbatim.

### Plan mode (`<plan>` / `<plan> phase-NN`)

1. Resolve `<plan>` per `plan.md ## Slug resolution`. Validate `.claude/plans/<NN-slug>/` exists. Error if missing.
2. Resolve target phase:
   - `phase-NN` → that file.
   - No phase arg → highest-numbered phase with `status: done` in PLAN.md table. Error if none done.
   - `all` → iterate every done phase.
3. Read phase file's `## Summary` block. Extract:
   - `files touched:` list
   - `commits:` list (for git-log fallback if Summary thin)
4. Also read `CONTEXT.md` for background (pass as agent input, not output).
5. Dispatch `code-explorer` scoped **only** to the touched files. Pass:
   - File list verbatim
   - Phase goal (from phase file `## Goal`)
   - Acceptance criteria touched by this phase
6. Same 4-section output (Overview / Key files / Data flow / Gotchas) — `Overview` references the phase goal.
7. Cap stays 400 words per phase. `all` mode produces one block per phase.

### Output sections (both modes)

```markdown
## Overview
(≤2 sentences — what this does/changed and why)

## Key files
- path:line — role (≤5 bullets)

## Data flow
(5-line trace OR ASCII arrow diagram — pick whichever clearer)

## Gotchas
- (≤3 bullets — non-obvious invariants, foot-guns, hidden deps)
```

## When to use

- Onboarding into unfamiliar code
- **After `/plan-run` completes a phase** — verify the implementer shipped what you expected
- Before `/plan` on a large change → grasp the area first
- After reading a PR → cross-check your understanding

## Related

- `/grill <slug> [phase-NN]` — quiz yourself instead of being taught
- `/plan-run <slug>` — the producer of phase Summaries this command reads
- `code-explorer` agent — deeper trace if `/explain` is too shallow

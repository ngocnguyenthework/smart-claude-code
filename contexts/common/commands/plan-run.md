---
description: Execute the next (or a specified) phase of a plan. Dispatches the stack implementer and automatically runs the matching reviewer(s) afterward.
---

# /plan-run — Execute a phase

Dispatches the stack implementer for one phase of a plan, then **automatically** runs the matching reviewer(s). Updates `PLAN.md` phase-table status + appends `## Summary` to the phase file (or to `PLAN.md ## Summary` for single-phase plans).

## Usage

```
/plan-run <slug>                 # picks the next phase with status=todo, respecting depends:
/plan-run <slug> phase-NN        # runs a specific phase
/plan-run <slug> --wave N        # runs all phases in wave N in parallel (deps must be done)
```

## Behavior

1. Read `.claude/plans/<slug>/PLAN.md`.
   - If it has a `## Phases` table → multi-phase plan. Pick target phase:
     - User-specified → use it. Error if status=done unless `--redo`.
     - Else → lowest `#` with `status: todo` and all `depends:` resolved to done.
   - If it has `## Steps` (no phase table) → single-phase plan. Run steps inline; no phase file.

1a. **Detect phase shape** (multi-phase only). Inspect the `File` column for the target phase row:
   - Flat file (e.g., `phase-01-schema.md`) → **small-mode** phase. Read phase file directly at `.claude/plans/<slug>/phase-NN-*.md`.
   - Folder (e.g., `phase-01-schema/`) → **large-mode** phase. Read the folder's **`PLAN.md`** at `.claude/plans/<slug>/phase-NN-*/PLAN.md`. Also read `GOAL.md` + `CONTEXT.md` (phase-scoped) for implementer context. The folder's `DISCUSSION.md` is passed for reference but not required reading.

1b. **Stub guard (large mode only).** If the target phase is a folder AND `GOAL.md` exists but `PLAN.md` is missing or the folder's `PLAN.md` frontmatter has `status: planning`, halt before the dirty-worktree check and call `AskUserQuestion`:
   ```
   question: "Phase <NN> is a stub — not yet deep-planned. What next?"
   options:
     - "Run /plan-phase <slug> phase-NN first"  (Recommended)
     - "Abort"
   ```
   On **Run /plan-phase** → print exact command for the user to invoke; exit. (Cannot chain into another slash command programmatically.) `/plan-run` re-invoked after `/plan-phase` completes.
   On **Abort** → exit.

1c. **Dirty worktree check (before dispatch).** Run `git status --porcelain`.
   - Ignore `.claude/plans/<slug>/**` entries (plan folder writes are expected).
   - If any OTHER tracked/untracked changes remain, **stop before dispatch** and call `AskUserQuestion` with a pre-generated suggestion:

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

   - On **Show suggested commit command** → print exact block, do NOT execute:

     ```
     Review diff first:
       git diff
       git status

     Then stage and commit (one line, no body):
       git add <paths>
       git commit -m "<type>: <summary>"
     ```

     Derive `<type>` from changed paths (`test/` → `test`, `docs/` or `*.md` only → `docs`, `*.tf`/`manifests/` → `chore`, rules/config → `chore`, source code → `feat` or `fix` per change intent, use `refactor` if pure rename/move). Summary ≤72 chars, lowercase after colon, no trailing period. **Never add body, footer, or `Co-Authored-By`** (rules: `.claude/rules/common/git-workflow.md`). Exit — user runs the commit manually, then re-invokes `/plan-run <slug>`.
   - On **Proceed anyway** → continue to step 2 with a note appended to `DISCUSSION.md`: "Phase <NN> started with dirty worktree — prior uncommitted changes mixed in."
   - On **Abort** → exit.

2. Also read `CONTEXT.md` — pass to implementer as background.
3. Mark target phase `status: wip` in `PLAN.md` phase table.
4. Detect stack (list `.claude/agents/`). Dispatch matching `<stack>-implementer` with:
   - **Phase brief** — source depends on phase shape:
     - Small-mode flat file → full contents of `phase-NN-*.md`.
     - Large-mode folder → full contents of `phase-NN-*/PLAN.md` (the implementer brief) **+** `phase-NN-*/GOAL.md` (for the goal/acceptance framing) **+** `phase-NN-*/CONTEXT.md` (phase-scoped constraints and prior-phase outputs).
     - Single-phase (no phase table) → `PLAN.md ## Steps` inline list.
   - Top-level `CONTEXT.md` content
   - Production-readiness mandate line (see plan.md)
   - Phase-discovery cap: **"You may ask at most ONE `AskUserQuestion` call with ≤2 questions mid-phase. If more are needed, the phase is mis-sized — stop, report back, and the orchestrator will route to `/plan-refine <slug> phase-NN` (small mode) or `/plan-phase-refine <slug> phase-NN PLAN` (large mode) to split."**

If the implementer hits the discovery cap, the orchestrator:
- Marks `status: blocked` in PLAN.md phase table with reason "phase too large — needs split"
- Skips reviewers
- Calls `AskUserQuestion`: `Split phase via /plan-refine` (small) / `/plan-phase-refine` (large) · `Answer questions inline and proceed` · `Abort`
5. After implementer returns, **auto-dispatch reviewers in parallel** (no user gate unless CRITICAL):
   - Always: `<stack>-reviewer`
   - If schema / migration touched: `+ database-reviewer`
   - If IaC touched: `+ infra-security-reviewer`
6. Gather verdicts. Append `## Summary` to the phase brief:
   - Small-mode flat file → append to `phase-NN-*.md`.
   - Large-mode folder → append to `phase-NN-*/PLAN.md` (same file the implementer executed against). **Do not write Summary into `GOAL.md`** — that stays stable across refines.
   - Single-phase → append to top-level `PLAN.md` under `## Summary`.

   Summary fields:
   - `commits:` (git log --oneline since phase start)
   - `files touched:` (from implementer report)
   - `deviations:` (anything that diverged)
   - `reviewer verdict:` per reviewer
7. Set `status: done` in top-level `PLAN.md` phase table (or `blocked` on CRITICAL). For large-mode phases, also update the phase folder's `GOAL.md` frontmatter `status` to match.
8. Append a dated entry to `DISCUSSION.md`:
   - Top-level `DISCUSSION.md` always for any deviation or reviewer finding crossing phase boundaries.
   - Large mode only: also append phase-scoped decisions to `phase-NN-*/DISCUSSION.md` (implementation-level, visible to `/plan-phase-refine` later).
9. On CRITICAL → `AskUserQuestion`: send back / fix manually / accept risk / abort.

9a. **Commit suggestion (user commits manually — never auto-executed).** Skip on CRITICAL/`blocked`. Before the post-phase gate, generate a one-line conventional commit based on the phase's `files touched` + phase intent, and print it for the user to verify + run themselves:

    ```
    Phase <NN> done. Review diff, then commit:

      git diff
      git add <files touched from phase Summary, space-separated>
      git commit -m "<type>: <summary>"
    ```

    Rules for the generated message (enforce `.claude/rules/common/git-workflow.md`):
    - **Type** derived from phase nature and touched paths:
      | Signal | Type |
      |---|---|
      | New endpoint / feature code / new module | `feat` |
      | Bug fix in existing code | `fix` |
      | Pure rename / move / structural cleanup, no behavior change | `refactor` |
      | Only tests added/changed | `test` |
      | Only `*.md` / `docs/` | `docs` |
      | `*.tf`, `manifests/`, `charts/`, CI config, `package.json` deps, linter config | `chore` |
      | Measurable perf change | `perf` |
      | CI/CD pipeline | `ci` |
    - **Summary** = phase title reshaped: lowercase after colon, imperative mood ("add", "wire", "migrate"), ≤72 chars total including `<type>: `, no trailing period.
    - **One line only.** No body. No bullet list. No `Co-Authored-By`. No `-m "title" -m "body"`.
    - **Never run `git push`.** Staging + committing is the endpoint of `/plan-run`.
    - If the phase touched multiple unrelated concerns (e.g. schema + unrelated bugfix), print **two** commit suggestions — one logical change per commit — and note: "Stage each group separately."

    Also append the suggested commit line (not the SHA — SHA unknown until user commits) to the phase `## Summary` under a new key `suggested commit:`. On next `/plan-run`, step 1c's dirty-worktree check will auto-detect if the user skipped committing.

10. **Post-phase gate** (skip on CRITICAL or `blocked`). Prepend one-line reminder above the question: **"Commit the phase (see command above) before picking Next phase — step 1c of the next `/plan-run` will halt on a dirty worktree."** Then call `AskUserQuestion`:
    ```
    question: "Phase <NN> done. What next?"
    options:
      - "Walk me through it (/explain <slug> phase-NN)"
      - "Quiz me on it (/grill <slug> phase-NN)"
      - "Next phase — fresh context (recommended): /clear then /plan-run <slug>"   # if more todo
      - "Next phase — same context (advanced)"                                      # if more todo
      - "Stop — I'll resume later"
    ```
    - On `/explain` or `/grill` → invoke command inline, then re-prompt same gate.
    - On **fresh context** (default) → print exact handoff banner:
      ```
      Phase <NN> done. To start phase <NN+1>:
        1. /clear           ← frees context window
        2. /plan-run <slug> ← resumes from phase table
      Plan state in .claude/plans/<slug>/ persists across /clear.
      ```
      Exit. (Cannot run `/clear` programmatically — must come from user.)
    - On **same context** → loop back to step 1 with next eligible phase. Use only when current context still small or phases tightly coupled.
    - On stop → exit with status banner naming next phase slug.
11. If no todo phases remain, replace both "Next phase" options with "Plan complete — close it" (sets PLAN.md `status: done`, no `/clear` suggestion).
12. Print next phase slug (or "plan complete" if last).

### Why /clear between phases (default)

Each phase is **self-contained** by planner contract — a fresh implementer reading only the phase brief + top-level `CONTEXT.md` + project rules has everything needed. The plan folder bridges state across `/clear` boundaries:

- Top-level `CONTEXT.md` — constraints, prior art (static)
- Top-level `DISCUSSION.md` — decisions log (append-only)
- Top-level `PLAN.md` — phase table with status (always current)
- Prior phase `## Summary` — what prior phases shipped:
  - Small mode → `phase-NN-*.md ## Summary`
  - Large mode → `phase-NN-*/PLAN.md ## Summary`

So the only thing `/clear` loses is conversation history — which is replayable from the plan folder. The win: full context window for the next implementer + reviewer pass. Skip `/clear` only when phases are tightly coupled (e.g., reviewer wants to compare diffs across two phases live).

### Large-mode flow (per phase)

```
/plan-phase <slug> phase-NN       # deep-dive plan (fills CONTEXT / PLAN / DISCUSSION inside folder)
(review phase PLAN.md, refine if needed via /plan-phase-refine)
/clear                             # optional but recommended — fresh context for execution
/plan-run <slug> phase-NN          # execute; halts with stub guard if PLAN.md missing
<commit manually>
/clear
/plan-phase <slug> phase-(NN+1)   # deep-dive next phase
...
```

Pattern: two `/clear`s per phase in large mode (once after planning, once after execution). Skip the first `/clear` when phase-planning is lightweight and context still small.

## Parallel waves

Phases sharing the same `wave:` in `PLAN.md` with satisfied deps are dispatched in parallel (independent implementers, single message with multiple Task calls).

## Related

- `/plan <objective>` — create plan (decides size + shape upfront)
- `/plan-phase <slug> phase-NN` — **large mode only.** Deep-dive plan for a stub phase. Required before `/plan-run` in large mode.
- `/plan-phase-refine <slug> phase-NN [GOAL|CONTEXT|PLAN|DISCUSSION]` — large mode only. Refine one file inside a phase folder.
- `/plan-refine <slug> [phase-NN]` — revise top-level plan, or a flat phase file (small mode)
- `/plans` — see current status (planning + execution progress)
- `/explain <slug> [phase-NN]` — walkthrough of what just shipped (offered at post-phase gate)
- `/grill <slug> [phase-NN]` — quiz yourself on what just shipped (offered at post-phase gate)

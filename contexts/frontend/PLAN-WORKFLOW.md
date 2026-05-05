# Plan Workflow

End-to-end guide for the `/plan` system: from one-line objective to merged code, across multiple phases and `/clear` boundaries.

Pairs with:
- `commands/plan.md` — orchestrator contract (bootstrap + stub phases)
- `commands/plan-discuss.md` — interactive Q&A to finalize (or iterate) phases + top-level
- `commands/plan-run.md` — phase execution contract
- `commands/plans.md` — plan index
- `agents/planner.md` — planner agent contract (bootstrap + interactive modes)
- `INTERNALS.md` — hooks / memory / safety

---

## Mental model

```
/plan <objective>
    │
    ▼
planner (Opus, bootstrap mode)
    │
    └── emits ONLY root: PRD.md · TECH-SPEC.md · ROADMAP.md
        (NO phase folders yet — ROADMAP lists phases as high-level H2 sections only)
    ▼
user approves top-level plan
    ▼
(loop per phase)
/plan-discuss <slug> phase-NN
    │
    ├── planner (Opus, interactive mode) runs own Silent Discovery + Q&A rounds (≤4)
    ├── user approves proposed content
    └── FIRST TIME: creates phase-NN-<name>/ folder + writes PHASE.md
                   (single file — Goal, Acceptance, Steps, Files Changed, Workflow,
                    Production Checklist, Decisions, Verify, Done When)
    ▼
/plan-run <slug> phase-NN
    │
    ├── implementer (Sonnet) — halts if phase folder / PHASE.md missing
    ├── auto-dispatched reviewers (parallel)
    └── Summary appended to PHASE.md ## Summary · commit suggestion printed
    ▼
user commits manually
    ▼
/clear → next phase
```

Three guarantees:
1. **You confirm every hand-off.** Planner → /plan-discuss → implementer → reviewer all gate on `AskUserQuestion`.
2. **Plan folder bridges `/clear`.** Conversation resets; plan state persists.
3. **Each phase is self-contained.** Fresh implementer reads only `phase-NN-*/PHASE.md` + root `PRD.md` + `TECH-SPEC.md` + project rules.

Key shift from older flows: **`/plan` never creates phase folders.** Phase content comes from `/plan-discuss phase-NN`, a mandatory interactive step that materializes the phase folder + `PHASE.md`. Rationale: step-by-step per-phase discussion produces better-sized, better-briefed implementer inputs than one-shot multi-phase generation. ROADMAP.md is intentionally high-level — each phase = one-sentence shippable feature chunk; deep dive deferred to `/plan-discuss`.

---

## File anatomy

Every plan is a folder under `.claude/plans/<slug>/`.

### Shape (uniform — single- and multi-phase)

```
.claude/plans/<slug>/
├── PRD.md          why · users/callers · goal · acceptance · scope · constraints · ## Decisions (ADR-style, append-only)
├── TECH-SPEC.md    architecture · ## System Workflow (whole-system ASCII diagram) · existing code · dependencies · production checklist · risks
├── ROADMAP.md      ## Phases table + per-phase H2 sections (one-sentence shippable outcome + Depends + Ships)
│                   (HIGH-LEVEL ONLY — no step detail, no file lists, no per-phase diagrams)
│
├── phase-01-<name>/                 ← created ONLY when /plan-discuss phase-01 runs
│   └── PHASE.md                     ← single file, all phase content:
│                                      ## Goal · ## Acceptance · ## Steps · ## Files Changed ·
│                                      ## System Workflow (phase ASCII, ≤30 lines) ·
│                                      ## Production Checklist · ## Decisions (Q&A log) ·
│                                      ## Verify · ## Done When · ## Summary (appended by /plan-run)
├── phase-02-<name>/
│   └── PHASE.md
└── ...
```

Plus `.claude/plans/_inbox.md` — flat scratchpad for ideas not yet planned.

Single-phase plans use the same three root files; the lone phase still gets a `PHASE.md` via `/plan-discuss <slug>` (no phase arg auto-promotes the lone phase).

### Shape decision (mechanical, no user gate)

`/plan` bootstrap emits exactly three root files regardless of phase count. Phase folders materialize lazily on first `/plan-discuss phase-NN`. >6 phases flags a risk in `TECH-SPEC.md ## Risks & Mitigations` but still appears as ROADMAP rows.

### `PRD.md` frontmatter (root)

```
slug:    <kebab>           e.g. add-password-reset
status:  planning | in-progress | done | blocked
created: YYYY-MM-DD
stack:   fastapi | nestjs | frontend | devops
agent:   <implementer-name>
```

### `PHASE.md` frontmatter (phase folder)

```
plan:     <slug>
status:   planning | planned | wip | done | blocked
depends:  — | <phase-number>
wave:     <number>
agent:    <implementer-name>
```

Phase status lifecycle: `planning` (ROADMAP row exists, no phase folder yet) → `planned` (/plan-discuss finalized — PHASE.md written) → `wip` (/plan-run started) → `done` (/plan-run completed) — or `blocked` on CRITICAL finding.

---

## The happy path

```
1. /plans                                    see what's open, avoid duplicate slug
2. /plan <objective>                         planner drafts PRD + TECH-SPEC + ROADMAP (no phase folders)
3. /plan-discuss <slug> phase-01             interactive Q&A, creates phase-01 folder + PHASE.md
4. /plan-run <slug> phase-01                 execute phase 1 — implementer + auto reviewer
5. (commit phase 1 manually)                 use suggested command
6. /clear                                    fresh context window
7. /plan-discuss <slug> phase-02             materialize + finalize phase 2
8. /plan-run <slug> phase-02                 execute phase 2
9. ...repeat 5–8 until done
10. PRD.md status: done                      orchestrator marks it
```

Two `/clear`s per phase (after finalize, after execute) is standard — context window is the bottleneck. Skip the inner `/clear` (between `/plan-discuss` and `/plan-run`) only when phase finalization was lightweight.

---

## Step-by-step

### 1. Create the plan — `/plan <objective>`

**Prompt shape:**
```
/plan <one-line objective>
  - Constraints: <reuse X / don't touch Y / deadlines>
  - Done when: <specific testable outcome>
```

**Good:**
```
/plan Users can reset their password via email link.
  - Reuse existing mailer service in src/services/mailer.py
  - Don't change auth schema unless necessary
  - Done when: integration test covers request → email → set-new-password round-trip
```

**Bad:**
```
/plan add password reset       ← no constraints, no done-criteria — planner will guess
```

**What happens:**
1. Orchestrator detects stack (lists `.claude/agents/`).
2. Dispatches `planner` (Opus) in bootstrap mode. Planner does silent discovery (reads codebase + rules + inbox), then asks **at most one** `AskUserQuestion` with ≤4 batched questions if gaps remain.
3. Planner emits exactly three root files:
   - `PRD.md` (why, goal, acceptance, scope, constraints, Decisions log)
   - `TECH-SPEC.md` (architecture, whole-system workflow diagram, dependencies, production checklist, risks)
   - `ROADMAP.md` (phase table + per-phase H2 sections — one-sentence shippable outcome each)
   No phase folders at this point.
4. Orchestrator scans root files for production red flags (`TODO(prod)`, hardcoded env values, dev-only branches, anti-patterns). On hit → loops back to planner.
5. Presents top-level + opens approval gate.

**Approval gate options:**
- `Approve — start /plan-discuss on phase-01`
- `Refine top-level (/plan-discuss <slug>)`
- `Abort`

Plan mode session (`Shift+Tab` before `/plan`) upgrades first gate to `ExitPlanMode` native UI.

### 2. Finalize the phase — `/plan-discuss <slug> phase-NN`

**Required before `/plan-run` on any phase.** `/plan` only produces root files; phase folders don't exist yet. `/plan-run` halts until `phase-NN-*/PHASE.md` exists.

```
/plan-discuss <slug> phase-01
```

**What happens:**
1. Validates phase row exists in `ROADMAP.md ## Phases` table. Refuses re-discuss on `done`/`wip` phase without `--force`.
2. Reads bundle: root `PRD.md` + `TECH-SPEC.md` + `ROADMAP.md` (phase H2 section as seed) + existing `PHASE.md` if present + prior done phases' `PHASE.md ## Summary` blocks + project rules.
3. Dispatches `planner` (Opus) in interactive mode. Since ROADMAP H2 is intentionally high-level (one-sentence ship), planner runs its **own Silent Discovery** (grep reusable modules, read prior PHASE.md summaries, check repo rules) before Q&A. Then:
   - Calls `AskUserQuestion` with 1-4 batched questions per round
   - After user's answers, either proposes file content OR asks another round (max 4 rounds)
4. Orchestrator relays each round. At 4-round cap, prompts user: *"Continue / Propose now / Pause / Abort."*
5. When planner signals "enough context," returns proposed `PHASE.md` content (all sections inline).
6. Orchestrator runs **red-flag scan** on proposed `PHASE.md` (same rules as root). Hit → loops back.
7. Presents proposed content to user:
   ```
   options:
     - "Approve — write PHASE.md"
     - "Refine — another round"
     - "Refine a specific section (Goal / Steps / Workflow / Decisions)"
     - "Abort — discard"
   ```
8. On approve → creates `phase-NN-<name>/` folder (first time) + writes `PHASE.md`. Sets `status: planned` in PHASE.md frontmatter AND in ROADMAP.md `## Phases` table row.
9. Exit banner suggests `/plan-run <slug> phase-NN`.

**Top-level iteration (no phase arg):** `/plan-discuss <slug>` iterates `PRD.md` / `TECH-SPEC.md` / `ROADMAP.md` interactively — same Q&A loop scoped to the file(s) user picks. For single-phase plans, no-phase-arg mode auto-promotes the lone phase to PHASE.md.

### 3. Run the phase — `/plan-run <slug>`

```
/plan-run <slug>                 picks lowest-numbered todo phase with deps satisfied
/plan-run <slug> phase-NN        runs a specific phase
/plan-run <slug> --wave N        parallel-dispatches every phase in wave N (deps must be done)
/plan-run <slug> phase-NN --redo rerun a done phase (invalidates Summary)
```

**What happens:**
1. **Stub guard.** If target phase folder missing OR `PHASE.md` missing OR `status: planning`, halts: *"Run /plan-discuss <slug> phase-NN first"* + exit.
2. **Dirty worktree check.** `git status --porcelain` — if non-plan-folder changes exist, halts and offers pre-generated commit suggestion (one-line conventional commit). Never auto-executes.
3. Marks target phase `status: wip` in `ROADMAP.md ## Phases` table + `PHASE.md` frontmatter.
4. Dispatches `<stack>-implementer` (Sonnet) with: full `PHASE.md`, root `PRD.md` + `TECH-SPEC.md`, production-readiness mandate, dependency anti-circumvention (re: `TECH-SPEC.md ## Dependencies`), **mid-phase discovery cap of 1 `AskUserQuestion` × 2 questions**.
5. If implementer hits cap → phase marked `blocked: "phase too large — needs refine"` in ROADMAP + PHASE.md, reviewers skipped, gate offers `/plan-discuss <slug> phase-NN` for split/refine.
6. **Auto-dispatches reviewers in parallel** (no user gate unless CRITICAL):
   - Always: `<stack>-reviewer`
   - + `database-reviewer` if schema/migration touched
   - + `infra-security-reviewer` if IaC touched
7. Appends `## Summary` to `PHASE.md`: `commits:`, `files touched:`, `deviations:`, `reviewer verdict:`, `suggested commit:`, updated post-execution ASCII workflow.
8. Sets phase `status: done` (or `blocked` on CRITICAL) in ROADMAP row + PHASE.md frontmatter.
9. Appends dated entry to `PRD.md ## Decisions` (cross-phase impact) or `PHASE.md ## Decisions` (phase-scoped) for any deviation.
10. Prints commit suggestion (one logical change = one commit).
11. Opens post-phase gate.

### 4. Commit the phase — manually

After every successful `/plan-run`, orchestrator prints:

```
Phase 02 done. Review diff, then commit:

  git diff
  git add src/services/mailer.py src/routes/password_reset.py
  git commit -m "feat: add password reset request endpoint"
```

**Rules** (enforced by suggestion generator + `rules/common/git-workflow.md`):
- One-line conventional commit. **No body. No footer. No `Co-Authored-By`.**
- Type derived from touched paths: `feat` for new code, `fix` for bug fixes, `refactor` for pure renames/moves, `test`/`docs`/`chore`/`perf`/`ci` for obvious cases.
- Lowercase after colon, no trailing period, ≤72 chars.
- **Never `git push`.** Push is your call.

**You** run the commit. Orchestrator never auto-commits — keeps you in the diff.

### 5. Post-phase gate — pick next move

```
question: "Phase 02 done. What next?"
options:
  - "Walk me through it (/explain <slug> phase-02)"
  - "Quiz me on it (/grill <slug> phase-02)"
  - "Next phase — fresh context (recommended): /clear then /plan-discuss <slug> phase-03"
  - "Next phase — same context (advanced)"
  - "Stop — I'll resume later"
```

The *"Commit the phase before picking Next phase"* reminder appears above — step 2 of next `/plan-run` halts on dirty worktree.

### 6. `/clear` between phases (default)

Why: each phase is self-contained. Plan folder bridges state across `/clear`:
- `PRD.md` — constraints + success criteria (static) + `## Decisions` (append-only log)
- `TECH-SPEC.md` — architecture + dependencies + production checklist (static)
- `ROADMAP.md` — phase table with status (live)
- Prior `phase-NN-*/PHASE.md ## Summary` — what prior phases shipped

What `/clear` loses: conversation history (replayable from plan folder).
What `/clear` wins: full context window for next `/plan-discuss` + implementer + reviewer.

**Skip `/clear` only when phases are tightly coupled** (reviewer comparing diffs live).

---

## Sibling commands

| Command | Purpose |
|---|---|
| `/plans` | List all plan folders + status (planning + execution progress). Use at session start. |
| `/plan-discuss <slug>` | Interactive Q&A to iterate root `PRD.md` / `TECH-SPEC.md` / `ROADMAP.md`. |
| `/plan-discuss <slug> phase-NN` | Interactive Q&A to **materialize** a phase (creates folder + writes `PHASE.md`) or iterate an existing one. Required before `/plan-run`. |
| `/plan-run <slug>` | Execute next eligible phase (auto-picks). Halts on stub phase. |
| `/plan-run <slug> phase-NN` | Run specific phase. |
| `/plan-run <slug> --wave N` | Parallel-dispatch all phases in wave N. |
| `/explain <slug> [phase-NN]` | Code-explorer walkthrough scoped to phase's `files touched`. Cap 400 words. |
| `/grill <slug> [phase-NN]` | 3–4 quiz questions on the phase. Surfaces what you don't know. |
| `/do <objective>` | Fast path — skips planning. For 1–3 file tasks. No plan folder. |

Retired commands (replaced by `/plan-discuss`): `/plan-refine`, `/plan-phase`, `/plan-phase-refine`. All iteration now flows through `/plan-discuss`.

---

## Decision tree: which command?

```
Is this 1–3 files of well-understood work?
├── Yes → /do <objective>
└── No → /plan <objective>   (planner drafts PRD + TECH-SPEC + ROADMAP; no phase folders)
    → /plan-discuss <slug> phase-NN to materialize each phase folder + PHASE.md

Already have a plan? Want to adjust it?
├── Root stale (PRD / TECH-SPEC / ROADMAP) → /plan-discuss <slug>
├── Phase never materialized (ROADMAP row but no phase folder) → /plan-discuss <slug> phase-NN
├── Phase materialized but needs adjustment → /plan-discuss <slug> phase-NN (iterate PHASE.md)
├── Phase already done, want to re-run → /plan-run <slug> phase-NN --redo
└── Just lost context → /plans, then /plan-discuss or /plan-run

Just finished a phase?
├── Want to verify what shipped → /explain <slug> phase-NN
├── Want to test your understanding → /grill <slug> phase-NN
└── Ready for next:
    ├── Commit first (use suggested command)
    ├── /clear
    └── /plan-discuss <slug> phase-(NN+1), then /plan-run
```

---

## Single-phase plans

When the planner produces 1 phase, root layout is identical (`PRD.md` + `TECH-SPEC.md` + `ROADMAP.md`). ROADMAP lists the lone phase as one H2 section. `/plan-discuss <slug>` (no phase arg) auto-promotes the lone phase — same Q&A loop, produces `phase-01-<name>/PHASE.md`. From there, `/plan-run <slug>` runs that phase; Summary appends to `PHASE.md ## Summary`.

---

## Multi-phase parallel waves

Phases sharing the same `wave:` value in `ROADMAP.md ## Phases` with all deps satisfied can be parallel-dispatched:

```
| # | Title    | Depends | Status  | Wave |
|---|----------|---------|---------|------|
| 1 | Schema   | —       | done    | 1    |
| 2 | Mailer   | 1       | planned | 2    |
| 3 | Endpoints| 1       | planned | 2    |
```

Phase 1 done, phases 2 + 3 both materialized with `PHASE.md` + `status: planned` → eligible for parallel:

```
/plan-run <slug> --wave 2
```

Orchestrator dispatches both implementers in a single message (parallel Task calls). Reviewers run after each completes. **All phases in wave must have PHASE.md written before dispatch.** Use only when truly independent — file overlap = serialize.

---

## Common situations

### CRITICAL reviewer finding

`/plan-run` halts before post-phase gate:

```
question: "Reviewer flagged CRITICAL issues. What next?"
options:
  - "Send findings back to implementer for a fix pass"
  - "Fix manually — I'll handle it"
  - "Accept risk and proceed to commit"
  - "Abort"
```

Phase stays `wip` (or `blocked` on abort). `ROADMAP.md` + `PHASE.md` reflect truth.

### Phase turned out too big

Implementer hits mid-phase discovery cap (>1 `AskUserQuestion`, or >2 questions). Orchestrator marks phase `blocked: "phase too large — needs refine"`, skips reviewers, offers:

```
options:
  - "Refine via /plan-discuss <slug> phase-NN"
  - "Answer questions inline and proceed"
  - "Abort"
```

`/plan-discuss` is the right call most of the time — split the phase or refine the brief. Answer-inline only when questions are genuinely small and known.

### New constraint discovered mid-plan

Reviewer flagged design flaw, or you learned something the original plan didn't cover:

```
/plan-discuss <slug>            # iterate root — add constraint, restructure ROADMAP phase table if needed
/plan-discuss <slug> phase-NN   # iterate a specific phase's PHASE.md
```

The interactive loop appends a dated entry to `PRD.md ## Decisions` (cross-phase) or `PHASE.md ## Decisions` (phase-scoped) automatically. Already-`done` phases never flip back to `planned` without `--force` + explicit confirmation.

### Resuming after a long break

```
/plans                              see status of every folder
/plan-discuss <slug> phase-NN       if next phase has no folder / PHASE.md yet
/plan-run <slug>                    auto-picks next eligible
```

Plan folder is the source of truth. `/clear` history is irrelevant.

### Out-of-scope idea while planning

Append to `.claude/plans/_inbox.md` as single line. Next `/plan` reads inbox during silent discovery.

---

## Production-readiness mandate

Every plan must produce production-ready code on first pass. Enforced at multiple points:

1. **Planner instructions (bootstrap + interactive modes)** — appended verbatim by orchestrator.
2. **Pre-approval scans** — orchestrator greps root `PRD.md` / `TECH-SPEC.md` / `ROADMAP.md` + phase `PHASE.md` (from `/plan-discuss`) for `TODO(prod)`, `FIXME(prod)`, `handle in prod later`, hardcoded URLs/keys, dev-only branches, anti-patterns. On hit → loops back to planner.
3. **Implementer instructions** — appended verbatim by `/plan-run`.

Plans must cover:
- env-driven config (no hardcoded per-env values)
- secrets via secret manager / env vars
- observability (logs / metrics / error reporting)
- migrations expand → backfill → contract
- rollout / rollback path
- timeouts + retries on external calls
- auth + input validation + least-privilege RBAC

Throwaway spike? Say so in objective — planner records trade-off in `PRD.md ## Decisions`, red-flag scan skipped.

---

## What `/plan` is *not* for

- **Single-line edits / typo fixes** — just edit.
- **One-file clarifications** — just ask.
- **Build/type errors only** — use `/build-fix` (calls stack-specific `build-error-resolver`).
- **Dead-code cleanup only** — use `/refactor-clean`.
- **Reviewing an existing diff** — use `/code-review`.

`/plan` shines when work spans >1 file and benefits from phase tracking that survives `/clear`.

---

## Cheat sheet

```
# Start of session
/plans                                  see what's open (planning + execution progress)

# New work
/plan <objective>                       create folder; PRD + TECH-SPEC + ROADMAP (no phase folders)
/plan-discuss <slug> phase-01           interactive Q&A — materialize phase 1 folder + PHASE.md
/plan-run <slug> phase-01               run phase 1 (auto-reviewer)
<commit manually>                       one-line conventional, no body
/clear                                  free context window
/plan-discuss <slug> phase-02           materialize + finalize phase 2
/plan-run <slug> phase-02               run phase 2
...

# Mid-stream adjustments
/plan-discuss <slug>                    iterate root (PRD / TECH-SPEC / ROADMAP)
/plan-discuss <slug> phase-02           iterate a phase (materialize or refine PHASE.md)

# After a phase
/explain <slug> phase-NN                walkthrough (≤400 words)
/grill <slug> phase-NN                  3–4 quiz questions

# Fast path (no plan folder)
/do <objective>                         1–3 files, well understood
```

---

## Related

- `commands/plan.md` — orchestrator full contract (root emit only, no phase folders)
- `commands/plan-discuss.md` — interactive Q&A full contract (root iteration + phase materialization)
- `commands/plan-run.md` — phase execution full contract (stub guard + PHASE.md sourcing)
- `commands/plans.md` — index command with planning + execution progress
- `commands/do.md` — fast path
- `commands/explain.md` / `commands/grill.md` — post-phase companions
- `agents/planner.md` — planner agent (Opus) full prompt (bootstrap + interactive modes)
- `rules/common/git-workflow.md` — commit format the suggestion generator follows
- `INTERNALS.md` — hooks, memory, safety guardrails

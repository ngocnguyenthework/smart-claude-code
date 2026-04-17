---
description: Quiz the user about freshly implemented code. Plan-aware — `<slug>` reads the most-recent done phase's Summary to scope questions to what was just shipped. Uses AskUserQuestion to ask 3-4 targeted questions about invariants, edge cases, and design choices. Reveals misconceptions before commit.
---

# /grill — Quiz the user

Claude asks the user pointed questions about the code in front of them. Not for Claude to answer — for the **user** to think through. Catches misunderstandings early.

Pairs with `/plan-run`: after a phase finishes, `/grill <slug> phase-NN` pressure-tests your mental model of what was just shipped.

## Usage

```
/grill <path>                     # ad-hoc — file or folder
/grill <plan>                     # most-recent done phase of a plan
/grill <plan> phase-NN            # specific phase
/grill last                       # code from the most recent implementer run this session
```

`<plan>` accepts: full `NN-slug`, bare `NN` shortcut (`/grill 03`), or bare slug suffix. Resolution per `plan.md ## Slug resolution`.

## Behavior

### Resolve scope

| Form | Reads |
|---|---|
| `<path>` | The file/folder. Cap 2 files / 500 lines — if larger, ask user to narrow. |
| `<plan>` | Resolve per slug resolver. `.claude/plans/<NN-slug>/PLAN.md` → phase table → highest-numbered phase with `status: done` → that phase file's `## Summary` → `files touched:` list. |
| `<plan> phase-NN` | That specific phase's Summary `files touched:`. Error if phase not `done`. |
| `last` | Files from the most recent implementer report in the current session. |

For plan modes, also read PLAN.md `## Acceptance` and the phase's `## Goal` — questions hook into stated acceptance criteria, not random invariants.

### Question generation

Claude generates **3-4 questions** drawn from the actual code + plan context:

- **Invariants** — "what breaks if `<X>` is null / empty / duplicate?"
- **Edge cases** — "concurrent request to this endpoint — what happens?"
- **Design choices** — "why this approach over `<alternative>`?" (especially trade-offs noted in `DISCUSSION.md`)
- **Failure modes** — "if `<dependency>` times out, what does the user see?"
- **Acceptance hooks** (plan mode only) — "phase Acceptance says `<criterion>` — which line enforces it?"

### Ask + grade

3. Invoke `AskUserQuestion` with all questions in one call (no multiSelect). 2-4 options per question — one correct, others plausible-but-wrong.
4. After user answers, grade in ≤200 words:
   - Mark each Q correct / partial / wrong
   - Explain the intended answer with `file:line` citations
   - If ≥2 wrong → suggest `/explain <slug> phase-NN` (or `/explain <path>`) to recover, or `doc-updater` to add clarifying comments
5. No file edits unless user explicitly asks.

## When to use

- **After `/plan-run` finishes a phase** — verify your mental model matches code before moving on
- Before committing security-sensitive code — pressure-test assumptions
- Onboarding — paired with `/explain`

## Related

- `/explain <slug> [phase-NN]` — Claude teaches (companion to this command)
- `/plan-run <slug>` — the producer of phase Summaries this command reads

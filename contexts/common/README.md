# common — universal workflows

The baseline bundle. **Always installed** with every `--context` selection. Ships the generalist agents, workflow commands, safety hooks, session memory, and the universal prompt patterns you'll use across every stack.

**Companion docs in `.claude/docs/`:**
- `INTERNALS.md` — hook lifecycle, session memory, safety guardrails, model routing
- `<ctx>-README.md` — stack-specific scenarios (e.g. `fastapi-README.md`)

---

## What this ships

| Folder | What's in it |
|---|---|
| `agents/` | 8 generalist agents (architect, planner, code-reviewer, code-explorer, refactor-cleaner, performance-optimizer, doc-updater, docs-lookup) |
| `commands/` | 12 workflow commands (`/plan`, `/plans`, `/plan-discuss`, `/plan-run`, `/do`, `/explain`, `/grill`, `/code-review`, `/refactor-clean`, `/build-fix`, `/checkpoint`, `/learn`, `/prompt-optimize`) |
| `rules/common/` | cross-cutting style + security + testing rules |
| `skills/` | 19 shared skills (agentic engineering, verification loops, codebase onboarding, autonomous loops, deep research, etc.) |
| `contexts/` | `dev.md`, `research.md`, `review.md` session framings |
| `settings.json` | baseline hook registrations |
| `mcp-servers.json` | general-purpose MCP servers |

---

## Setup

```bash
# Once, somewhere:
git clone <repo-url> ~/tools/smart-claude

# In any project:
cd ~/code/my-project
~/tools/smart-claude/install.sh --context common
claude
```

Recommended shell aliases (add to `~/.zshrc` / `~/.bashrc`):

```bash
alias claude-dev='claude --append-system-prompt "$(cat .claude/contexts/dev.md 2>/dev/null)"'
alias claude-research='claude --append-system-prompt "$(cat .claude/contexts/research.md 2>/dev/null)"'
alias claude-review='claude --append-system-prompt "$(cat .claude/contexts/review.md 2>/dev/null)"'
```

---

## The 5-phase pipeline

Every feature follows this shape. Each phase has one clear output that becomes the next phase's input.

```
1. RESEARCH    → Explore agent (read-only)       → findings
2. PLAN        → planner (Opus) via /plan        → plan with phases + risks
3. IMPLEMENT   → you + stack reviewer            → code changes
4. REVIEW      → /code-review                    → CRITICAL/HIGH/MEDIUM findings
5. VERIFY      → /build-fix or test run          → green build
```

**Eval-first principle** — before Phase 3, write down the one test or observable behaviour that will prove the feature works. This prevents scope drift and makes Phase 5 unambiguous.

---

## Universal workflows

### 1. New feature (any stack)

**When:** You know what you want to build; unclear on the how.

```
1. claude-dev
2. /plan "<one-line objective>"                    # planner agent proposes phases (folder created)
3. /plan-run <slug>                                # runs ONE phase — auto reviewer
   ↳ post-phase gate: /explain · /grill · /clear+next · stop
4. /clear                                          # free context between phases (recommended)
5. /plan-run <slug>                                # next phase — fresh context window
   ↳ repeat 4-5 until plan complete
6. /code-review                                    # before opening PR
7. /build-fix                                      # if TS/build errors
8. Commit with conventional message
9. /learn                                          # optional — extract reusable pattern
```

**One phase per conversation (default).** Plan folder (`.claude/plans/<slug>/`) persists across `/clear`. Each phase file is self-contained — a fresh implementer reading `CONTEXT.md` + the phase file + project rules has everything needed. The trade is: lose conversation history, gain a full context window for the next implementer + reviewer pass. Skip `/clear` only when phases are tightly coupled (e.g., reviewing diffs across two phases live).

**Effective prompt:**
```
/plan Users can reset their password via email link.
  - Flow: request → tokenized email → set new password page.
  - Reuse existing mailer service. Don't change auth schema unless necessary.
  - Define done: integration test covers the full round-trip.
```

**Anti-pattern:**
```
/plan add password reset   ← too vague, planner will make assumptions
```

---

### 2. Bug fix

**When:** Something is broken. You have a repro or an error message.

```
1. claude-dev
2. Paste the error + minimal repro steps
3. Ask Claude: "find the root cause before suggesting a fix"
4. Write a failing test that captures the bug
5. Fix
6. Verify test passes
7. /code-review
8. Commit: "fix: <terse description>"
```

**Effective prompt:**
```
The /api/orders endpoint returns 500 when the cart is empty.
Stack trace:
  <paste>
Repro: POST /api/orders with an empty items array.
Find the root cause first — don't suggest a fix until we know why.
Then write a failing test, then fix.
```

**Why "root cause first"** — without that instruction, models often patch the symptom (`if items.length === 0 return []`) and miss the underlying invariant violation (the cart shouldn't be empty in this path — something upstream is wrong).

---

### 3. Planning

**When:** You're about to spend more than ~30 minutes on something. Use `/plan` so the planner agent breaks it into phases you can confirm before any code is written.

The planner:
- Restates the objective in its own words (catches misunderstanding early)
- Proposes phases (usually 3–5) with the file/module each phase touches
- Flags risks and dependencies
- Suggests the smallest testable first cut

**You should push back when:**
- A phase is too large to finish in one sitting
- The planner assumed a library or pattern without saying so
- The risk section is empty (there are always risks)

---

### 4. Root-cause analysis

**When:** Intermittent bug, flaky test, mysterious perf regression, or "it works for me".

```
1. claude-research    # don't let Claude touch code yet
2. Describe the symptom as precisely as you can — what's expected, what's observed, what's consistent across repros
3. Ask: "trace the code path from X to Y and list all the places where this assumption could break"
4. Keep asking "what else could cause this?" until the hypotheses dry up
5. Rank by likelihood + reversibility of fix
6. Only then switch to claude-dev to fix the top candidate
```

**Effective prompt:**
```
Flaky test: tests/auth.test.ts "refresh token rotation" fails ~20% of runs on CI, never locally.
Error: "Expected token X, got token Y".
Constraints: CI uses Postgres 16 in a container, local uses sqlite.
Before suggesting any fix, trace the full refresh-token lifecycle and list every place where DB/timing/concurrency could cause divergence.
```

---

### 5. Code review

**When:** Before opening a PR, or when reviewing someone else's (or Claude's) work.

```
1. claude-review
2. /code-review           # runs on uncommitted changes by default
   OR paste the diff / PR URL for a reviewer pass
3. Triage: CRITICAL → fix now, HIGH → fix before merge, MEDIUM → ticket
4. Re-run /code-review after fixes to verify
```

**What the reviewer focuses on:**
- Invariants the implementer may have assumed away
- Error boundaries — what happens off the happy path
- Security / auth assumptions (especially implicit trust)
- Hidden coupling that makes rollback hard

**Skips:** style disagreements already enforced by formatter/linter.

---

### 6. Refactor

**When:** You want to improve structure without changing behaviour. **Not** for bug fixes or new features.

```
1. /refactor-clean
   SAFE tier:    unused imports, dead variables       → auto-applied
   CAUTION tier: unused exports, deprecated funcs     → confirm each
   DANGER tier:  large structural removal             → explicit approval
2. Run tests between tiers (the command does this automatically)
3. Commit: "refactor: <what changed>"
```

**Effective prompt for targeted refactors:**
```
Rename `UserService.getUser` → `UserService.findById`. Update every caller.
Behaviour must stay identical — no signature changes, no early returns added.
Run tsc + tests after.
```

---

### 7. Documentation sync

**When:** You shipped a change that touches a user-facing API or behaviour.

```
1. doc-updater agent (via Task tool or just "ask the doc-updater to...")
   "We renamed /api/v1/users → /api/v2/users with different pagination.
    Update README, CHANGELOG, and any SDK docs. Don't touch internal design docs."
2. Review the diff — doc-updater occasionally hallucinates prior text.
3. Commit: "docs: <what synced>"
```

---

### 8. Exploring an unfamiliar codebase

**When:** You've just cloned a repo or opened a module you've never touched.

```
1. claude-research
2. Run the code-explorer: "give me an architecture map of src/ — entry points, major subsystems, data flow"
3. Read the top-scored findings yourself (don't trust a summary for design decisions)
4. /checkpoint research-$(basename $PWD)   # save findings
5. Switch to claude-dev when ready to change things
```

**Progressive retrieval** — for large codebases, the `search-first` skill uses a DISPATCH → EVALUATE → REFINE → LOOP cycle:

```
Cycle 1: broad keywords → score each file 0-1 for relevance
Cycle 2: add terminology discovered in Cycle 1, exclude confirmed-irrelevant paths
Cycle 3: fill remaining gaps

Stop when ≥3 high-relevance files (≥0.7 score) AND no critical gaps.
```

If Cycle 1 returns nothing, the codebase uses different terminology than you expected — Cycle 1 reveals that.

---

### 9. Autonomous loop (scripted / overnight)

**When:** You have a spec and want Claude to iterate unattended. Each step gets a fresh context window; state bridges via the filesystem.

```bash
#!/bin/bash
set -e
claude -p "Read docs/spec.md. Implement per TDD in src/."
claude -p "De-sloppify pass: remove tests that verify language behaviour, defensive checks for impossible states, console.log. Keep business-logic tests."
claude -p "Run build + lint + tests. Fix failures only. No new features."
claude -p "Create a conventional commit: 'feat: <summary>'"
```

**Rules:**
- Always set an exit condition (`--max-runs N`, `--max-cost $X`, or a completion signal).
- Use a separate **de-sloppify pass** instead of constraining the implementer with negative instructions. Negative instructions degrade overall quality; a separate cleanup pass doesn't.
- Bridge context via `SHARED_TASK_NOTES.md` or the `.claude/.storage/` session files.

Full patterns live in the `autonomous-loops` skill.

---

## Commands

### `/plan`

Invokes the planner agent (Opus).

**Use when:** any task longer than ~30 minutes.

**Prompt shape:**
```
/plan <one-line objective>
  - Constraints: <reuse X / don't touch Y / must be done by Z>
  - Done when: <specific testable outcome>
```

**Produces:** phased plan with risks, dependencies, and the smallest testable first cut. Asks before writing any code.

---

### `/code-review`

Invokes the code-reviewer (Sonnet). Reviews uncommitted changes by default.

**Use when:** about to open a PR; after a big Claude-generated change.

**Prompt shape:**
```
/code-review
  [optional] focus on: security, performance, correctness
  [optional] context: this is the auth flow — be paranoid about implicit trust
```

**Produces:** CRITICAL / HIGH / MEDIUM findings. Skips style issues already caught by linters.

---

### `/refactor-clean`

Invokes the refactor-cleaner (Sonnet). Uses knip / depcheck / ts-prune / ruff to find dead code.

**Use when:** you want to delete unused code safely. **Not** for feature work.

**Produces:** diffs in three tiers (SAFE / CAUTION / DANGER). Runs tests between tiers.

---

### `/build-fix`

Detects the build system and invokes the **stack-specific `build-error-resolver`** (Sonnet) — Python variant for FastAPI, TypeScript/React variant for frontend, TypeScript/Nest variant for NestJS. Minimal diffs, no architectural changes.

**Use when:** `tsc` / `mypy` / `ruff` / `build` / CI is red and you want the root cause fixed, not silenced.

**Prompt shape:**
```
/build-fix
  [optional] error: <paste log>
```

**What it won't do:** suppress errors with `@ts-ignore`, `as any`, `# type: ignore`, or `# noqa` unless you explicitly allow it.

---

### `/explain` and `/grill`

Companions to `/plan-run`. After a phase finishes, the post-phase gate offers both:

- **`/explain <slug> [phase-NN]`** — code-explorer (Haiku) gives a 4-section walkthrough (Overview / Key files / Data flow / Gotchas), scoped to the phase's `files touched` from its Summary. Cap 400 words.
- **`/grill <slug> [phase-NN]`** — Claude asks 3-4 pointed questions about invariants, edge cases, design choices, and acceptance criteria. You answer via `AskUserQuestion`; Claude grades and cites file:line.

Both also accept ad-hoc targets: `/explain <path|symbol>` and `/grill <path|last>`.

**Why both** — `/explain` teaches; `/grill` tests. Use `/grill` first to surface what you don't know, then `/explain` to fill the gap.

---

### `/checkpoint`

**Use when:** pausing work mid-feature. Saves state (todo, next steps, key files) to `.claude/.storage/` so you can resume later.

**Prompt shape:**
```
/checkpoint <name>        # save
/checkpoint list          # show saved checkpoints
/checkpoint restore <name>
```

---

### `/learn`

**Use when:** you just solved a gnarly problem and want the solution to be reusable next time. Extracts the pattern into `.claude/.storage/skills/learned/`.

**Prompt shape:**
```
/learn
  Title: <one line>
  Pattern: <what applies in future>
  Example: <minimal code or steps>
```

Triggered automatically by the `evaluate-session.js` hook for sessions ≥10 messages.

---

### `/prompt-optimize`

**Use when:** tightening an agent instruction, skill description, or a prompt file you'll reuse.

**Produces:** token-diet rewrite with identical behaviour. Flags ambiguity.

---

## Prompt patterns

These apply to every stack. Stack-specific phrasings live in each context's own README.

### Pattern: objective + constraints + done

```
<one-line objective>
- Constraint: <must-preserve behaviour>
- Constraint: <must-not-touch area>
- Done when: <testable outcome>
```

Forces Claude to commit to a definition of success.

---

### Pattern: "before suggesting a fix"

```
<symptom>
Before suggesting a fix, <trace / hypothesize / enumerate>.
```

Stops the "here's a patch" reflex. Use for bugs, flaky tests, perf regressions.

---

### Pattern: paired context

```
<task>
Context you need:
  - <file path> — <why it matters>
  - <file path>
Convention you should follow: <link to doc or one-line rule>
```

Saves the model from guessing.

---

### Pattern: bounded scope

```
<task>
DO:
  - <X>
DON'T:
  - touch <Y>
  - refactor <Z> even if it looks messy
```

Claude will try to over-help. Bound it explicitly.

---

### Pattern: adversarial review (for large changes)

Before accepting a plan or diff:

- "How does this fail at 10× load?"
- "What happens if <service> is unavailable?"
- "What's the attack surface we just created?"
- "Can we roll this back independently of the rest?"

---

## When to use which agent directly

Most agents auto-invoke. Ask explicitly only when you want to bypass routing.

| Want | Ask |
|---|---|
| A fresh design review | "Ask the architect to critique this approach…" |
| A one-shot codemap | "Ask the code-explorer to map src/ for me…" |
| Perf profiling on a specific path | "Ask performance-optimizer to profile X…" |
| Docs sync | "Ask doc-updater to sync README after this change…" |

---

## Model routing (quick reference)

| Task | Model |
|---|---|
| File search, simple edit | Haiku |
| Multi-file implementation | Sonnet (default) |
| PR review | Sonnet |
| Architecture, security analysis, complex debug | Opus |
| Docs / codemap | Haiku |

Full reasoning in `INTERNALS.md`.

---

## Pair-with

`common` is always on. It composes with any of:

- `fastapi` — Python API work (see `fastapi-README.md`)
- `nestjs` — TypeScript API work (see `nestjs-README.md`)
- `devops` — Infra / Terraform / K8s (see `devops-README.md`)
- `frontend` — React / Next.js (see `frontend-README.md`)

Install multiple at once: `./install.sh --context nestjs,frontend,devops`.

---

## See also

- `INTERNALS.md` — the "how it works" reference (hooks, memory, gating, model routing)
- Top-level `README.md` — install flags, Cursor / Codex targets, troubleshooting

# SmartClaude Workflow Guide

A Claude Code configuration for full-stack, DevOps, and agentic development. Covers backend (NestJS + FastAPI), DevOps (Terraform + AWS + K8s), frontend (React + Next.js + Tailwind + shadcn/ui), and general engineering workflows.

---

## Table of Contents

1. [Installation](#installation)
2. [Directory Structure](#directory-structure)
3. [Context Switching](#context-switching)
4. [Session Memory](#session-memory)
5. [Core Workflow Pipeline](#core-workflow-pipeline)
6. [Daily Workflow Patterns](#daily-workflow-patterns)
7. [Autonomous Loop Patterns](#autonomous-loop-patterns)
8. [Commands Reference](#commands-reference)
9. [Agent Reference](#agent-reference)
10. [Skills Library](#skills-library)
11. [MCP Servers](#mcp-servers)
12. [Safety Guardrails](#safety-guardrails)
13. [Tips](#tips)

---

## Installation

### Full install (user-level, all projects)

```bash
SMARTCLAUDE=/path/to/smartclaude

# Core config
cp -r $SMARTCLAUDE/agents ~/.claude/
cp -r $SMARTCLAUDE/commands ~/.claude/
cp -r $SMARTCLAUDE/rules ~/.claude/
cp -r $SMARTCLAUDE/skills ~/.claude/
cp -r $SMARTCLAUDE/contexts ~/.claude/
cp -r $SMARTCLAUDE/scripts ~/.claude/

# Merge hooks.json into ~/.claude/settings.json manually
cat $SMARTCLAUDE/hooks/hooks.json
```

### Per-project install

```bash
mkdir -p .claude/{agents,rules,commands,skills}

cp /path/to/smartclaude/agents/*.md .claude/agents/
cp -r /path/to/smartclaude/rules/common .claude/rules/
cp -r /path/to/smartclaude/rules/nestjs .claude/rules/    # your stack
cp /path/to/smartclaude/commands/*.md ~/.claude/commands/ # user-level for global access
cp -r /path/to/smartclaude/skills/* ~/.claude/skills/
```

### Shell aliases

```bash
# Add to ~/.zshrc or ~/.bashrc
alias claude-be='claude --system-prompt "$(cat ~/.claude/contexts/backend.md)"'
alias claude-ops='claude --system-prompt "$(cat ~/.claude/contexts/devops.md)"'
alias claude-fe='claude --system-prompt "$(cat ~/.claude/contexts/frontend.md)"'
alias claude-dev='claude --system-prompt "$(cat ~/.claude/contexts/dev.md)"'
alias claude-research='claude --system-prompt "$(cat ~/.claude/contexts/research.md)"'
alias claude-review='claude --system-prompt "$(cat ~/.claude/contexts/review.md)"'
```

### MCP Servers

Merge `mcp-configs/mcp-servers.json` into your `~/.claude.json` under `"mcpServers"`. Replace `YOUR_GITHUB_PAT_HERE` and `YOUR_FIRECRAWL_KEY_HERE` with actual values.

### Hooks

After installing scripts to `~/.claude/scripts/hooks/`, merge `hooks/hooks.json` into your `~/.claude/settings.json`. The hook scripts reference `${HOME}/.claude/scripts/hooks/` so the path resolves automatically.

---

## Directory Structure

```
smartclaude/
  WORKFLOW_GUIDE.md
  README.md
  agents/                       # 14 agents total
    # Stack reviewers (8)
    nestjs-reviewer.md
    fastapi-reviewer.md
    terraform-reviewer.md
    k8s-reviewer.md
    aws-architect.md
    database-reviewer.md
    infra-security-reviewer.md
    frontend-reviewer.md
    # General-purpose (6)
    planner.md
    architect.md
    refactor-cleaner.md
    build-error-resolver.md
    doc-updater.md
    performance-optimizer.md
  commands/                     # 17 commands total
    # Stack (10)
    nestjs-scaffold.md
    fastapi-scaffold.md
    tf-plan-review.md
    k8s-audit.md
    db-migrate.md
    aws-cost-check.md
    infra-security-scan.md
    switch-backend.md
    switch-devops.md
    switch-frontend.md
    # Workflow (7)
    plan.md
    code-review.md
    build-fix.md
    refactor-clean.md
    learn.md
    prompt-optimize.md
    checkpoint.md
  skills/                       # 19 skills (each in its own folder/SKILL.md)
    agent-harness-construction/
    agentic-engineering/        # + AI-first signals, compaction guide, ADR format
    api-design/
    autonomous-loops/
    backend-patterns/
    blueprint/
    codebase-onboarding/
    coding-standards/
    content-hash-cache-pattern/
    context-budget/
    continuous-learning-v2/
    database-migrations/
    deep-research/              # + Exa MCP tool reference
    deployment-patterns/
    docker-patterns/
    frontend-patterns/
    git-workflow/
    search-first/               # + progressive codebase retrieval
    verification-loop/
  rules/
    common/                     # 10 universal rules
    nestjs/
    fastapi/
    terraform/
    kubernetes/
    aws/
    frontend/
  contexts/                     # 6 system prompt profiles
    backend.md                  # NestJS + FastAPI + PostgreSQL
    devops.md                   # Terraform + AWS + K8s
    frontend.md                 # React + Next.js + Tailwind + shadcn/ui
    dev.md                      # Active coding — ship fast, atomic commits
    research.md                 # Exploration — read first, code second
    review.md                   # PR review — severity-ordered, security-first
  hooks/
    hooks.json
  scripts/hooks/                # 8 standalone Node.js hook scripts
    session-start.js
    session-end.js
    pre-compact.js
    cost-tracker.js
    evaluate-session.js
    commit-quality.js
    config-protection.js
    doc-file-warning.js
  mcp-configs/
    mcp-servers.json
```

---

## Context Switching

### Method 1: Slash commands (within a session)

```
/switch-backend    → NestJS + FastAPI + PostgreSQL rules
/switch-devops     → Terraform + AWS + Kubernetes rules
/switch-frontend   → React + Next.js + Tailwind + shadcn/ui rules
```

### Method 2: Shell aliases (per session focus)

| Alias | Context | Best for |
|---|---|---|
| `claude-be` | backend.md | API development, DB work |
| `claude-ops` | devops.md | Infra, Terraform, K8s |
| `claude-fe` | frontend.md | UI components, Next.js |
| `claude-dev` | dev.md | Fast coding, any stack |
| `claude-research` | research.md | Exploring unfamiliar codebase |
| `claude-review` | review.md | PR review, security audit |

### Method 3: Project-level rules

Copy only relevant rules into `.claude/rules/`:
- NestJS → `common/` + `nestjs/`
- FastAPI → `common/` + `fastapi/`
- Terraform → `common/` + `terraform/` + `aws/` + `kubernetes/`
- Next.js → `common/` + `frontend/`
- Full-stack → all

---

## Session Memory

The session memory pipeline runs automatically via hooks:

```
SessionStart     → loads the most recent *-session.tmp from last 7 days
                 → injects as additionalContext (previous tasks, files, branch)

After each response:
  session-end.js      (async) — updates ~/.claude/session-data/YYYY-MM-DD-<id>-session.tmp
  cost-tracker.js     (async) — appends JSONL row to ~/.claude/metrics/costs.jsonl
  evaluate-session.js (async) — for sessions ≥10 messages, signals /learn

PreCompact       → appends compaction marker to active session file
```

**Session files** live in `~/.claude/session-data/`. They're plain Markdown — edit them freely to add context for the next session.

**Cost log** (`~/.claude/metrics/costs.jsonl`) — one row per response with tokens, model, and estimated USD.

**Learned patterns** → `~/.claude/skills/learned/` — use `/learn` to extract reusable patterns from a session.

---

## Core Workflow Pipeline

Every feature follows this 5-phase orchestrator pattern. Each phase produces one clear output that becomes the input for the next.

```
Phase 1: RESEARCH   → Explore (read-only)    → research findings
Phase 2: PLAN       → Planner agent (Opus)   → plan.md with phases + risks
Phase 3: IMPLEMENT  → TDD workflow            → code changes
Phase 4: REVIEW     → Stack reviewer (Sonnet) → review comments
Phase 5: VERIFY     → Build-error-resolver   → green build or loop back
```

**Eval-first principle**: Before starting Phase 3, define your done condition — a specific test or behavior that would prove the feature works. This prevents scope drift and makes Phase 5 unambiguous.

**Research before coding (mandatory):**
1. Search GitHub for existing implementations and patterns
2. Check library docs with `context7` MCP for framework-specific behavior
3. Search package registries before writing utility code
4. Adopt proven approaches over writing net-new code

**Reviewing AI-generated code — where to focus:**
- Invariants and edge cases the model may have assumed away
- Error boundaries (what happens when the happy path fails)
- Security and auth assumptions (especially implicit trust)
- Hidden coupling that makes code hard to change or roll back

Skip style disagreements when automated format/lint already enforces style.

---

## Daily Workflow Patterns

### Start any session

```bash
claude-dev        # for coding
claude-research   # for exploring a codebase you don't know
claude-review     # for reviewing a PR
```

Session memory loads automatically — previous tasks, files, and branch context are injected.

---

### New feature (any stack)

```
1. /plan                   → planner agent → phased plan, risks, dependencies
   (confirm plan before Claude writes any code)
2. Implement phase by phase
3. /code-review            → CRITICAL/HIGH/MEDIUM findings on uncommitted changes
4. /build-fix              → if build/TS errors, fix incrementally
5. Commit with conventional message
6. /learn                  → optionally extract reusable patterns
```

---

### Large feature (Blueprint)

Use the `blueprint` skill when work spans multiple sessions or team members.

```
1. State objective as a testable outcome:
   "Users can log in with email/password and persist sessions"
   (NOT: "add auth")

2. Map dependency graph:
   [DB schema] → [Auth service] → [JWT middleware] → [Protected routes]
                → [Email service] → [Password reset]

3. Break into independently-deployable phases:
   Phase 1: Foundation (schema + core service)
   Phase 2: Core experience (endpoints + JWT)
   Phase 3: Edge cases (reset, expiry, rate limiting)
   Phase 4: Hardening (audit logs, brute force, security review)

4. Detect parallelizable steps:
   DB schema + Email templates (no dependency)
   Frontend components + Backend endpoints (interface-driven)

5. Apply adversarial review before advancing each phase:
   - "How does this fail at 10x load?"
   - "What happens if this service is unavailable?"
   - "What's the attack surface we've created?"
   - "Can we roll this back independently?"
```

---

### Backend feature (NestJS)

```
1. /switch-backend  (or claude-be)
2. /plan
3. /nestjs-scaffold users    → generate module structure
4. Implement service logic
5. /db-migrate               → generate migration if schema changed
6. /code-review
7. Commit: "feat(users): add user CRUD endpoints"
```

---

### Backend feature (FastAPI)

```
1. /switch-backend
2. /plan
3. /fastapi-scaffold orders  → generate domain structure
4. Implement service + schemas
5. pytest --cov              → run tests with coverage
6. /db-migrate               → Alembic migration if needed
7. /code-review
8. Commit
```

---

### Infrastructure change (Terraform)

```
1. /switch-devops  (or claude-ops)
2. /plan                     → plan the infrastructure change
3. Write Terraform
4. /tf-plan-review           → MANDATORY: review plan output
5. /infra-security-scan      → MANDATORY: security scan
6. /aws-cost-check           → cost impact
7. PR → approval → terraform apply
```

---

### Kubernetes deployment

```
1. /switch-devops
2. Update manifests or Helm values
3. /k8s-audit                → security and best practices audit
4. kubectl diff -f manifests/
5. PR → merge → ArgoCD sync or kubectl apply
```

---

### Frontend feature (Next.js)

```
1. /switch-frontend  (or claude-fe)
2. /plan
3. Server Components for data fetching
4. Client Components for interactivity
5. shadcn/ui components (extend, don't edit source)
6. npx vitest run
7. /code-review
8. npm run build             → verify SSR works
9. Commit
```

---

### Bug fix (any stack)

```
1. claude-dev  (fast coding mode)
2. Reproduce → read error → find root cause
3. Write failing test
4. Fix
5. Verify test passes
6. /code-review
7. Commit: "fix: <description>"
```

---

### Dead code cleanup

```
1. /refactor-clean
   → SAFE tier:  remove unused imports, dead variables  (auto-approved)
   → CAUTION:    unused exports, deprecated functions   (confirm each)
   → DANGER:     large structural removal              (explicit approval)
2. Tests run after each deletion
3. Commit: "refactor: remove dead code"
```

---

### Architecture decision

```
1. Ask architect agent: "Design a caching strategy for the feed API"
2. Agent produces: design doc, trade-off comparison, ADR
3. Confirm approach → /plan → implement
```

---

### Research before coding

```
1. claude-research  (read widely before concluding — no code until understanding is clear)
2. Use the progressive retrieval pattern (search-first skill) to find relevant files:
   Cycle 1: broad keywords → score each file (0-1)
   Cycle 2: add discovered terminology, refine search
   Cycle 3: fill remaining gaps
   Stop when ≥3 high-relevance files and no critical gaps
3. /checkpoint research      → save findings
4. Switch to claude-dev to implement
```

---

## Autonomous Loop Patterns

For scripted or multi-day workflows, use `claude -p` (headless mode). Each step gets a fresh context window; chain via filesystem state.

### Pattern selection

```
Single focused change?              → Sequential Pipeline
Has RFC/spec + parallel work?       → Ralphinho (DAG)
Has RFC/spec, no parallelism?       → Continuous Claude
Many variations of same thing?      → Infinite Agentic Loop
Quick iteration with cleanup?       → Sequential Pipeline + De-Sloppify
```

---

### Sequential Pipeline

```bash
#!/bin/bash
set -e

# Step 1: Implement
claude -p "Read docs/auth-spec.md. Implement OAuth2 login in src/auth/ with TDD."

# Step 2: De-sloppify (separate context, focused cleanup)
claude -p "Review all changed files. Remove unnecessary type tests, defensive checks
for impossible states, console.log. Keep business logic tests. Run test suite."

# Step 3: Verify
claude -p "Run build, lint, typecheck, and tests. Fix any failures. No new features."

# Step 4: Commit
claude -p "Create a conventional commit: 'feat: add OAuth2 login flow'"
```

**With model routing:**
```bash
claude -p --model opus "Analyze architecture and write a caching plan to docs/plan.md"
claude -p "Implement the caching layer per docs/plan.md"        # Sonnet (default)
claude -p --model opus "Review all changes for security issues and edge cases"
```

**With tool restrictions:**
```bash
claude -p --allowedTools "Read,Grep,Glob" "Audit for security vulnerabilities"
claude -p --allowedTools "Read,Write,Edit,Bash" "Implement fixes from audit.md"
```

---

### De-Sloppify Pass

Add a focused cleanup agent **after** any implementation step instead of constraining with negative instructions. Negative instructions ("don't test type systems") degrade overall quality — a separate cleanup pass doesn't.

```bash
# WRONG: constraining the implementer
claude -p "Implement feature X. Don't add unnecessary checks."

# RIGHT: let it be thorough, clean up separately
claude -p "Implement feature X with full TDD."
claude -p "Cleanup pass: remove tests that verify language/framework behavior,
redundant type checks, over-defensive error handling for impossible states,
console.log, commented-out code. Run tests to verify nothing breaks."
```

---

### Continuous Claude PR Loop

Runs Claude in a loop — creates PRs, waits for CI, and merges automatically.

```bash
continuous-claude --prompt "Add unit tests for all untested functions" --max-runs 10
continuous-claude --prompt "Fix linter errors" --max-cost 5.00
continuous-claude --prompt "Add auth feature" --max-runs 10 \
  --review-prompt "Run npm test && npm run lint, fix failures"
```

Use `SHARED_TASK_NOTES.md` to bridge context across iterations:

```markdown
## Progress
- [x] Added auth tests (iteration 1)
- [ ] Still need: rate limiting tests

## Next Steps
- Focus on rate limiting module
```

Stop conditions: `--max-runs N`, `--max-cost $X`, `--max-duration 2h`, or `--completion-signal "DONE"`.

---

### RFC-Driven DAG (Ralphinho)

For large features. Decomposes an RFC into a dependency DAG, runs each unit through a quality pipeline in isolated worktrees, lands via merge queue.

**Complexity tiers:**
- **trivial**: implement → test
- **small**: implement → test → code-review
- **medium**: research → plan → implement → test → PRD-review + code-review → fix
- **large**: + final-review

**Key principles:**
- Each stage runs in its own context window (reviewer never wrote the code it reviews)
- Each unit runs in its own worktree (no cross-unit contamination)
- Non-overlapping units land in parallel; overlapping land one-by-one
- Evicted units from merge conflicts get conflict context on next pass

---

### Autonomous Loop Anti-Patterns

1. **No exit condition** — always set max-runs, max-cost, or a completion signal
2. **No context bridge** — use `SHARED_TASK_NOTES.md` or filesystem state between `claude -p` calls
3. **Retrying same failure blindly** — capture error context and feed it to next attempt
4. **Negative instructions** — use a de-sloppify pass instead
5. **All agents in one context window** — reviewer should never be the author

---

## Commands Reference

### Stack commands

| Command | Purpose |
|---------|---------|
| `/switch-backend` | Enter NestJS + FastAPI + PostgreSQL mode |
| `/switch-devops` | Enter Terraform + AWS + K8s mode |
| `/switch-frontend` | Enter React + Next.js + Tailwind mode |
| `/nestjs-scaffold <name>` | Scaffold NestJS module |
| `/fastapi-scaffold <name>` | Scaffold FastAPI domain |
| `/db-migrate` | ORM-aware database migration |
| `/tf-plan-review` | Terraform plan + security review |
| `/k8s-audit` | Kubernetes manifest audit |
| `/aws-cost-check` | AWS cost impact analysis |
| `/infra-security-scan` | Full IaC security scan |

### Workflow commands

| Command | Purpose |
|---------|---------|
| `/plan` | Invoke planner agent → phased plan with risks, dependencies |
| `/code-review` | CRITICAL/HIGH/MEDIUM review on uncommitted changes |
| `/build-fix` | Fix build/TS errors incrementally, one at a time |
| `/refactor-clean` | Dead code removal with SAFE/CAUTION/DANGER tiers |
| `/learn` | Extract reusable patterns from current session |
| `/prompt-optimize <prompt>` | Rewrite prompt for clarity and token efficiency |
| `/checkpoint <name>` | Save/verify/list named context snapshots |

---

## Agent Reference

### Stack agents

| Agent | Model | Use case |
|-------|-------|----------|
| `nestjs-reviewer` | Sonnet | NestJS code review |
| `fastapi-reviewer` | Sonnet | FastAPI code review |
| `terraform-reviewer` | Sonnet | Terraform plan review |
| `k8s-reviewer` | Sonnet | Kubernetes manifest review |
| `aws-architect` | Opus | Architecture decisions, service selection |
| `database-reviewer` | Sonnet | Schema, migrations, query review |
| `infra-security-reviewer` | Sonnet | IaC security scanning |
| `frontend-reviewer` | Sonnet | React/Next.js/Tailwind review |

### Workflow agents

| Agent | Model | Use case |
|-------|-------|----------|
| `planner` | Opus | Phased implementation plan — confirms before writing code |
| `architect` | Opus | System design, trade-off analysis, ADR authoring |
| `refactor-cleaner` | Sonnet | Dead code removal via knip/depcheck/ts-prune |
| `build-error-resolver` | Sonnet | TS/build errors — minimal diffs, no architectural changes |
| `doc-updater` | Haiku | Codemap generation, README and docs sync |
| `performance-optimizer` | Sonnet | Bundle analysis, React rendering, memory leaks |

### Model routing

| Task type | Model | Reason |
|-----------|-------|--------|
| Exploration, file search | Haiku | Fast, cheap, sufficient |
| Simple edits | Haiku | Single-file, clear instructions |
| Multi-file implementation | Sonnet | Best balance for coding |
| PR review | Sonnet | Understands context, catches nuance |
| Complex architecture | Opus | Deep reasoning required |
| Security analysis | Opus | Can't afford to miss vulnerabilities |
| Debugging complex bugs | Opus | Needs to hold entire system in mind |
| Writing docs | Haiku | Structure is simple |

Escalate model tier only when the lower tier fails with a clear reasoning gap.

### Automatic agent triggers (no prompt needed)

| Change | Auto-trigger |
|--------|-------------|
| NestJS code changed | `nestjs-reviewer` |
| FastAPI code changed | `fastapi-reviewer` |
| Terraform files changed | `terraform-reviewer` |
| K8s manifests changed | `k8s-reviewer` |
| Database/migration changed | `database-reviewer` |
| Frontend code changed | `frontend-reviewer` |
| Before any infra deploy | `infra-security-reviewer` |
| Architecture decisions | `aws-architect` |

### Parallel agent execution

Run independent reviews in parallel to save time:

```
# Good: launch all three simultaneously
Agent 1: Security analysis of Terraform changes
Agent 2: K8s manifest review
Agent 3: Database migration review

# Bad: sequential when there's no dependency
Run Agent 1, wait, then Agent 2, wait, then Agent 3
```

---

## Skills Library

Skills load as passive knowledge — no invocation needed. Claude references them automatically based on what you're working on.

### Core workflow

| Skill | What it covers |
|---|---|
| `git-workflow` | Branching strategies, conventional commits, merge vs rebase, conflict resolution |
| `coding-standards` | Naming, immutability, error handling, async patterns, code smells |
| `context-budget` | Token audit: MCPs (~500 tokens/tool), agent descriptions, how to reduce bloat |
| `agentic-engineering` | Eval-first loops, model routing, 15-min decomposition, compaction guide, ADR format, AI-first signals |
| `verification-loop` | 6-phase build/type/lint/test/security/diff pipeline with structured reporting |
| `codebase-onboarding` | Architecture map, entry points, convention detection, starter CLAUDE.md |

### Architecture & design

| Skill | What it covers |
|---|---|
| `api-design` | REST naming, status codes, pagination (offset vs cursor), rate limiting, versioning |
| `backend-patterns` | Repository pattern, cache-aside (Redis), retry/backoff, RBAC, BullMQ jobs |
| `frontend-patterns` | Custom hooks, Context+Reducer, memoization, code splitting, error boundaries, a11y |
| `blueprint` | One-line objective → multi-session construction plan with dependency graph |

### Infra & DevOps

| Skill | What it covers |
|---|---|
| `deployment-patterns` | Rolling/blue-green/canary, Docker multi-stage, GitHub Actions CI/CD, health checks |
| `database-migrations` | Zero-downtime expand-contract, batch data migrations, Prisma/Drizzle/Kysely/Alembic |
| `docker-patterns` | Compose for dev, dev vs prod Dockerfile stages, container security, networking |

### Agentic & research

| Skill | What it covers |
|---|---|
| `autonomous-loops` | Sequential pipeline, de-sloppify, continuous-claude PR loop, Ralphinho DAG |
| `search-first` | Research-before-coding workflow + progressive codebase retrieval (DISPATCH→EVALUATE→REFINE→LOOP) |
| `deep-research` | Multi-source research with firecrawl/exa MCPs (incl. Exa tool reference), citation, parallel subagents |
| `agent-harness-construction` | Action space design, tool definitions, observation formatting for higher agent completion rates |
| `continuous-learning-v2` | Instinct-based learning via hooks — project-scoped vs global instincts, confidence scoring |
| `content-hash-cache-pattern` | Cache expensive file processing with SHA-256 hashes — auto-invalidating, service layer separation |

---

## MCP Servers

Configured in `mcp-configs/mcp-servers.json`. Merge into `~/.claude.json` under `"mcpServers"`.

| Server | Purpose | Enable |
|--------|---------|--------|
| `github` | PRs, issues, repos, code search | Always |
| `context7` | Live docs for NestJS, FastAPI, Terraform, K8s, SQLAlchemy, TypeORM, Prisma | Always |
| `sequential-thinking` | Chain-of-thought for architecture and complex debugging | As needed |
| `firecrawl` | Web research for AWS docs, Terraform registry, K8s docs, changelogs | As needed |
| `memory` | Persistent memory for infra decisions and cross-session context | As needed |

**Context window cost**: each MCP tool schema costs ~500 tokens in every request. A server with 30 tools costs more than all your skills files combined. Keep under 10 MCP servers enabled and under 80 total active tools.

**Lean default**: enable `github` + `context7` always. Enable others for specific sessions, then disable.

**CLI vs MCP**: for simple wrappers (GitHub PRs, Vercel deployments), prefer CLI commands (`gh pr`, `vercel deploy`) over MCP servers — saves 5k–15k tokens per session.

---

## Safety Guardrails

### Automatic blocks (exit 2 — cannot proceed)

| Trigger | What's blocked |
|---|---|
| `terraform apply` without prior plan | Blocked by PreToolUse hook |
| `kubectl apply/delete` to production context | Blocked by PreToolUse hook |
| `git commit/push --no-verify` | Blocked by PreToolUse hook |
| Hardcoded secrets in staged files (AWS/OpenAI/GitHub keys) | Blocked by commit-quality hook |
| `debugger` statements in staged files | Blocked by commit-quality hook |
| Writing to linter/formatter config files | Blocked by config-protection hook |

### Warnings (exit 0 — allowed but flagged)

- `console.log` in staged JS/TS files
- Non-conventional commit message format
- Ad-hoc doc filenames (NOTES, TODO, SCRATCH) outside structured directories

### Auto-formatting (PostToolUse)

- Python files → `ruff format` + `ruff check --fix`
- TS/JS files → `prettier --write` or `biome format --write`

### IaC security (via agents)

- Terraform: IAM wildcards, secrets in `.tf`, unencrypted resources → CRITICAL
- Kubernetes: root containers, cluster-admin RBAC, missing resource limits → CRITICAL
- AWS: public S3 buckets, unencrypted storage, missing VPC Flow Logs → HIGH/CRITICAL

---

## Tips

### Context window management

- Keep MCPs to ≤5 enabled per session (each tool adds ~500 tokens to every request)
- Use `/compact` when exploration is done and you're entering implementation mode
- Use `/switch-*` to focus rules rather than loading all stacks at once
- Agent descriptions always load — even uninvoked agents consume context in every Task call
- After adding any agent, skill, or MCP server, run the `context-budget` skill to verify headroom

### Progressive retrieval for unfamiliar codebases

When finding relevant files in a large codebase, use the DISPATCH→EVALUATE→REFINE→LOOP cycle (from the `search-first` skill):

```
Cycle 1: Broad search (generic keywords + common patterns)
         → Score each file 0-1 for relevance
         → Note missing context / gaps

Cycle 2: Add terminology discovered in Cycle 1
         → Exclude confirmed irrelevant paths
         → Fill gaps

Cycle 3: Target remaining gaps only

Stop when: ≥3 high-relevance files (≥0.7 score) AND no critical gaps remain
```

If Cycle 1 returns nothing, the codebase uses different terminology — first cycle often reveals naming conventions.

### Parallelization

```bash
# Two Claude instances on separate tasks via git worktrees
git worktree add ../project-feat-a -b feat/feature-a
git worktree add ../project-feat-b -b feat/feature-b

cd ../project-feat-a && claude-dev   # terminal 1
cd ../project-feat-b && claude-dev   # terminal 2
```

### Session strategy

- Continue the same session for closely-coupled units (shared context is a feature)
- Start a fresh session after major phase transitions (prevents prior assumptions leaking in)
- Compact after milestone completion, not during active debugging
- Save session with `/checkpoint <name>` before compacting or switching focus

### Pre-commit checklist

```bash
# Backend (NestJS)
npx tsc --noEmit && npm run lint && npm test -- --coverage

# Backend (FastAPI)
ruff check . && ruff format --check . && mypy src/ && pytest --cov=src

# Infrastructure
terraform fmt -check && terraform validate && checkov -d . --quiet

# Frontend
npx tsc --noEmit && npx eslint . && npx vitest run && npm run build
```

### Reading costs

```bash
# View today's costs
grep "$(date +%Y-%m-%d)" ~/.claude/metrics/costs.jsonl | \
  node -e "
    const lines = require('fs').readFileSync(0,'utf8').trim().split('\n');
    const rows = lines.map(l => JSON.parse(l));
    const total = rows.reduce((s, r) => s + r.estimated_cost_usd, 0);
    console.log('Responses:', rows.length);
    console.log('Total cost: \$' + total.toFixed(4));
  "
```

### Recovering session context after compaction

Session files survive compaction. The next session automatically loads the most recent `*-session.tmp`. To manually load a specific session:

```bash
cat ~/.claude/session-data/2026-03-30-abc12345-session.tmp
# Copy the relevant context and paste as your first message
```

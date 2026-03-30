# SmartClaude Workflow Guide

A Claude Code configuration for full-stack, DevOps, and agentic development. Covers backend (NestJS + FastAPI), DevOps (Terraform + AWS + K8s), frontend (React + Next.js + Tailwind + shadcn/ui), and general engineering workflows.

---

## Table of Contents

1. [Installation](#installation)
2. [Directory Structure](#directory-structure)
3. [Context Switching](#context-switching)
4. [Session Memory](#session-memory)
5. [Daily Workflow Patterns](#daily-workflow-patterns)
6. [Commands Reference](#commands-reference)
7. [Agent Reference](#agent-reference)
8. [Skills Library](#skills-library)
9. [Safety Guardrails](#safety-guardrails)
10. [Tips](#tips)

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
cp /path/to/smartclaude/skills/*.md ~/.claude/skills/
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
  skills/                       # 14 skill files
    git-workflow.md
    coding-standards.md
    context-budget.md
    agentic-engineering.md
    api-design.md
    backend-patterns.md
    frontend-patterns.md
    blueprint.md
    deployment-patterns.md
    database-migrations.md
    docker-patterns.md
    autonomous-loops.md
    iterative-retrieval.md
    deep-research.md
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

## Daily Workflow Patterns

### Start any session

```bash
# Start fresh with previous context auto-loaded
claude-dev        # for coding
claude-research   # for exploring a codebase you don't know
claude-review     # for reviewing a PR
```

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

### Kubernetes deployment

```
1. /switch-devops
2. Update manifests or Helm values
3. /k8s-audit                → security and best practices audit
4. kubectl diff -f manifests/
5. PR → merge → ArgoCD sync or kubectl apply
```

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

### Dead code cleanup

```
1. /refactor-clean
   → SAFE tier:  remove unused imports, dead variables  (auto-approved)
   → CAUTION:    unused exports, deprecated functions   (confirm each)
   → DANGER:     large structural removal              (explicit approval)
2. Tests run after each deletion
3. Commit: "refactor: remove dead code"
```

### Architecture decision

```
1. Ask architect agent directly: "Design a caching strategy for the feed API"
2. Agent produces: design doc, trade-off comparison, ADR
3. Confirm approach → /plan → implement
```

### Research before coding

```
1. claude-research  (read widely, ask questions, no code until understanding is clear)
2. Explore codebase with iterative-retrieval pattern:
   - broad search → evaluate relevance → refine → repeat (max 3 cycles)
3. Switch to claude-dev to implement
```

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

**Model routing**: Opus for deep reasoning (architecture, planning, security). Sonnet for implementation. Haiku for docs and simple tasks.

---

## Skills Library

Skills load as passive knowledge — no invocation needed. Claude references them automatically based on what you're working on.

### Core workflow
| Skill | What it covers |
|---|---|
| `git-workflow` | Branching strategies, conventional commits, merge vs rebase, conflict resolution |
| `coding-standards` | Naming, immutability, error handling, async patterns, code smells |
| `context-budget` | Token audit: MCPs (~500 tokens/tool), agent descriptions, how to reduce bloat |
| `agentic-engineering` | Eval-first loops, model routing table, 15-minute unit decomposition |

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
| `database-migrations` | Zero-downtime expand-contract, batch data migrations, Prisma/Drizzle/Kysely/Django/golang-migrate |
| `docker-patterns` | Compose for dev, dev vs prod Dockerfile stages, container security, networking |

### Agentic & research
| Skill | What it covers |
|---|---|
| `autonomous-loops` | Sequential pipeline, de-sloppify, continuous-claude PR loop, Ralphinho DAG |
| `iterative-retrieval` | DISPATCH→EVALUATE→REFINE→LOOP for finding context without exceeding limits |
| `deep-research` | Multi-source research with firecrawl/exa MCPs, citation, parallel subagents |

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
- Kubernetes: root containers, cluster-admin RBAC, missing limits → CRITICAL
- AWS: public S3 buckets, unencrypted storage, missing VPC Flow Logs → HIGH/CRITICAL

---

## Tips

### Context window management

- Keep MCPs to ≤5 enabled per session (each tool adds ~500 tokens to every request)
- Use `/compact` when exploration is done and you're in implementation mode
- Use `context-budget` skill awareness: agent descriptions always load, rules load per session
- Use `/switch-*` to focus rules rather than loading all stacks

### Parallelization

```bash
# Two Claude instances on separate tasks via git worktrees
git worktree add ../project-feat-a -b feat/feature-a
git worktree add ../project-feat-b -b feat/feature-b

cd ../project-feat-a && claude-dev   # terminal 1
cd ../project-feat-b && claude-dev   # terminal 2
```

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

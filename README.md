# SmartClaude

A Claude Code configuration toolkit for full-stack and DevOps development. Pre-built rules, agents, commands, skills, and hooks tuned for:

- **Backend** — NestJS, FastAPI, PostgreSQL
- **DevOps** — Terraform, AWS, Kubernetes
- **Frontend** — React, Next.js, Tailwind CSS, shadcn/ui
- **Agentic Workflows** — session memory, continuous learning, planning, refactoring

---

## What's Included

| Component | Count | Purpose |
|-----------|-------|---------|
| `agents/` | 14 | Stack reviewers + general-purpose workflow agents |
| `rules/` | 7 stacks | Coding style, security, testing, and patterns per stack |
| `commands/` | 17 | Slash commands for scaffolding, auditing, and workflow |
| `skills/` | 14 | Passive knowledge: patterns, standards, research, loops |
| `contexts/` | 6 | System prompt profiles (backend/devops/frontend/dev/research/review) |
| `hooks/` | — | SessionStart/PreToolUse/PostToolUse/PreCompact/Stop hooks |
| `scripts/hooks/` | 8 | Standalone Node.js hook scripts |
| `mcp-configs/` | — | Curated MCP server configuration |

---

## Quick Install

### Per-project (recommended)

```bash
# From your project root
mkdir -p .claude/{agents,rules,commands}

cp /path/to/smartclaude/agents/*.md .claude/agents/
cp -r /path/to/smartclaude/rules/common .claude/rules/
cp -r /path/to/smartclaude/rules/nestjs .claude/rules/   # pick your stack(s)
cp /path/to/smartclaude/commands/*.md ~/.claude/commands/
```

### User-level (all projects)

```bash
cp /path/to/smartclaude/agents/*.md ~/.claude/agents/
cp -r /path/to/smartclaude/rules/* ~/.claude/rules/
cp /path/to/smartclaude/commands/*.md ~/.claude/commands/
cp -r /path/to/smartclaude/contexts ~/.claude/contexts/
```

### Shell aliases for context-focused sessions

```bash
# Add to ~/.zshrc
alias claude-be='claude --system-prompt "$(cat ~/.claude/contexts/backend.md)"'
alias claude-ops='claude --system-prompt "$(cat ~/.claude/contexts/devops.md)"'
alias claude-fe='claude --system-prompt "$(cat ~/.claude/contexts/frontend.md)"'
alias claude-dev='claude --system-prompt "$(cat ~/.claude/contexts/dev.md)"'
alias claude-research='claude --system-prompt "$(cat ~/.claude/contexts/research.md)"'
alias claude-review='claude --system-prompt "$(cat ~/.claude/contexts/review.md)"'
```

### Session Memory & Hook Scripts

The hooks reference `${HOME}/.claude/scripts/hooks/`. After installing to `~/.claude/`, the scripts are at the correct path automatically.

Session files are saved to `~/.claude/session-data/YYYY-MM-DD-<id>-session.tmp` and loaded automatically on the next session start. Cost metrics land in `~/.claude/metrics/costs.jsonl`.

See [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md) for full installation options including MCP server and hooks setup.

---

## Context Switching

Switch focus mid-session with slash commands:

```
/switch-backend    → NestJS + FastAPI + PostgreSQL mode
/switch-devops     → Terraform + AWS + Kubernetes mode
/switch-frontend   → React + Next.js + Tailwind + shadcn/ui mode
```

---

## Key Agents

### Stack Reviewers
| Agent | Model | Use Case |
|-------|-------|----------|
| `nestjs-reviewer` | Sonnet | NestJS code review |
| `fastapi-reviewer` | Sonnet | FastAPI code review |
| `terraform-reviewer` | Sonnet | Terraform plan review |
| `k8s-reviewer` | Sonnet | Kubernetes manifest review |
| `aws-architect` | Opus | Architecture decisions |
| `database-reviewer` | Sonnet | Schema, migrations, queries |
| `infra-security-reviewer` | Sonnet | IaC security scanning |
| `frontend-reviewer` | Sonnet | React/Next.js/Tailwind review |

### General-Purpose Workflow Agents
| Agent | Model | Use Case |
|-------|-------|----------|
| `planner` | Opus | Phased implementation plans with risks/dependencies |
| `architect` | Opus | System design, trade-off analysis, ADR authoring |
| `refactor-cleaner` | Sonnet | Dead code removal via knip/depcheck/ts-prune |
| `build-error-resolver` | Sonnet | TS/build error resolution, minimal diffs only |
| `doc-updater` | Haiku | Codemap generation, docs sync |
| `performance-optimizer` | Sonnet | Bundle analysis, profiling, React rendering |

---

## Key Commands

### Stack Commands
| Command | Purpose |
|---------|---------|
| `/nestjs-scaffold <name>` | Scaffold NestJS module |
| `/fastapi-scaffold <name>` | Scaffold FastAPI domain |
| `/db-migrate` | ORM-aware database migration |
| `/tf-plan-review` | Terraform plan + security review |
| `/k8s-audit` | Kubernetes manifest audit |
| `/aws-cost-check` | AWS cost impact analysis |
| `/infra-security-scan` | Full IaC security scan |

### Workflow Commands
| Command | Purpose |
|---------|---------|
| `/plan` | Invoke planner agent → phased plan with risks |
| `/code-review` | Quality + security review on uncommitted changes |
| `/build-fix` | Incrementally fix build/TS errors |
| `/refactor-clean` | Safe dead code removal with SAFE/CAUTION/DANGER tiers |
| `/learn` | Extract reusable patterns from current session |
| `/prompt-optimize <prompt>` | Rewrite prompts for clarity and token efficiency |
| `/checkpoint <name>` | Save/verify/list named context snapshots |

---

## Skills Library

Passive knowledge that loads automatically — no invocation needed.

| Category | Skill | Description |
|---|---|---|
| **Core** | `git-workflow` | Branching, conventional commits, merge vs rebase |
| | `coding-standards` | Naming, immutability, error handling, async patterns |
| | `context-budget` | Token audit: MCP tools, agent descriptions, bloat |
| | `agentic-engineering` | Eval-first, model routing, 15-min unit decomposition |
| **Architecture** | `api-design` | REST conventions, pagination, auth, rate limiting |
| | `backend-patterns` | Repository, cache-aside, retry/backoff, RBAC, BullMQ |
| | `frontend-patterns` | Hooks, Context+Reducer, memoization, code splitting, a11y |
| | `blueprint` | 1-line objective → multi-session construction plan |
| **Infra** | `deployment-patterns` | Rolling/blue-green/canary, Docker, GitHub Actions CI/CD |
| | `database-migrations` | Zero-downtime expand-contract, ORM workflows |
| | `docker-patterns` | Compose for dev, container security, networking |
| **Agentic** | `autonomous-loops` | Sequential pipeline, de-sloppify, continuous-claude, Ralphinho |
| | `iterative-retrieval` | DISPATCH→EVALUATE→REFINE→LOOP context retrieval |
| | `deep-research` | Multi-source research with firecrawl/exa MCPs |

---

## Safety Guardrails

Hooks enforce these rules automatically:

- `terraform apply` is blocked without a prior plan review
- `kubectl apply` to production requires confirmation
- `--no-verify` on git operations is blocked
- IAM wildcards, secrets in `.tf` files, and root containers are flagged as CRITICAL
- **NEW** Hardcoded secrets (AWS/OpenAI/GitHub keys) in staged files → commit blocked
- **NEW** `debugger` statements in staged files → commit blocked
- **NEW** Writes to linter/formatter config files blocked (fix code, not config)
- **NEW** Ad-hoc doc filenames (NOTES, SCRATCH, TODO) outside structured dirs → warned
- `console.log` in TS/JS triggers a warning
- Python files auto-format with `ruff`; TS/JS files auto-format with `prettier`

---

## Stack Rules Coverage

Each stack folder contains: `coding-style`, `security`, `testing`, `patterns`.

```
rules/
  common/       # git workflow, hooks, code review, performance, security
  nestjs/
  fastapi/
  terraform/
  kubernetes/
  aws/
  frontend/     # also includes nextjs, tailwind, shadcn-ui rules
```

---

## Session Memory Pipeline

```
SessionStart  → loads ~/.claude/session-data/*-session.tmp (last 7 days)
              → injects as additionalContext into new session

Each response → session-end.js  (async) — updates session summary file
             → cost-tracker.js  (async) — appends row to ~/.claude/metrics/costs.jsonl
             → evaluate-session.js (async) — signals /learn for sessions ≥10 messages

PreCompact    → pre-compact.js — appends compaction marker to session file
```

**Session files:** `~/.claude/session-data/YYYY-MM-DD-<id>-session.tmp`
**Cost log:** `~/.claude/metrics/costs.jsonl`
**Learned patterns:** `~/.claude/skills/learned/*.md`

---

## More

See [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md) for daily workflow patterns, parallelization strategies, context window tips, and pre-commit checklists.

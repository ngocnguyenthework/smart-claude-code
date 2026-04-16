# smart-claude

A **context-isolated** Claude Code toolkit. Clone once, then install only the config your repo needs — `frontend` into your Next.js app, `devops` into your Terraform repo, `nestjs` into your NestJS service, or `fastapi` into your FastAPI service.

- **Context-first** — agents, commands, rules, skills, hooks, and MCP servers are grouped by workflow (`common`, `fastapi`, `nestjs`, `devops`, `frontend`). No more wading through Terraform reviewers in a React repo.
- **One command to install** — `./install.sh --context frontend` copies `common + frontend` into the target repo's `.claude/` (including `.claude/scripts/` for hook runtime) and writes a project-scope `.mcp.json` at the repo root. Run `claude` and you're done.
- **Portable hooks** — every hook resolves paths via `${CLAUDE_PROJECT_DIR}`, so they fire from any cloned location without user-dir setup.
- **Multi-harness** — install into Claude Code (`.claude/`), Cursor (`.cursor/rules/*.mdc`), or Codex (`references/`).

---

## Table of Contents

- [Quick Start](#quick-start)
- [What Each Context Includes](#what-each-context-includes)
- [Install Guide](#install-guide)
- [Shell Aliases (Per-Context System Prompts)](#shell-aliases-per-context-system-prompts)
- [Agents Catalogue](#agents-catalogue)
- [Commands & Hooks — see per-context docs](#commands--hooks--see-per-context-docs)
- [MCP Servers](#mcp-servers)
- [Multi-Harness (Cursor / Codex)](#multi-harness-cursor--codex)
- [Developing smart-claude Itself](#developing-smart-claude-itself)
- [Troubleshooting](#troubleshooting)

> **After you install** into a target project, the full workflow guides land at `.claude/docs/`:
> - `common-README.md` — universal workflows (feature dev, bug fix, planning, prompt patterns)
> - `<ctx>-README.md` — stack-specific scenarios (e.g. `fastapi-README.md`, `devops-README.md`)
> - `INTERNALS.md` — hook lifecycle, session memory, safety guardrails, model routing

---

## Quick Start

**Scenario: you're in a Next.js / React repo.**

```bash
git clone https://github.com/yourname/smart-claude.git ~/tools/smart-claude
cd ~/code/my-next-app
~/tools/smart-claude/install.sh --context frontend
claude
```

That's it. Claude Code auto-loads `.claude/settings.json`, every hook resolves its own path, and you get the frontend reviewer, E2E runner, docs-lookup, planner, and baseline safety guardrails.

**Full-stack monorepo** (NestJS + frontend):

```bash
~/tools/smart-claude/install.sh --context nestjs,frontend
```

**DevOps / Terraform repo**:

```bash
~/tools/smart-claude/install.sh --context devops
```

**Preview what will be copied (no writes)**:

```bash
~/tools/smart-claude/install.sh --context all --dir ~/code/app --dry-run
```

---

## What Each Context Includes

| Context | Stacks | Agents | Commands | Rules | Skills |
|---------|--------|-------:|---------:|------:|-------:|
| `common` | baseline — always installed | 10 | 11 | 1 bundle | 27 |
| `fastapi` | FastAPI, PostgreSQL | 2 | 2 | 1 bundle | 4 |
| `nestjs` | NestJS, PostgreSQL | 2 | 2 | 1 bundle | 5 |
| `devops` | Terraform, Terragrunt, K8s, ArgoCD, Helm, Kustomize, AWS | 8 | 8 | 7 bundles | 2 |
| `frontend` | React, Next.js, Tailwind, shadcn/ui, E2E | 2 | 0 | 1 bundle | 4 |

`fastapi` and `nestjs` each ship the shared `database-reviewer`, `/db-migrate`, and the `api-design` / `backend-patterns` / `database-migrations` / `api-connector-builder` skills — pick one without losing DB coverage, combine them for a polyglot backend and the installer dedupes collisions.

See each context's own README for details:
- [contexts/common/README.md](./contexts/common/README.md)
- [contexts/fastapi/README.md](./contexts/fastapi/README.md)
- [contexts/nestjs/README.md](./contexts/nestjs/README.md)
- [contexts/devops/README.md](./contexts/devops/README.md)
- [contexts/frontend/README.md](./contexts/frontend/README.md)

---

## Install Guide

### 1. Clone this repo once

```bash
git clone <repo-url> ~/tools/smart-claude
```

Put it anywhere — `smart-claude` is just a source tree.

### 2. Choose your contexts

| Your project type                    | Recommended `--context`       |
|--------------------------------------|-------------------------------|
| Next.js / React frontend             | `frontend`                    |
| NestJS service                       | `nestjs`                      |
| FastAPI service                      | `fastapi`                     |
| Polyglot backend (NestJS + FastAPI)  | `nestjs,fastapi`              |
| Terraform / K8s / ArgoCD infra repo  | `devops`                      |
| Full-stack monorepo                  | `nestjs,frontend` or `fastapi,frontend` |
| Platform repo (infra + API)          | `nestjs,devops` or `fastapi,devops` |
| Everything at once                   | `all`                         |

`common` is always added automatically — it ships session memory, safety hooks, and generalist agents.

### 3. Run the installer from your target repo

```bash
cd ~/code/my-app
~/tools/smart-claude/install.sh --context frontend
```

What happens:
1. `.claude/agents/`, `.claude/commands/`, `.claude/rules/`, `.claude/skills/`, `.claude/contexts/` — markdown files for your chosen contexts.
2. `.claude/settings.json` — merged hook registrations across `common` + selected contexts.
3. `.claude/scripts/hooks/` + `.claude/scripts/lib/` — the hook runtime that `.claude/settings.json` invokes via `${CLAUDE_PROJECT_DIR}/.claude/scripts/hooks/...`.
4. `.claude/docs/` — per-context READMEs (`common-README.md`, `<ctx>-README.md`) + `INTERNALS.md`. Read these first when you want to know "what's the right workflow for this scenario".
5. `.mcp.json` at the **project root** — merged MCP server registrations at project scope (see [Claude Code MCP docs](https://code.claude.com/docs/en/mcp#project-scope)). Commit it to share servers with your team.

### 4. Install flags

| Flag | Description |
|------|-------------|
| `--context <names>` | Required. Comma-separated. `frontend`, `nestjs,devops`, `fastapi,frontend`, or `all`. |
| `--dir <path>` | Target project root. Default: current directory. |
| `--target <harness>` | `claude` (default), `cursor`, or `codex`. |
| `--dry-run` | Print planned file operations without writing. |
| `--force` | Overwrite existing files. Without it, existing files are skipped. |
| `--skip-scripts` | Don't copy `.claude/scripts/hooks/` or `.claude/scripts/lib/`. |
| `--help` | Show full help text. |

### 5. Verify

```bash
cd ~/code/my-app
claude
# Inside Claude Code:
#   /doctor        — confirm hook paths resolve
#   /agents        — confirm installed agents are visible
#   /plan "add a login form"   — verify the planner agent responds
```

---

## Shell Aliases (Per-Context System Prompts)

Each context ships a session-framing markdown file at `contexts/<ctx>/contexts/<name>.md` (e.g., [`contexts/devops/contexts/devops.md`](./contexts/devops/contexts/devops.md), [`contexts/fastapi/contexts/fastapi.md`](./contexts/fastapi/contexts/fastapi.md)). The installer copies these into the target project at `<project>/.claude/contexts/<name>.md`.

Wire up shell aliases that pre-load one of these files as the **system prompt** via Claude Code's `--append-system-prompt` flag, so every session starts already framed for the stack you're working on (active agents, guardrails, tone, priorities).

### 1. Add the aliases to your shell rc

Append to `~/.zshrc` (or `~/.bashrc`):

```bash
# Per-stack framings — load .claude/contexts/<name>.md from cwd as system prompt
alias claude-nest='claude --append-system-prompt "$(cat .claude/contexts/nestjs.md 2>/dev/null)"'
alias claude-py='claude --append-system-prompt "$(cat .claude/contexts/fastapi.md 2>/dev/null)"'
alias claude-ops='claude --append-system-prompt "$(cat .claude/contexts/devops.md 2>/dev/null)"'
alias claude-fe='claude --append-system-prompt "$(cat .claude/contexts/frontend.md 2>/dev/null)"'

# Common framings (always installed with `common`)
alias claude-dev='claude --append-system-prompt "$(cat .claude/contexts/dev.md 2>/dev/null)"'
alias claude-research='claude --append-system-prompt "$(cat .claude/contexts/research.md 2>/dev/null)"'
alias claude-review='claude --append-system-prompt "$(cat .claude/contexts/review.md 2>/dev/null)"'
```

Reload: `source ~/.zshrc` (or open a new terminal).

### 2. Run from your project root

```bash
cd ~/code/my-fastapi-svc
claude-py        # opens Claude Code with FastAPI mode framing pre-loaded
```

### Alias → context map

| Alias             | Loads                              | Best for                          |
|-------------------|------------------------------------|-----------------------------------|
| `claude-nest`     | `.claude/contexts/nestjs.md`       | NestJS API / DB work              |
| `claude-py`       | `.claude/contexts/fastapi.md`      | FastAPI / DB work                 |
| `claude-ops`      | `.claude/contexts/devops.md`       | Infra, Terraform, K8s, ArgoCD     |
| `claude-fe`       | `.claude/contexts/frontend.md`     | React / Next.js / Tailwind        |
| `claude-dev`      | `.claude/contexts/dev.md`          | Fast coding, any stack            |
| `claude-research` | `.claude/contexts/research.md`     | Exploring an unfamiliar codebase  |
| `claude-review`   | `.claude/contexts/review.md`       | PR review, security audit         |

### Notes

- The path is **relative** (`.claude/contexts/...`) — one alias works across every project where you've installed the matching context. Run it from the project root.
- `2>/dev/null` makes the alias degrade to plain `claude` if you're outside an installed project (no error noise).
- Adding a new framing? Drop it into `contexts/<ctx>/contexts/<name>.md`, re-run `./install.sh --context <ctx> --force`, then add a matching alias following the pattern above.
- `--append-system-prompt` **adds to** the default Claude Code system prompt — it doesn't replace it. Project-level CLAUDE.md, agents, and hooks still apply.

---

## Agents Catalogue

> All agents are Markdown files with YAML frontmatter. Claude Code delegates to them via the `Task` tool based on their `description`.

### Common (always installed)

| Agent | Model | When to use |
|-------|-------|-------------|
| **architect** | Opus | Design a new system or major subsystem. Use before `/plan` when the shape of the solution is still open. |
| **planner** | Opus | Turn a feature request into a step-by-step implementation plan. Triggered by `/plan`. |
| **code-reviewer** | Sonnet | Generalist review pass — style, readability, logic bugs. Use before opening a PR. |
| **code-explorer** | Sonnet | "Where is X implemented?" / "How does this subsystem work?" — codebase navigation without modifying files. |
| **refactor-cleaner** | Sonnet | Rename, extract, de-duplicate — pure refactors with no behavior change. Triggered by `/refactor-clean`. |
| **performance-optimizer** | Sonnet | Profile and speed up a specific hot path. Ask explicitly — not routed automatically. |
| **doc-updater** | Sonnet | Sync README / CHANGELOG / comments after a behavioural change. Use after a feature lands. |
| **docs-lookup** | Sonnet | "How does library X do Y?" — uses the `context7` MCP to fetch live API docs. |

> `build-error-resolver` is shipped **per stack** (fastapi / nestjs / frontend), not in common — each variant speaks its stack's tooling (`uv run mypy` for Python, `npx tsc` for TS). Triggered by `/build-fix`.

### NestJS (`--context nestjs`)

| Agent | Model | When to use |
|-------|-------|-------------|
| **nestjs-reviewer** | Sonnet | Review NestJS modules, DI wiring, decorators, guards, interceptors. |
| **database-reviewer** | Sonnet | Schema, migration safety, query correctness, indexing. Works across Postgres/MySQL/etc. |

### FastAPI (`--context fastapi`)

| Agent | Model | When to use |
|-------|-------|-------------|
| **fastapi-reviewer** | Sonnet | Review FastAPI routers, Pydantic models, async patterns, dependency injection. |
| **database-reviewer** | Sonnet | (Shared with `nestjs`) Schema, migration safety, query correctness, indexing. |

### DevOps (`--context devops`)

| Agent | Model | When to use |
|-------|-------|-------------|
| **terraform-reviewer** | Sonnet | HCL code review — state, providers, variables, module hygiene. |
| **terragrunt-reviewer** | Sonnet | `terragrunt.hcl`, dependency graphs, stack/layer separation, `prevent_destroy`. |
| **k8s-reviewer** | Sonnet | Raw Kubernetes YAML — RBAC, probes, resources, security context. |
| **argocd-reviewer** | Sonnet | `Application` / `ApplicationSet` manifests, sync waves, health checks, PruneLast. |
| **helm-reviewer** | Sonnet | Chart structure, `values.yaml` hierarchies, `_helpers.tpl`, chart lint. |
| **kustomize-reviewer** | Sonnet | Base/overlay layout, strategic merges, components, secret generators. |
| **aws-architect** | Opus | Design AWS architectures — VPC, IAM, compute choice, cost tradeoffs. |
| **infra-security-reviewer** | Sonnet | Cross-cutting infra security pass — secrets in state, public S3, open SGs, etc. |

### Frontend (`--context frontend`)

| Agent | Model | When to use |
|-------|-------|-------------|
| **frontend-reviewer** | Sonnet | React/Next review — rendering model, hooks, a11y, type safety. |
| **e2e-runner** | Sonnet | Run Playwright flows, triage failures. Pairs with the `playwright` MCP server. |

---

## Commands & Hooks — see per-context docs

Slash commands (e.g. `/plan`, `/fastapi-scaffold`, `/tf-plan-review`) and the full hook lifecycle are documented where they make sense: inside each context. After installing, read the relevant file from `.claude/docs/`.

| Topic | Where |
|---|---|
| Universal commands (`/plan`, `/code-review`, `/refactor-clean`, `/build-fix`, `/checkpoint`, `/learn`, `/prompt-optimize`) | [`contexts/common/README.md`](./contexts/common/README.md) |
| NestJS commands (`/nestjs-scaffold`, `/db-migrate`) + 10 backend scenarios | [`contexts/nestjs/README.md`](./contexts/nestjs/README.md) |
| FastAPI commands (`/fastapi-scaffold`, `/db-migrate`) + 10 backend scenarios | [`contexts/fastapi/README.md`](./contexts/fastapi/README.md) |
| DevOps commands (all 8) + 10 infra scenarios | [`contexts/devops/README.md`](./contexts/devops/README.md) |
| Frontend scenarios + prompt patterns | [`contexts/frontend/README.md`](./contexts/frontend/README.md) |
| **Internals**: full hook lifecycle (SessionStart → PreToolUse → PostToolUse → PreCompact → Stop), each hook script, session memory pipeline, model routing, settings merge strategy | [`contexts/common/INTERNALS.md`](./contexts/common/INTERNALS.md) |

Quick reference — the baseline `common` hooks cover session memory (`session-start`/`session-end`), safety gates (no-verify block, secret scan, config protection), and auto-format + type-check on every JS/TS/Python Edit/Write. The `devops` context adds prod-safety gates for `terraform apply`, `kubectl apply|delete` on prod, and `terragrunt run-all apply`.

---

## MCP Servers

Each context ships a `mcp-servers.json`. The installer merges all selected contexts into a single **`.mcp.json`** at the target project root (project scope — see [Claude Code MCP docs](https://code.claude.com/docs/en/mcp#project-scope)). Commit `.mcp.json` to share servers with teammates; Claude Code prompts each user to approve third-party servers on first use. Example servers ship with placeholder credentials — fill them in (via `${VAR}` references or `.env`) before enabling.

| Server | Context | Purpose |
|--------|---------|---------|
| `github` | common | PRs, issues, repo search |
| `context7` | common | Live API docs lookup — pairs with `docs-lookup` agent |
| `exa-web-search`, `firecrawl` | common | Web search / scrape |
| `sequential-thinking`, `memory`, `filesystem` | common | Reasoning helpers |
| `jira`, `confluence` | common | Atlassian ops |
| `token-optimizer` | common | Prompt-size helpers |
| `supabase`, `clickhouse` | fastapi, nestjs | DB / analytics (shipped in both) |
| `vercel`, `railway`, `cloudflare-docs` | devops | Deploy / docs |
| `playwright`, `browserbase`, `browser-use`, `magic` | frontend | Browser automation / UI gen |

---

## Multi-Harness (Cursor / Codex)

**Cursor** — rules go to `.cursor/rules/*.mdc` (flattened, hook/agents skipped):

```bash
./install.sh --context frontend --target cursor --dir ~/code/my-next-app
```

**Codex** — rules / agents / contexts land under `.codex/references/`:

```bash
./install.sh --context nestjs --target codex --dir ~/code/api
```

Other harnesses aren't targeted; the Claude Code install is the canonical path.

---

## Developing smart-claude Itself

```bash
git clone <repo-url>
cd smart-claude
# Run the test suite (no external deps, uses Node's built-in test runner):
node tests/run-all.js
```

To work inside the repo with Claude Code, install the full bundle into the repo itself:

```bash
cd smart-claude
./install.sh --context all --dir . --force
claude
```

Then edit `contexts/<name>/…` directly — on the next install into a target project, your changes propagate.

Repo layout:

```
smart-claude/
├── contexts/
│   ├── common/              always included
│   │   ├── agents/          10 generalist reviewers, planners, explorers
│   │   ├── commands/        10 slash commands
│   │   ├── rules/common/    baseline rules every stack benefits from
│   │   ├── skills/          27 shared skills
│   │   ├── contexts/        dev.md / research.md / review.md framings
│   │   ├── settings.json    shared hook registrations
│   │   └── mcp-servers.json shared MCP servers
│   ├── fastapi/             FastAPI + PostgreSQL
│   ├── nestjs/              NestJS + PostgreSQL
│   ├── devops/              Terraform + Terragrunt + K8s + ArgoCD + Helm + Kustomize + AWS
│   └── frontend/            React + Next + Tailwind + shadcn/ui + E2E
├── scripts/
│   ├── hooks/               Node hook scripts (portable via ${CLAUDE_PROJECT_DIR})
│   ├── lib/                 shared helpers (resolve-formatter, utils)
│   └── install.js           the installer
├── tests/                   node:test suite
├── install.sh / install.ps1 thin wrappers around scripts/install.js
└── package.json             no runtime deps — engines: node >= 18
```

---

## Troubleshooting

**"claude doesn't see my agents."**
Run `claude` from the repo root where you installed (`./install.sh --dir .` or default cwd). `.claude/settings.json` is loaded per-project.

**"Hooks error out with `CLAUDE_PROJECT_DIR: unbound variable`."**
Your Claude Code version doesn't set `${CLAUDE_PROJECT_DIR}`. The hook scripts fall back to `process.cwd()`; the shell guardrail hooks (inline in `settings.json`) use `"${CLAUDE_PROJECT_DIR}"` with quoted expansion. Upgrade Claude Code to a recent version.

**"post-edit-typecheck is slow on big repos."**
Edit `.claude/settings.json` to drop the PostToolUse hook that runs `post-edit-typecheck.js`, or delete the script.

**"I want to re-install and overwrite."**
Add `--force`:

```bash
./install.sh --context frontend --force
```

**"I installed the wrong context — how do I swap it?"**
Remove `.claude/` and `.mcp.json` in the target, then re-run with the right `--context`:

```bash
rm -rf .claude .mcp.json
./install.sh --context devops
```

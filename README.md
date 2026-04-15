# smart-claude

A **context-isolated** Claude Code toolkit. Clone once, then install only the config your repo needs — `frontend` into your Next.js app, `devops` into your Terraform repo, or `backend` into your NestJS/FastAPI service.

- **Context-first** — agents, commands, rules, skills, hooks, and MCP servers are grouped by workflow (`common`, `backend`, `devops`, `frontend`). No more wading through Terraform reviewers in a React repo.
- **One command to install** — `./install.sh --context frontend` copies `common + frontend` into the target repo's `.claude/` and `scripts/hooks/` directories. Run `claude` and you're done.
- **Portable hooks** — every hook resolves paths via `${CLAUDE_PROJECT_DIR}`, so they fire from any cloned location without user-dir setup.
- **Multi-harness** — install into Claude Code (`.claude/`), Cursor (`.cursor/rules/*.mdc`), or Codex (`references/`).

---

## Table of Contents

- [Quick Start](#quick-start)
- [What Each Context Includes](#what-each-context-includes)
- [Install Guide](#install-guide)
- [Agents Catalogue](#agents-catalogue)
- [Commands Catalogue](#commands-catalogue)
- [Hooks Catalogue](#hooks-catalogue)
- [MCP Servers](#mcp-servers)
- [Multi-Harness (Cursor / Codex)](#multi-harness-cursor--codex)
- [Developing smart-claude Itself](#developing-smart-claude-itself)
- [Troubleshooting](#troubleshooting)

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

**Full-stack monorepo** (`backend + frontend`):

```bash
~/tools/smart-claude/install.sh --context backend,frontend
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
| `common` | baseline — always installed | 10 | 10 | 1 bundle | 27 |
| `backend` | NestJS, FastAPI, PostgreSQL | 3 | 3 | 2 bundles | 5 |
| `devops` | Terraform, Terragrunt, K8s, ArgoCD, Helm, Kustomize, AWS | 8 | 8 | 7 bundles | 2 |
| `frontend` | React, Next.js, Tailwind, shadcn/ui, E2E | 2 | 0 | 1 bundle | 4 |

See each context's own README for details:
- [contexts/common/README.md](./contexts/common/README.md)
- [contexts/backend/README.md](./contexts/backend/README.md)
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
| NestJS / FastAPI service             | `backend`                     |
| Terraform / K8s / ArgoCD infra repo  | `devops`                      |
| Full-stack monorepo                  | `backend,frontend`            |
| Platform repo (infra + API)          | `backend,devops`              |
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
3. `.claude/mcp-servers.json` — merged MCP server registrations.
4. `scripts/hooks/` + `scripts/lib/` — the hook runtime that `.claude/settings.json` invokes.

### 4. Install flags

| Flag | Description |
|------|-------------|
| `--context <names>` | Required. Comma-separated. `frontend`, `backend,devops`, or `all`. |
| `--dir <path>` | Target project root. Default: current directory. |
| `--target <harness>` | `claude` (default), `cursor`, or `codex`. |
| `--dry-run` | Print planned file operations without writing. |
| `--force` | Overwrite existing files. Without it, existing files are skipped. |
| `--skip-scripts` | Don't copy `scripts/hooks/` or `scripts/lib/`. |
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
| **build-error-resolver** | Sonnet | CI/build is red and you want the root cause fixed (not silenced). Triggered by `/build-fix`. |
| **performance-optimizer** | Sonnet | Profile and speed up a specific hot path. Ask explicitly — not routed automatically. |
| **doc-updater** | Sonnet | Sync README / CHANGELOG / comments after a behavioural change. Use after a feature lands. |
| **docs-lookup** | Sonnet | "How does library X do Y?" — uses the `context7` MCP to fetch live API docs. |
| **chief-of-staff** | Opus | Multi-day project coordination — breaks down epics, tracks dependencies across agents. |

### Backend (`--context backend`)

| Agent | Model | When to use |
|-------|-------|-------------|
| **nestjs-reviewer** | Sonnet | Review NestJS modules, DI wiring, decorators, guards, interceptors. |
| **fastapi-reviewer** | Sonnet | Review FastAPI routers, Pydantic models, async patterns, dependency injection. |
| **database-reviewer** | Sonnet | Schema, migration safety, query correctness, indexing. Works across Postgres/MySQL/etc. |

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

## Commands Catalogue

> Slash commands live under `.claude/commands/` and are invoked in Claude Code as `/command-name`.

### Common

| Command | Scenario |
|---------|----------|
| `/plan` | "I want to add feature X — plan it out." Routes through the `planner` agent. |
| `/code-review` | Review the current diff before opening a PR. |
| `/refactor-clean` | Pure refactor — rename, extract, de-duplicate. |
| `/build-fix` | CI is red. Get it green without silencing the failure. |
| `/checkpoint` | Save a session checkpoint (state, todo, next steps) — resume later. |
| `/learn` | Extract a reusable pattern from the current session into a skill. |
| `/prompt-optimize` | Tighten a prompt file or agent instruction for clarity and cost. |
| `/switch-backend` | Load the backend context framing into the current session. |
| `/switch-devops` | Load the DevOps context framing. |
| `/switch-frontend` | Load the frontend context framing. |

### Backend

| Command | Scenario |
|---------|----------|
| `/nestjs-scaffold` | Generate a NestJS module (controller + service + tests) from a feature description. |
| `/fastapi-scaffold` | Generate a FastAPI router (route + service + Pydantic models + tests). |
| `/db-migrate` | Draft and review a migration (schema change + backfill + rollback plan). |

### DevOps

| Command | Scenario |
|---------|----------|
| `/tf-plan-review` | Run `terraform plan` then route output to `terraform-reviewer` for gating. |
| `/terragrunt-plan` | `terragrunt run-all plan` with review gating across stacks. |
| `/argocd-audit` | Scan `Application` manifests for anti-patterns (auto-sync safety, RBAC). |
| `/helm-lint` | `helm lint` + values schema validation. |
| `/kustomize-diff` | Render + diff overlays before applying. |
| `/k8s-audit` | Audit raw YAML for RBAC / resource limit / probe issues. |
| `/aws-cost-check` | Surface unexpected cost drivers in the AWS account from recent Terraform changes. |
| `/infra-security-scan` | Cross-tool infra security pass. |

### Frontend

The `frontend` context currently ships no dedicated slash commands — `/plan`, `/code-review`, and `/e2e` (delegated via the `e2e-runner` agent) cover the core flows.

---

## Hooks Catalogue

> Hooks live in `scripts/hooks/` and are registered in `.claude/settings.json`. They run on events Claude Code emits: `SessionStart`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop`.

### Common — always installed

| Hook | Event | What it does | When it helps |
|------|-------|-------------|---------------|
| `session-start.js` | `SessionStart` | Loads the previous session summary + file list into context. | You resume work without re-explaining what you did yesterday. |
| `(inline) --no-verify block` | `PreToolUse` (Bash) | Blocks `git push --no-verify` / `git commit --no-verify`. | You can't accidentally skip pre-commit hooks. |
| `pre-bash-git-push-reminder.js` | `PreToolUse` (Bash) | Reminds you to review the diff and run tests before pushing. | Catches "I forgot to run the tests" moments. |
| `(inline) tmux reminder` | `PreToolUse` (Bash) | Suggests running long-lived `npm run dev` / `pytest` inside tmux. | Prevents lost sessions when the terminal closes. |
| `commit-quality.js` | `PreToolUse` (Bash) | Blocks commits with secrets; warns on `console.log`; nudges toward conventional-commit prefixes. | Stops credential leaks and noisy commits. |
| `config-protection.js` | `PreToolUse` (Write/Edit) | Blocks edits to `.eslintrc`, `.prettierrc`, `tsconfig.json`, etc. unless explicitly allowed. | "Fix the code, not the config." |
| `doc-file-warning.js` | `PreToolUse` (Write) | Warns on ad-hoc `NOTES.md` / `TODO.md` / `SCRATCH.md` outside structured dirs. | Keeps the repo tidy. |
| `suggest-compact.js` | `PreToolUse` (*) | Suggests `/compact` after N tool calls. Async. | Keeps context window healthy on long sessions. |
| `post-edit-format.js` | `PostToolUse` (Edit/Write/MultiEdit) | Auto-formats JS/TS via Biome -> Prettier -> none. Async. | No more "run the formatter" loops. |
| `post-edit-typecheck.js` | `PostToolUse` (Edit/Write/MultiEdit) | Runs `tsc --noEmit` / `mypy` on touched files. Async. | Fast-fail on type errors before you commit. |
| `(inline) console.log warn` | `PostToolUse` (Edit/Write) | Warns if `console.log` slipped into a `.ts/.tsx/.js/.jsx` file. | Debug-log safety net. |
| `pre-compact.js` | `PreCompact` | Writes a compaction marker into the active session file. | Session summary remains coherent after `/compact`. |
| `session-end.js` | `Stop` (async) | Persists session summary to `~/.claude/session-data/`. | Next `session-start.js` can rehydrate the conversation. |
| `cost-tracker.js` | `Stop` (async) | Appends token usage + $ estimate to `~/.claude/metrics/costs.jsonl`. | You know what a refactor really cost you. |
| `evaluate-session.js` | `Stop` (async) | Flags sessions with 10+ messages for skill extraction via `/learn`. | Turns repeat work into reusable skills. |

### Backend — additions

| Hook | Event | What it does |
|------|-------|-------------|
| `(inline) ruff format + check --fix` | `PostToolUse` (Edit/Write) on `.py` | Runs `ruff format` then `ruff check --fix` on edited Python files. |

### DevOps — additions

| Hook | Event | What it does |
|------|-------|-------------|
| `(inline) terraform apply guard` | `PreToolUse` (Bash) | Blocks `terraform apply` without `-auto-approve=false` / explicit confirmation. |
| `(inline) kubectl prod guard` | `PreToolUse` (Bash) | Blocks `kubectl apply` / `delete` pointing at a prod context unless env var gate set. |
| `(inline) terragrunt run-all apply guard` | `PreToolUse` (Bash) | Blocks `terragrunt run-all apply`. |
| `(inline) ArgoCD prod sync warn` | `PreToolUse` (Bash) | Warns on `argocd app sync` / `delete` for prod-tagged apps. |

### Frontend — additions

Frontend currently adds no hooks beyond the common set (Biome/Prettier via `post-edit-format.js` already covers JS/TS).

### Hook runtime flags

Hooks route through `scripts/hooks/run-with-flags.js`, which reads two env vars so you can dial the stack on a per-session basis:

```bash
# Disable a specific hook this session:
SC_DISABLED_HOOKS=post-edit-typecheck,suggest-compact claude

# Run with a lighter profile (minimal | standard | strict):
SC_HOOK_PROFILE=minimal claude
```

---

## MCP Servers

`mcp-servers.json` registrations merge across contexts. The example servers ship with placeholder credentials — fill them in `.env` or the MCP config before use.

| Server | Context | Purpose |
|--------|---------|---------|
| `github` | common | PRs, issues, repo search |
| `context7` | common | Live API docs lookup — pairs with `docs-lookup` agent |
| `exa-web-search`, `firecrawl` | common | Web search / scrape |
| `sequential-thinking`, `memory`, `filesystem` | common | Reasoning helpers |
| `jira`, `confluence` | common | Atlassian ops |
| `token-optimizer` | common | Prompt-size helpers |
| `supabase`, `clickhouse` | backend | DB / analytics |
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
./install.sh --context backend --target codex --dir ~/code/api
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
│   ├── backend/             NestJS + FastAPI + PostgreSQL
│   ├── devops/              Terraform + Terragrunt + K8s + ArgoCD + Helm + Kustomize + AWS
│   └── frontend/            React + Next + Tailwind + shadcn/ui + E2E
├── scripts/
│   ├── hooks/               Node hook scripts (portable via ${CLAUDE_PROJECT_DIR})
│   ├── lib/                 shared helpers (hook-flags, utils)
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
Disable per-session: `SC_DISABLED_HOOKS=post-edit-typecheck claude`. Or switch to the minimal profile: `SC_HOOK_PROFILE=minimal claude`.

**"I want to re-install and overwrite."**
Add `--force`:

```bash
./install.sh --context frontend --force
```

**"I installed the wrong context — how do I swap it?"**
Remove `.claude/` in the target and re-run with the right `--context`:

```bash
rm -rf .claude
./install.sh --context devops
```

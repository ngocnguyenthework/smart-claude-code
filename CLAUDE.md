# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in **this repository** (`smart-claude`). The repo is a **source tree** that you install *into* other projects — it is not itself a project-local `.claude/` config.

## What This Is

`smart-claude` is a context-isolated Claude Code toolkit. The source of truth lives under `contexts/<name>/` — each context (`common`, `fastapi`, `nestjs`, `devops`, `frontend`) is a self-contained bundle of agents, commands, rules, skills, session framings, a `settings.json`, and an `mcp-servers.json`.

Users run `./install.sh --context <names>` in their target project; the installer copies `common + <selected>` into the target's `.claude/` (including `.claude/scripts/hooks/` + `.claude/scripts/lib/`), drops per-context workflow READMEs + `INTERNALS.md` under `.claude/docs/`, and writes a project-scope `.mcp.json` at the project root (per [Claude Code MCP docs](https://code.claude.com/docs/en/mcp#project-scope)).

**Tech coverage**: NestJS · FastAPI · PostgreSQL · React · Next.js · Tailwind · shadcn/ui · Terraform · Terragrunt · Kubernetes · ArgoCD · Helm · Kustomize · AWS

## Running

```bash
# Install this toolkit into another project:
./install.sh --context <name>[,<name>...] [--target claude|cursor|codex] [--dry-run] [--force]

# Work on smart-claude itself with Claude Code:
./install.sh --context all --dir . --force
claude

# Run the test suite (no external deps — node:test):
node tests/run-all.js
```

Hook script paths use `${CLAUDE_PROJECT_DIR}` so they resolve correctly wherever the target project lives.

## Repository Layout

```
contexts/
├── common/     always installed — session memory, safety, generalist agents
│   ├── README.md       universal workflows → target's .claude/docs/common-README.md
│   └── INTERNALS.md    hook/memory/guardrail internals → target's .claude/docs/INTERNALS.md
├── fastapi/    FastAPI + PostgreSQL (agent, rules, scaffold + shared DB tooling)
│   └── README.md       10 backend scenarios → target's .claude/docs/fastapi-README.md
├── nestjs/     NestJS + PostgreSQL (agent, rules, scaffold + shared DB tooling)
│   └── README.md       10 backend scenarios → target's .claude/docs/nestjs-README.md
├── devops/     Terraform + Terragrunt + K8s + ArgoCD + Helm + Kustomize + AWS
│   └── README.md       10 infra scenarios → target's .claude/docs/devops-README.md
└── frontend/   React + Next.js + Tailwind + shadcn/ui + E2E
    └── README.md       8 UI scenarios → target's .claude/docs/frontend-README.md

Each contexts/<name>/ follows the same shape:
  agents/ commands/ rules/ skills/ contexts/ settings.json mcp-servers.json README.md

scripts/
├── hooks/      Node hook scripts (copied into target's .claude/scripts/hooks/)
├── lib/        shared hook helpers (hook-flags.js, etc.) → target's .claude/scripts/lib/
└── install.js  the installer
tests/          node:test suite (install.test.js, contexts.test.js, lib/*.test.js)
```

There is **no** `.claude/` directory at the repo root — the installer generates one in the *target* project.

## File Format Conventions

### Agents (`contexts/<ctx>/agents/*.md`)
YAML frontmatter required:
```yaml
---
name: agent-name
description: <when to use — shown to Claude for routing decisions>
tools: ["Read", "Grep", "Glob", "Bash"]
model: haiku | sonnet | opus
---
```
Model routing: Haiku for exploration/simple edits, Sonnet for multi-file coding/review, Opus for architecture/complex debugging.

### Commands (`contexts/<ctx>/commands/*.md`)
Must start with `description:` frontmatter line. Content describes when to invoke, which agent to delegate to, and what steps to follow.

### Rules (`contexts/<ctx>/rules/<stack>/*.md`)
Each stack folder contains up to four files: `coding-style.md`, `patterns.md`, `security.md`, `testing.md`. Severity levels: CRITICAL → HIGH → MEDIUM → LOW.

### Skills (`contexts/<ctx>/skills/*.md` or `**/SKILL.md`)
Passive knowledge documents. Structured as: context → pattern → code example → when to apply.

### Contexts (`contexts/<ctx>/contexts/*.md`)
Session framings / system prompts loaded via shell aliases (e.g. `claude-nest`, `claude-py`) that pass them through `--append-system-prompt`. Self-contained — no frontmatter.

### Hooks (`contexts/<ctx>/settings.json`)
Per-context hook registrations. The installer **merges** hook arrays per event across `common + <selected>` into the target's `.claude/settings.json`. Scripts land in the target's `.claude/scripts/hooks/*.js` (source: `scripts/hooks/*.js` in this repo) and are invoked with absolute paths via `${CLAUDE_PROJECT_DIR}/.claude/scripts/hooks/...`. The `run-with-flags.js` wrapper adds `SC_HOOK_PROFILE` and `SC_DISABLED_HOOKS` env-var gating. All scripts must `exit 0` on non-critical errors.

### MCP servers (`contexts/<ctx>/mcp-servers.json`)
Per-context MCP registrations. The installer merges `mcpServers` keys across contexts and writes a single **project-scope `.mcp.json`** at the target project root (not inside `.claude/`). See [Claude Code MCP docs — project scope](https://code.claude.com/docs/en/mcp#project-scope). Last context wins on key collision (`Object.assign`).

## Architecture

### Install Merge Strategy
- **Files** (agents/commands/rules/skills/contexts): union across `common + <selected>`; later contexts don't override earlier (collisions are skipped unless `--force`).
- **`settings.json#/hooks`**: per event, arrays are **concatenated** in context order (`common` first) and written to `.claude/settings.json`.
- **MCP `mcpServers`**: shallow-merged via `Object.assign` — last context wins on key collision. Written to `<root>/.mcp.json` (project scope).
- **Hook scripts** (`scripts/hooks/`, `scripts/lib/`): copied into the target's `.claude/scripts/`. Internal `../lib/*` requires keep working because both dirs move together.
- **Docs** (`contexts/<ctx>/README.md`, `contexts/common/INTERNALS.md`): copied into the target's `.claude/docs/` as `<ctx>-README.md` and `INTERNALS.md`. Skipped for `--target cursor` (rules-only by convention).

### Session Memory Pipeline (common)
```
SessionStart -> session-start.js      (loads <project>/.claude/.storage/session-data/ last 7 days)
Stop         -> session-end.js        (persists session summary)
             -> evaluate-session.js   (signals /learn after >=10 messages)
PreCompact   -> pre-compact.js        (marks compaction boundary in session file)
```

Per-project state lives under `<target>/.claude/.storage/` (created on first run). The folder is project-scoped — add `.claude/.storage/` to the target's `.gitignore` if you don't want to commit session memory.

### Safety Guardrails (common + devops PreToolUse)
- Blocks `git` with `--no-verify`
- Reminds to review diff before `git push`
- Detects hardcoded secrets (AWS keys, API tokens)
- Nudges toward conventional commit format
- Blocks mutations to linter/formatter config files
- Suggests `/compact` at strategic intervals (configurable via `COMPACT_THRESHOLD`)
- (devops) Blocks `terraform apply` / `terragrunt run-all apply`
- (devops) Blocks `kubectl apply/delete` to production contexts
- (devops) Warns on `argocd app sync/delete` for prod apps

## File Naming
Lowercase with hyphens: `nestjs-reviewer.md`, `session-start.js`, `coding-style.md`.

## Testing

```bash
node tests/run-all.js
```

- `tests/install.test.js` — end-to-end install behaviour (contexts, flags, cursor/codex remap, --force)
- `tests/contexts.test.js` — structural invariants per context (required folders, valid JSON)
- `tests/lib/hook-flags.test.js` — `SC_HOOK_PROFILE` / `SC_DISABLED_HOOKS` gating

Add tests when you change anything in `scripts/`, add a new context, or change the install contract.

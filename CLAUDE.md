# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in **this repository** (`smart-claude`). The repo is a **source tree** that you install *into* other projects — it is not itself a project-local `.claude/` config.

## What This Is

`smart-claude` is a context-isolated Claude Code toolkit. The source of truth lives under `contexts/<name>/` — each context (`common`, `backend`, `devops`, `frontend`) is a self-contained bundle of agents, commands, rules, skills, session framings, a `settings.json`, and an `mcp-servers.json`.

Users run `./install.sh --context <names>` in their target project; the installer copies `common + <selected>` into the target's `.claude/` and `scripts/hooks/` + `scripts/lib/`.

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
├── backend/    NestJS + FastAPI + PostgreSQL
├── devops/     Terraform + Terragrunt + K8s + ArgoCD + Helm + Kustomize + AWS
└── frontend/   React + Next.js + Tailwind + shadcn/ui + E2E

Each contexts/<name>/ follows the same shape:
  agents/ commands/ rules/ skills/ contexts/ settings.json mcp-servers.json

scripts/
├── hooks/      Node hook scripts (copied into target's scripts/hooks/)
├── lib/        shared hook helpers (hook-flags.js, etc.)
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
Session framings / system prompts loaded by the `/switch-*` commands. Self-contained — no frontmatter.

### Hooks (`contexts/<ctx>/settings.json`)
Per-context hook registrations. The installer **merges** hook arrays per event across `common + <selected>` into the target's `.claude/settings.json`. Scripts live in `scripts/hooks/*.js` and are invoked with absolute paths via `${CLAUDE_PROJECT_DIR}/scripts/hooks/...`. The `run-with-flags.js` wrapper adds `SC_HOOK_PROFILE` and `SC_DISABLED_HOOKS` env-var gating. All scripts must `exit 0` on non-critical errors.

### MCP servers (`contexts/<ctx>/mcp-servers.json`)
Per-context MCP registrations. The installer merges `mcpServers` keys across contexts into the target's `.claude/mcp-servers.json` via `Object.assign`.

## Architecture

### Install Merge Strategy
- **Files** (agents/commands/rules/skills/contexts): union across `common + <selected>`; later contexts don't override earlier (collisions are skipped unless `--force`).
- **`settings.json#/hooks`**: per event, arrays are **concatenated** in context order (`common` first).
- **`mcp-servers.json#/mcpServers`**: shallow-merged via `Object.assign` — last context wins on key collision.

### Session Memory Pipeline (common)
```
SessionStart -> session-start.js      (loads ~/.claude/session-data/ last 7 days)
Stop         -> session-end.js        (persists session summary)
             -> cost-tracker.js       (appends to ~/.claude/metrics/costs.jsonl)
             -> evaluate-session.js   (signals /learn after >=10 messages)
PreCompact   -> pre-compact.js        (marks compaction boundary in session file)
```

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

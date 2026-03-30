# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

SmartClaude is a Claude Code configuration toolkit — a collection of agents, commands, rules, skills, contexts, hooks, and MCP configs for full-stack and DevOps development. There is no build step, no test runner, and no package manager. Everything is Markdown + JSON.

**Tech coverage**: NestJS · FastAPI · PostgreSQL · React · Next.js · Tailwind · shadcn/ui · Terraform · AWS · Kubernetes

## File Format Conventions

### Agents (`agents/*.md`)
YAML frontmatter required:
```yaml
---
name: agent-name
description: <when to use — shown to Claude for routing decisions>
tools: ["Read", "Grep", "Glob", "Bash"]
model: haiku | sonnet | opus
---
```
Model routing principle: Haiku for exploration/simple edits, Sonnet for multi-file coding/review, Opus for architecture/complex debugging.

### Commands (`commands/*.md`)
Must start with `description:` frontmatter line. Content describes when and how to invoke the command, including which agent to use and what steps to follow.

### Rules (`rules/<stack>/*.md`)
Each stack folder (`common/`, `nestjs/`, `fastapi/`, `terraform/`, `kubernetes/`, `aws/`, `frontend/`) contains up to four files: `coding-style.md`, `patterns.md`, `security.md`, `testing.md`. Rules reference file path matchers and use severity levels: CRITICAL → HIGH → MEDIUM → LOW.

### Skills (`skills/*.md`)
Passive knowledge documents (no frontmatter). Structured as: context → pattern → code example → when to apply.

### Contexts (`contexts/*.md`)
System prompt profiles for shell aliases (`claude-be`, `claude-fe`, `claude-ops`, etc.). Each file is a self-contained system prompt — no frontmatter.

### Hooks (`hooks/hooks.json`)
Mirrors Claude Code `settings.json` hook format. Scripts live in `scripts/hooks/*.js` and are invoked via the `run-with-flags.js` wrapper. All scripts must `exit 0` on non-critical errors.

## Architecture

### Session Memory Pipeline
```
SessionStart → session-start.js  (loads ~/.claude/session-data/ last 7 days)
Stop         → session-end.js    (persists session summary)
             → cost-tracker.js   (appends to ~/.claude/metrics/costs.jsonl)
             → evaluate-session.js (signals /learn after ≥10 messages)
PreCompact   → pre-compact.js    (marks compaction boundary in session file)
```

### Safety Guardrails (PreToolUse hooks)
- Blocks `terraform apply` without a prior plan review
- Blocks `kubectl apply/delete` to production contexts
- Blocks `git` with `--no-verify`
- Detects hardcoded secrets (AWS keys, API tokens)
- Enforces conventional commit format
- Blocks mutations to linter/formatter config files

## Key Slash Commands
| Command | Purpose |
|---------|---------|
| `/plan` | Phased implementation plan |
| `/code-review` | Quality + security review |
| `/build-fix` | Incremental build/TS error fixing |
| `/refactor-clean` | Safe dead code removal |
| `/learn` | Extract reusable patterns from session |
| `/switch-backend` · `/switch-frontend` · `/switch-devops` | Switch rule context |
| `/nestjs-scaffold <name>` · `/fastapi-scaffold <name>` | Scaffold a module/domain |
| `/checkpoint <name>` | Save context snapshot |

## File Naming
Lowercase with hyphens: `nestjs-reviewer.md`, `session-start.js`, `coding-style.md`.

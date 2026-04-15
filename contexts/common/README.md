# contexts/common

The baseline bundle. Installed automatically with every `--context` selection.

**Install individually** (only common, no stack-specific items):

```bash
./install.sh --context common --dir ~/code/my-repo
```

## What's inside

| Folder | Contents |
|--------|----------|
| `agents/` | 10 generalist agents (see below) |
| `commands/` | 10 slash commands (see below) |
| `rules/common/` | cross-cutting style + security + testing rules applied to any stack |
| `skills/` | 27 shared skills (patterns, best-practice playbooks) |
| `contexts/` | `dev.md` / `research.md` / `review.md` session framings |
| `settings.json` | baseline hook registrations (session memory, safety, format) |
| `mcp-servers.json` | general-purpose MCP servers (GitHub, Context7, Jira, etc.) |

## Agents

| Agent | Use when |
|-------|----------|
| `architect` | Designing a new system / major subsystem. |
| `planner` | Turning a feature request into an implementation plan (`/plan`). |
| `code-reviewer` | Generalist PR review — style, logic bugs. |
| `code-explorer` | Navigating an unfamiliar codebase. |
| `refactor-cleaner` | Pure refactors (`/refactor-clean`). |
| `build-error-resolver` | Fixing CI/build breakage (`/build-fix`). |
| `performance-optimizer` | Profiling and speeding up a hot path. |
| `doc-updater` | Syncing README / CHANGELOG / comments after a change. |
| `docs-lookup` | Fetching live library docs (pairs with `context7` MCP). |
| `chief-of-staff` | Multi-day coordination across epics. |

## Commands

| Command | Use when |
|---------|----------|
| `/plan` | Need an implementation plan. |
| `/code-review` | About to open a PR. |
| `/refactor-clean` | Pure refactor only. |
| `/build-fix` | Build/CI is broken. |
| `/checkpoint` | Pausing — persist session state. |
| `/learn` | Turn this session into a reusable skill. |
| `/prompt-optimize` | Tighten an agent instruction or prompt file. |
| `/switch-fastapi`, `/switch-nestjs`, `/switch-devops`, `/switch-frontend` | Reframe the session into a stack context. |

## Hooks (baseline)

See the main [README](../../README.md#hooks-catalogue) for the full list. Highlights:

- `session-start` / `session-end` — cross-session memory
- `config-protection` — blocks edits to linter/formatter config
- `commit-quality` — secret scan + conventional-commit nudge
- `post-edit-format` / `post-edit-typecheck` — async format + type check on every Edit/Write
- `suggest-compact` — keep context window healthy

## MCP Servers

`github`, `context7`, `exa-web-search`, `firecrawl`, `sequential-thinking`, `memory`, `filesystem`, `jira`, `confluence`, `token-optimizer`.

Fill in credentials before enabling. All are opt-in via your MCP config.

# smart-claude internals

How the toolkit works under the hood: hook lifecycle, session memory, safety guardrails, model routing, settings merge strategy, MCP cost accounting. Read this when you want to understand *why* something happens automatically or how to disable it.

**Companion docs** (also in `.claude/docs/`):
- `common-README.md` — universal workflows (feature dev, bug fix, planning, prompt patterns)
- `<ctx>-README.md` — stack-specific scenarios (e.g. `fastapi-README.md`, `nestjs-README.md`, `devops-README.md`, `frontend-README.md`)

---

## Hook lifecycle

Claude Code emits five events. Each context registers Node scripts or inline shell commands against them. The installer merges registrations from `common + <selected contexts>` into `.claude/settings.json`.

```
SessionStart    Before your first prompt in a session.
PreToolUse      Before every tool call. Can block (exit 2) or warn (exit 0).
PostToolUse     After every successful tool call. Async — fire-and-forget.
PreCompact      Before Claude Code compacts its own context.
Stop            After Claude finishes responding to you.
```

### Per-hook reference

All Node scripts live in `.claude/scripts/hooks/` and are invoked through `run-with-flags.js`, which handles the `SC_HOOK_PROFILE` / `SC_DISABLED_HOOKS` gating (see below).

| Script | Event | What it does |
|---|---|---|
| `session-start.js` | SessionStart | Reads the most recent `*-session.tmp` from `.claude/.storage/session-data/` (within 7 days), injects it as `additionalContext` so a fresh session resumes with yesterday's tasks and file list. |
| `session-end.js` | Stop | Writes a session summary (user messages, tools used, files touched, branch, compaction markers) to `.claude/.storage/session-data/YYYY-MM-DD-<id>-session.tmp`. Async. |
| `evaluate-session.js` | Stop | For sessions with ≥10 user messages, drops a signal in `.claude/.storage/skills/learned/` prompting Claude to extract reusable patterns via `/learn` next session. Async. |
| `pre-compact.js` | PreCompact | Appends a timestamp marker to the active session file and to `.claude/.storage/session-data/compaction-log.txt` so the post-compaction summary stays coherent. |
| `commit-quality.js` | PreToolUse (Bash) | Blocks commits with hardcoded secrets (AWS / OpenAI / GitHub keys), `debugger` statements, or invalid conventional-commit format. Warns (doesn't block) on `console.log`. Exits 2 to block, 0 otherwise. |
| `config-protection.js` | PreToolUse (Write/Edit) | Blocks edits to `.eslintrc*`, `.prettierrc*`, `biome.json`, `tsconfig*.json`, `ruff.toml`, `pyproject.toml` `[tool.ruff]`, etc. Philosophy: fix the code, not the config. |
| `doc-file-warning.js` | PreToolUse (Write) | Warns on ad-hoc `NOTES.md`, `TODO.md`, `SCRATCH.md` created outside `docs/`, `.claude/`, `skills/`, `commands/`, `templates/`. Never blocks. |
| `suggest-compact.js` | PreToolUse (*) | Counts tool calls per session in a temp file; suggests `/compact` once the count crosses `COMPACT_THRESHOLD` (default 50). Async. |
| `post-edit-format.js` | PostToolUse (Edit/Write/MultiEdit) | Detects Biome or Prettier via `scripts/lib/resolve-formatter.js`, runs `biome check --write` or `prettier --write` on the edited JS/TS file. Prefers local `node_modules/.bin`. Fails silent if no formatter configured. |
| `post-edit-format-python.js` | PostToolUse (Edit/Write/MultiEdit) on `.py` | Runs `ruff format` then `ruff check --fix` on edited Python files. Resolves ruff from `.venv/bin` → `uv run` → `poetry run` → system bin. |
| `post-edit-typecheck.js` | PostToolUse (Edit/Write/MultiEdit) on `.ts`/`.tsx` | Finds the nearest `tsconfig.json` upward, runs `tsc --noEmit`, filters output to errors mentioning the edited file. |
| `post-edit-typecheck-python.js` | PostToolUse (Edit/Write/MultiEdit) on `.py` | Detects `mypy` / `pyright` / `ty`. Runs whichever is configured. No-op if none. Reports only errors on the edited file. |

### Inline shell hooks (defined directly in `settings.json`)

- **common**: blocks `git push --no-verify` / `git commit --no-verify`; reminds to run long-lived processes (`npm run dev`, `pytest -f`) inside `tmux` so the session survives terminal close; `console.log` grep warning after JS/TS edits.
- **devops**: blocks `terraform apply` without an immediately-prior plan; blocks `kubectl apply|delete` to a context named `prod*` unless an env-var gate is set; blocks `terragrunt run-all apply`; warns on `argocd app sync|delete` for prod-tagged apps.

---

## Hook gating — `SC_HOOK_PROFILE` and `SC_DISABLED_HOOKS`

`run-with-flags.js` (via `scripts/lib/hook-flags.js`) reads two env vars before running any hook:

### `SC_HOOK_PROFILE`

| Profile | Effect |
|---|---|
| `minimal` | Only safety gates (secrets, no-verify, config protection). Format/typecheck/suggest-compact skipped. |
| `standard` (default) | All hooks except opt-in strict ones. |
| `strict` | Everything, including the more noisy warnings. |

Each hook declares its allowed profiles in `settings.json` (defaults to `["standard", "strict"]` if unset).

### `SC_DISABLED_HOOKS`

Comma-separated hook IDs. Takes precedence over the profile — a disabled hook never runs.

```bash
SC_DISABLED_HOOKS=post-edit-typecheck,suggest-compact claude
SC_HOOK_PROFILE=minimal claude
```

### Gate logic

1. Normalize hook ID to lowercase.
2. If in `SC_DISABLED_HOOKS` → disabled (return false).
3. Get `SC_HOOK_PROFILE` (default: `standard`).
4. If profile is in hook's allowed profiles → run.

---

## Session memory pipeline

State lives at **`<project>/.claude/.storage/`** — project-scoped, not global. Add `.claude/.storage/` to `.gitignore` in the target if you don't want to commit session summaries.

```
.claude/.storage/
├── session-data/
│   ├── YYYY-MM-DD-<id>-session.tmp   # one per session, human-readable markdown
│   ├── YYYY-MM-DD-<id>-session.tmp
│   └── compaction-log.txt            # timestamp log of PreCompact firings
└── skills/
    └── learned/                       # patterns extracted via /learn
        ├── pattern-1.md
        └── pattern-2.md
```

### Flow

```
Day 1, session starts
  → session-start.js looks for *-session.tmp <7 days old
  → finds none (first session) → injects blank context

Day 1, you work on feature X
  → tool calls happen, suggest-compact counts them
  → at call #50, hook prints "consider /compact"

Day 1, you run /clear or close Claude
  → Stop event fires
  → session-end.js writes 2026-04-16-a3f2b1-session.tmp
  → evaluate-session.js sees 14 user messages → signals /learn

Day 2, new session
  → session-start.js reads 2026-04-16-a3f2b1-session.tmp
  → injects "yesterday: worked on feature X, touched these files"
  → you pick up without re-explaining
```

The session files are plain markdown. Edit them freely between sessions to add or remove context you want Claude to see.

---

## Settings merge strategy

When you run `./install.sh --context nestjs,frontend`, the installer does:

**`settings.json#/hooks`** — per event, arrays are **concatenated** in context order (`common` first, then each selected context in the order passed). Duplicates (by `JSON.stringify`) are de-duped. So common + nestjs + frontend's PostToolUse arrays all merge.

**MCP `mcpServers`** — shallow-merged via `Object.assign`. Last context wins on key collision. Written to **`<project-root>/.mcp.json`** (not inside `.claude/`) for Claude Code's project-scope MCP discovery ([docs](https://code.claude.com/docs/en/mcp#project-scope)).

**Files** (`agents/`, `commands/`, `rules/`, `skills/`, `contexts/`) — **union** across contexts. File-level collisions are skipped unless `--force`.

**Hook scripts** (`scripts/hooks/`, `scripts/lib/`) — copied wholesale into the target's `.claude/scripts/`. Internal `../lib/*` requires keep working because both dirs move together.

**Docs** (`contexts/<ctx>/README.md`, `contexts/common/INTERNALS.md`) — copied into `.claude/docs/` as `<ctx>-README.md` and `INTERNALS.md`. This file is an example.

---

## MCP servers — token cost accounting

Every MCP tool schema costs roughly **500 tokens per tool per request** (tool definitions ride along on every turn). A server with 30 tools costs more than all your skills files combined.

**Lean default**: keep `github` + `context7` always on; enable others only for the session that needs them, then disable.

**CLI over MCP** — for thin wrappers, prefer the CLI: `gh pr create` beats the GitHub MCP by ~5k tokens/session; `vercel deploy` beats the Vercel MCP similarly.

**Per-context MCP bundles** (merged into a single `.mcp.json` at project root):

| Server | Context |
|---|---|
| `github`, `context7` | common (always) |
| `sequential-thinking`, `firecrawl`, `exa-web-search`, `memory`, `filesystem`, `token-optimizer`, `jira`, `confluence` | common (as-needed) |
| `supabase`, `clickhouse` | fastapi, nestjs |
| `vercel`, `railway`, `cloudflare-docs` | devops |
| `playwright`, `browserbase`, `browser-use`, `magic` | frontend |

MCP servers ship with **placeholder credentials** (`YOUR_GITHUB_PAT_HERE`, etc.). Fill them via `${VAR}` references or `.env` before enabling.

---

## Safety guardrails

### Blocks (exit 2 — Claude cannot proceed)

| Trigger | Hook |
|---|---|
| `git commit/push --no-verify` | inline (common) |
| `terraform apply` without prior plan | inline (devops) |
| `terragrunt run-all apply` | inline (devops) |
| `kubectl apply\|delete` to prod context | inline (devops) |
| Hardcoded secret in staged file (AWS/OpenAI/GitHub keys) | commit-quality.js |
| `debugger` in staged file | commit-quality.js |
| Non-conventional commit message | commit-quality.js |
| Write/Edit to linter/formatter config | config-protection.js |

### Warnings (exit 0 — allowed, surfaced)

- `console.log` in staged JS/TS
- Ad-hoc doc filenames outside structured directories
- `argocd app sync|delete` for prod-tagged apps (devops)
- Long-running commands outside `tmux` (common)

### Auto-actions (PostToolUse, async)

- Python edit → `ruff format` + `ruff check --fix`
- JS/TS edit → `biome check --write` or `prettier --write`
- TS edit → `tsc --noEmit` on the edited file's project
- Python edit → configured type checker (mypy/pyright/ty) on the edited file

---

## Model routing

Used by agents (declared in each agent's `model:` frontmatter) and by command dispatch.

| Task | Model | Reason |
|---|---|---|
| File search, simple exploration | Haiku | Fast and cheap; sufficient for navigation |
| Single-file edits with clear instructions | Haiku | Minimal reasoning needed |
| Multi-file feature implementation | Sonnet | Best balance of cost and coding quality |
| PR review, code review | Sonnet | Catches nuance; understands context |
| Architecture / system design | Opus | Holds full system in mind; deep reasoning |
| Security analysis | Opus | Cost of missing a vulnerability > cost of tokens |
| Complex debugging (race conditions, perf) | Opus | Needs to reason about interactions |
| Docs / codemaps | Haiku | Structure is simple |

**Escalation rule**: start at the lowest tier that could plausibly succeed; escalate only when you hit a clear reasoning gap (not a knowledge gap — knowledge gaps are fixed by RAG / docs-lookup).

---

## Skills loading

Skills in `.claude/skills/` are **passive knowledge** — they aren't invoked. Claude Code loads their descriptions into context and pulls the body when it recognises a trigger in the conversation.

Structure of a skill:
- `context` — when this skill applies (one or two sentences)
- `pattern` — the reusable approach in abstract terms
- `code example` — concrete working code
- `when to apply` — triggers Claude should recognise

Because descriptions always load, keep them tight. A skill with a 300-word description pays that cost on every request.

---

## Agent lifecycle

Agents are Markdown files with YAML frontmatter. Claude Code routes `Task` tool calls to them based on the `description` field.

```yaml
---
name: nestjs-reviewer
description: Use after any NestJS module change — reviews DI, decorators, guards, interceptors.
tools: ["Read", "Grep", "Glob", "Bash"]
model: sonnet
---
```

**Proactive vs reactive** — agents with descriptions framed as "use after X" or "use when Y" get invoked automatically by Claude. Agents described as "ask explicitly for X" don't.

**Cost of an unused agent** — every agent description loads into context on every `Task` call. Keep descriptions crisp and prune agents you never use in a given context.

---

## Install contract

What the installer writes into a target project:

```
<target>/
├── .claude/
│   ├── agents/           # merged from common + <selected>
│   ├── commands/
│   ├── rules/
│   ├── skills/
│   ├── contexts/         # session framings (dev.md, research.md, nestjs.md, ...)
│   ├── settings.json     # merged hook registrations
│   ├── scripts/
│   │   ├── hooks/        # Node hook scripts
│   │   └── lib/          # shared helpers (hook-flags.js, resolve-formatter.js)
│   └── docs/             # this file + per-context READMEs
│       ├── INTERNALS.md
│       ├── common-README.md
│       ├── <ctx>-README.md
│       └── ...
└── .mcp.json             # merged MCP servers at project scope
```

Hook scripts use `${CLAUDE_PROJECT_DIR}` to resolve paths, so the install is position-independent.

---

## Where to go next

- A specific workflow → `.claude/docs/<ctx>-README.md` for your stack
- Universal patterns (bug fix, planning, code review) → `.claude/docs/common-README.md`
- Something weird happening → this file + `node ${CLAUDE_PROJECT_DIR}/.claude/scripts/hooks/run-with-flags.js --help`

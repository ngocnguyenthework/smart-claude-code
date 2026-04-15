# contexts/backend

NestJS + FastAPI + PostgreSQL coverage. Add on top of `common`.

**Install:**

```bash
./install.sh --context backend --dir ~/code/my-api
```

## Scenarios

- **You're building a NestJS service.** The `nestjs-reviewer` agent spots missing guards, circular DI, and leaky decorators. `/nestjs-scaffold` generates module + controller + service + tests from a feature description.
- **You're building a FastAPI service.** The `fastapi-reviewer` agent catches async pitfalls, Pydantic v1-vs-v2 drift, and dependency-injection missteps. `/fastapi-scaffold` generates router + service + models + tests.
- **You're changing a database schema.** `/db-migrate` routes through `database-reviewer` to draft the migration, backfill plan, and rollback path.
- **Python files get auto-formatted.** A `PostToolUse` hook runs `ruff format` then `ruff check --fix` after every `.py` Edit/Write.

## What's inside

| Folder | Contents |
|--------|----------|
| `agents/` | `nestjs-reviewer`, `fastapi-reviewer`, `database-reviewer` |
| `commands/` | `/nestjs-scaffold`, `/fastapi-scaffold`, `/db-migrate` |
| `rules/nestjs/` | coding-style, patterns, security, testing for NestJS |
| `rules/fastapi/` | coding-style, patterns, security, testing for FastAPI |
| `skills/` | 5 backend-specific skills (DB patterns, API conventions, etc.) |
| `contexts/backend.md` | backend session framing |
| `settings.json` | adds Python ruff auto-format/fix hook |
| `mcp-servers.json` | `supabase`, `clickhouse` |

## Pairs well with

- `--context backend,devops` — for a platform repo (API + infra)
- `--context backend,frontend` — for a full-stack monorepo

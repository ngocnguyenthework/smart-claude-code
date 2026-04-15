# contexts/fastapi

FastAPI + PostgreSQL coverage tuned to a specific production stack:
**Python 3.13 · FastAPI 0.115 · Pydantic v2 · SQLAlchemy 2.0 async · asyncpg · Alembic · uv · ruff.**

**Install:**

```bash
./install.sh --context fastapi --dir ~/code/my-api
```

## Opinionated defaults captured here

- **Layer-by-kind layout** (`src/{api/v1/routers,models,schemas,repositories,services,...}`) — not domain-driven.
- **`UUIDBase` / `AutoIncrementBase`** with built-in `created_at`, `updated_at`, `deleted_at`. **Soft-delete is the default.**
- **SQLAlchemy 2.0 `Mapped[]`** only — no legacy `Column()` typing.
- **`@transactional_session` decorator** on repository methods — not `Depends(get_db)` in routes. Services open explicit `async with get_db()` only for multi-step atomicity.
- **Module-level singletons** for services and repositories. `Depends()` is reserved for auth (`verify_api_key` / `verify_openwebui_access_token` / `verify_auth`).
- **Pydantic v2** with `Annotated[type, Field(...)]` and a shared `BaseResponseModel(from_attributes=True)`.
- **Nested `BaseSettings`** (DatabaseSettings, OpenWebUISettings, …) composed under one `Settings`.
- **Singleton `HttpClient`** (one `httpx.AsyncClient`), initialized in `lifespan`.
- **Global exception handler** + `HTTPException` only — no custom exception hierarchy.
- **stdlib `logging`** with per-module levels via env vars. No loguru/structlog.
- **uv** is the package manager. **ruff** is the only linter/formatter.

## Scenarios

- **Adding a feature.** `/fastapi-scaffold` generates model + schema + repository + service + router + Alembic migration, wired into the layer-by-kind structure.
- **Changing schema.** `/db-migrate` walks Alembic autogenerate + review via `database-reviewer`, including soft-delete partial indexes and concurrent index creation for large tables.
- **Reviewing a PR.** `fastapi-reviewer` enforces `@transactional_session`, `Mapped[]`, `BaseResponseModel`, auth-only `Depends`, and soft-delete integrity.
- **Python files get auto-formatted.** A `PostToolUse` hook runs `ruff format` then `ruff check --fix` after every `.py` Edit/Write.

## What's inside

| Folder | Contents |
|--------|----------|
| `agents/` | `fastapi-reviewer`, `database-reviewer` |
| `commands/` | `/fastapi-scaffold`, `/db-migrate` |
| `rules/fastapi/` | `coding-style`, `patterns`, `security`, `testing` — all tuned to this stack |
| `skills/` | `api-connector-builder`, `api-design`, `backend-patterns`, `database-migrations` |
| `contexts/fastapi.md` | Session framing loaded by `/switch-fastapi` |
| `settings.json` | Ruff auto-format/fix hook on `.py` Edit/Write |
| `mcp-servers.json` | `supabase`, `clickhouse` |

## Pairs well with

- `--context fastapi,devops` — platform repo (API + infra).
- `--context fastapi,frontend` — full-stack monorepo.
- `--context fastapi,nestjs` — polyglot backend (shared DB skills dedupe at install).

# FastAPI Development Mode

## Stack
**Python 3.13 · FastAPI 0.115+ · Pydantic v2 · SQLAlchemy 2.0 async · asyncpg · Alembic · uv · ruff**

> **Version note (Apr 2026):** latest FastAPI is **0.135.x**. This project pins `>=0.115.12,<0.116`. When touching API surface, know what has shipped upstream so new features aren't reinvented and breaking changes aren't introduced by accident (see "Upstream since 0.116" below).

## Upstream since 0.116 (know before using / upgrading)

- **0.132 — strict Content-Type (BREAKING).** JSON requests without `Content-Type: application/json` are rejected by default. Affects legacy clients that POST raw JSON without the header.
- **0.133 — Starlette 1.0+.** Exception groups from async `yield` dependencies are now unwrapped correctly.
- **0.134 — streaming with `yield`.** Native JSON Lines / NDJSON / binary streaming from path functions.
- **0.135 — Server-Sent Events.** `fastapi.EventSourceResponse`; yield plain dicts/Pydantic models or `ServerSentEvent(...)` for custom `event:`/`id:`/`retry:` fields. **Relevant for this RAG chatbot** if streaming ever moves in-process.
- **0.135.2 — pydantic>=2.9.0 required.**
- **DI modernization:** `Annotated[T, Depends(dep)]` is the official recommended signature style (since 0.95). `x: T = Depends(dep)` still works but new code should use `Annotated`.

## Project Shape (layer-by-kind, NOT domain-driven)
```
src/{api/v1/routers,models,schemas,services,repositories,middlewares,utils,common}
src/{main.py,launcher.py,core/{config,exceptions,http_client,logging}.py,db/{base,session}.py}
```
One file per entity inside each layer folder. Routers aggregate in `api/v1/api_v1.py`.

## Non-Negotiable Patterns
- **Models inherit `UUIDBase` or `AutoIncrementBase`** (from `db/base.py`) — both carry `created_at`, `updated_at`, `deleted_at`.
- **Soft delete is default.** Repositories filter `deleted_at IS NULL`; `delete()` sets `deleted_at`.
- **`Mapped[type]` everywhere** — SQLAlchemy 2.0 style only, no legacy `Column()`.
- **`@transactional_session` decorator** on repository methods — **not** `Depends(get_db)` in routes. Sessions flow implicitly unless you need multi-step atomicity (then `async with get_db() as db: ...` in the service).
- **Module-level singletons** for services/repositories (`company_service = CompanyService()`). `Depends()` is used **only for auth** (`verify_api_key`, `verify_openwebui_access_token`).
- **Thin routes**: validate params → call service → return. No DB, no logic.
- **Pydantic v2** with `Annotated[type, Field(...)]`; response models inherit `BaseResponseModel` (`ConfigDict(from_attributes=True)`).
- **Nested `BaseSettings`** — `DatabaseSettings`, `OpenWebUISettings`, etc. under one `Settings`.
- **Singleton `HttpClient`** for outbound HTTP, init/close in `lifespan`.
- **`HTTPException` only** — no custom exception hierarchy, one global catch-all handler.
- **stdlib `logging`** — not loguru/structlog. Per-module log levels via env vars.
- **`Annotated[T, Depends(...)]`** for dependency injection in new code; define reusable type aliases (`ApiKey = Annotated[str, Depends(verify_api_key)]`) and use them in router signatures.

## Behavior
- Type hints on every signature; no `Any` without a comment.
- Everything is `async def` — no sync DB, no `requests`, no `time.sleep`.
- Use `asyncio.gather` for fan-out; `asyncio.to_thread` for CPU/blocking work.
- `Path(gt=0)` / `Query(...)` — never accept raw ints/strings without constraints.
- Eager loading is **explicit** (`selectinload`, `joinedload`) — default lazy is a bug in async.
- No `print()` in production paths. No raw f-string SQL, ever.
- Absolute imports rooted at `src/` (PYTHONPATH is `/app/src`).

## Priorities
1. **Correctness & type safety** — ruff strict, explicit types, soft-delete integrity.
2. **Security** — auth dependencies present, API-key stored as SHA256 hash, parameterized queries.
3. **Performance** — async all the way, N+1 avoidance, explicit pool settings.
4. **Tests** — currently sparse; when adding, use `pytest-asyncio` + `httpx.AsyncClient` with ASGITransport.

## Active Agents
- **fastapi-reviewer** — catches async pitfalls, `Depends` misuse, missing `Mapped[]`, bypassed soft-delete.
- **database-reviewer** — SQLAlchemy 2.0 / Alembic review.
- **code-reviewer** — general quality.
- **tdd-guide** — TDD enforcement (aspirational — tests are sparse today).

## Tools to Favor
- `Edit`, `Write` for code.
- `Bash` for `uv run ...` (never bare `python`/`pip`), `make` targets (`db-gen`, `db-sync`, `db-rollback`).
- `Grep`, `Glob` for pattern discovery.
- `context7` MCP for FastAPI / SQLAlchemy 2.0 / Pydantic v2 / Alembic docs.

## Common Commands
```bash
uv sync                                   # install deps
uv run fastapi dev src/main.py            # dev server (or: uv run launcher dev)
make db-gen message="add X"               # alembic autogenerate
make db-sync                              # alembic upgrade head
make db-rollback                          # alembic downgrade -1
uv run ruff check . && uv run ruff format .
```

## Upgrade to Opus when
- Designing a new service module (multi-entity workflow, transactional boundaries).
- Non-trivial Alembic migration (data backfill, NOT NULL on populated table, column rename).
- Cross-service debugging spanning 5+ files.
- Auth/quota changes that touch the security perimeter.
- FastAPI version bump across a breaking boundary (0.116→current includes strict Content-Type + Starlette 1.0).

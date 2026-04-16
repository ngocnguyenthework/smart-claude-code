# fastapi — backend workflows

FastAPI + PostgreSQL coverage tuned to a specific production stack:
**Python 3.13 · FastAPI 0.115 · Pydantic v2 · SQLAlchemy 2.0 async · asyncpg · Alembic · uv · ruff.**

**Companion docs in `.claude/docs/`:**
- `common-README.md` — universal workflows (planning, bug fix, review)
- `INTERNALS.md` — hook lifecycle, session memory, safety guardrails

---

## Setup

```bash
~/tools/smart-claude/install.sh --context fastapi --dir ~/code/my-api
```

Prerequisites: Python 3.13, `uv`, `ruff` (installed via `uv sync`), running Postgres (or Supabase).

Shell alias (add to `~/.zshrc`):
```bash
alias claude-py='claude --append-system-prompt "$(cat .claude/contexts/fastapi.md 2>/dev/null)"'
```

---

## What this ships

| Folder | Contents |
|---|---|
| `agents/` | `fastapi-reviewer`, `database-reviewer` |
| `commands/` | `/fastapi-scaffold`, `/db-migrate` |
| `rules/fastapi/` | `coding-style`, `patterns`, `security`, `testing` — all tuned to this stack |
| `skills/` | `api-connector-builder`, `api-design`, `backend-patterns`, `database-migrations` |
| `contexts/fastapi.md` | Session framing — load via the `claude-py` shell alias |
| `settings.json` | Ruff auto-format/fix + auto-detected mypy/pyright/ty hooks on `.py` Edit/Write |
| `mcp-servers.json` | `supabase`, `clickhouse` |

---

## Opinionated defaults the stack reviewer enforces

- **Layer-by-kind layout** (`src/{api/v1/routers,models,schemas,repositories,services,...}`) — not domain-driven.
- **`UUIDBase` / `AutoIncrementBase`** with built-in `created_at`, `updated_at`, `deleted_at`. **Soft-delete is default.**
- **SQLAlchemy 2.0 `Mapped[]`** only — no legacy `Column()` typing.
- **`@transactional_session` decorator** on repository methods — not `Depends(get_db)` in routes. Services use explicit `async with get_db()` only for multi-step atomicity.
- **Module-level singletons** for services and repositories. `Depends()` is reserved for auth.
- **Pydantic v2** with `Annotated[type, Field(...)]` and a shared `BaseResponseModel(from_attributes=True)`.
- **Nested `BaseSettings`** composed under one `Settings`.
- **Singleton `HttpClient`** (one `httpx.AsyncClient`), initialized in `lifespan`.
- **Global exception handler** + `HTTPException` only — no custom exception hierarchy.
- **stdlib `logging`** with per-module levels. No loguru/structlog.
- **uv** for package management. **ruff** is the only linter/formatter.

---

## Scenarios

### 1. Add a CRUD endpoint

**When:** you need a new resource (e.g. `Invoice`) with create/read/update/soft-delete.

```
1. claude-py
2. /plan "Invoice CRUD: create/list/get/update/soft-delete. Soft-delete filter in list by default."
3. /fastapi-scaffold invoice
   → generates model + schema + repository + service + router + migration skeleton
4. Fill in business logic in service/repository
5. /db-migrate
6. pytest tests/test_invoice.py
7. /code-review
```

**Effective prompt:**
```
/fastapi-scaffold invoice
Fields: amount (Decimal), currency (3-char), due_date, status (enum: draft/sent/paid/void).
Relations: belongs to Customer.
Soft-delete the default. Indexes on (status, due_date) for the dashboard query.
```

**Common pitfalls:**
- Forgetting `Mapped[]` typing → `fastapi-reviewer` flags it.
- Putting `Depends(get_db)` in the router → should be `@transactional_session` on the repo.

---

### 2. Add authentication / protected route

**When:** an endpoint needs a verified API key or bearer token.

```
1. /plan "Protect /api/v1/invoices/* behind verify_api_key. Rate-limit to 60/min per key."
2. Implement — add Depends(verify_api_key) at the router or per-endpoint level
3. Test both success and 401/403 paths
4. /code-review  (reviewer checks for leak-through on error paths)
```

**Effective prompt:**
```
Add auth to every endpoint in src/api/v1/routers/invoice.py.
Use the existing verify_api_key dep — don't create a new one.
Every test needs a valid-key and invalid-key case.
```

**Pitfall:** adding auth only to some routes in a file. Reviewer flags missing coverage.

---

### 3. Schema change + migration

**When:** adding a column, index, or changing a type on an existing model.

```
1. claude-py
2. Update model in src/models/<entity>.py  (Mapped[] typing, default value, nullable?)
3. /db-migrate
   → autogenerate, review for NOT NULL defaults / index strategy / backfill need
4. database-reviewer checks:
   - partial unique indexes for soft-delete
   - CREATE INDEX CONCURRENTLY for large tables
   - NOT NULL columns on non-empty tables → backfill step required
5. Run migration against a branch of prod-sized data if available
6. /code-review
```

**Effective prompt for the migration step:**
```
/db-migrate
Context: adding `archived_at TIMESTAMP NULL` to invoice. Backfill isn't needed (default NULL).
Must include: concurrent index on archived_at for the archive-list query.
```

**Pitfall:** adding a NOT NULL column to a populated table without a backfill. Reviewer blocks it.

---

### 4. Async background job

**When:** work that shouldn't block the request cycle (email send, external webhook, report generation).

```
1. Decide: BackgroundTasks (fire-and-forget within request) vs a worker process (Celery / arq / RQ) vs a cron
2. For BackgroundTasks:
   - Append to response cycle via `background_tasks.add_task(func, *args)`
   - Function must be idempotent (no retry on failure; you own the error handling)
3. For worker:
   - Add entry point, wire into lifespan or a separate process
   - Job must be idempotent (workers retry)
4. Logging: log job start/finish with a correlation id
```

**Effective prompt:**
```
Add a background job: send_welcome_email(user_id).
Use FastAPI BackgroundTasks (no worker infra yet).
Idempotent (check user.welcome_sent_at before sending).
Logs must include user_id and result (sent / skipped / failed).
```

---

### 5. Design a Pydantic response model

**When:** a new endpoint needs a response schema; existing ones need to evolve without breaking clients.

```
1. Start from the DB model, don't expose it directly
2. Create InvoiceResponse(BaseResponseModel) with Annotated[...] fields
3. For list endpoints, use a Paginated[InvoiceResponse] envelope (see api-design skill)
4. Never leak internal fields (password_hash, internal_notes, etc.)
5. Add tests that assert the exact keys returned (drift detection)
```

**Effective prompt:**
```
Add InvoiceResponse. Fields: id, amount, currency, status, customer {id, name}, created_at.
Source: Invoice model (+ Customer via joinedload).
Must extend BaseResponseModel. Use Annotated Field for amount (decimal_places=2).
No internal_notes, no deleted_at.
Test must assert the full key set.
```

---

### 6. Pagination

**When:** a list endpoint returns more than ~50 items per page, or the client needs stable ordering.

```
Decision tree:
  - Stable order + random access → offset-based (simple; bad for page 1000+)
  - Feed / timeline / large set → cursor-based (stable under inserts)
  - Export → stream with async generator, no pagination

For offset:
  def list(*, limit: int = 20, offset: int = 0) -> Paginated[InvoiceResponse]

For cursor:
  def list(*, limit: int = 20, cursor: str | None = None) -> Cursored[InvoiceResponse]
```

**Effective prompt:**
```
Paginate GET /api/v1/invoices. Cursor-based (list can grow to 100k+).
Cursor = base64(created_at, id). Order by created_at DESC, id DESC.
Limit max 100, default 20.
Include `next_cursor: str | None` in response.
```

---

### 7. Performance debug — slow endpoint

**When:** p95 is creeping up, or a specific endpoint is slow.

```
1. claude-research
2. Identify the endpoint and its SQL: EXPLAIN ANALYZE the query
3. Common fixes (in order of likelihood):
   a. N+1 → add .options(selectinload(Model.relation)) or joinedload
   b. Missing index → ADD INDEX migration
   c. Over-fetching → narrow SELECT columns
   d. JSON serialization → profile with py-spy; switch to orjson if needed
4. Measure before + after — don't ship a "should be faster" fix
```

**Effective prompt:**
```
Endpoint GET /api/v1/invoices is slow (p95 ~900ms, ~300 rows/page).
Logs show ~20 SQL queries per request — smells like N+1 on Customer.
Trace the repository → service → router chain.
Propose a fix with EXPLAIN ANALYZE before + after.
```

---

### 8. Bug fix (test-first)

**When:** a bug was reported. Repro in hand.

```
1. claude-dev
2. Write a failing test at the lowest layer that reproduces the bug
   (unit if isolatable; integration if it crosses boundaries)
3. Run it → confirm RED
4. Find the root cause (do not patch the symptom)
5. Fix
6. Test → GREEN
7. /code-review
8. Commit: "fix: <what was broken>"
```

**Effective prompt:**
```
Bug: POST /api/v1/invoices with amount=0 creates the invoice — should return 400.
Validation schema says amount > 0 but it's not firing.
1. Write the failing test first (tests/test_invoice.py::test_amount_zero_rejected).
2. Trace why the validator isn't enforcing.
3. Fix at the right layer (schema, not the endpoint).
```

---

### 9. Debug async / event-loop issues

**When:** deadlocks, "this is hanging", cannot-await errors, or test runs flake only in CI.

```
1. claude-research — do not attempt a fix yet
2. Check the usual suspects:
   a. Sync code inside async function (blocking the event loop): use asyncio.to_thread
   b. Nested async with get_db() (connection pool exhaustion)
   c. Missing await somewhere (coroutine never executed → RuntimeWarning in logs)
   d. Shared AsyncClient not created in lifespan (each request creates one)
3. Add a correlated log at every await boundary of the suspect path
4. Reproduce with python -m asyncio debug mode if needed
```

**Effective prompt:**
```
POST /api/v1/reports/generate hangs intermittently (~10% of requests).
Stack suggests it's stuck inside the httpx call.
Trace every await from the router down. Flag any sync I/O inside async defs,
nested sessions, or un-awaited coroutines. Don't suggest a fix yet.
```

---

### 10. Dependency-injection design

**When:** adding a new service that needs config, DB, and an external client.

```
Pattern the reviewer enforces:
  - Module-level singleton for the service:
      invoice_service = InvoiceService(repo=invoice_repo, http=http_client)
  - Injected into routers via module import, NOT via Depends()
  - Depends() reserved for auth and request-scoped concerns
  - For tests: override via module attribute or a lifespan-aware fixture
```

**Effective prompt:**
```
Add PaymentProviderClient that wraps httpx calls to Stripe.
Create a module-level singleton in src/services/payment_provider.py
using the lifespan-owned http_client. Inject via import, not Depends.
Add a pytest fixture that patches the singleton for tests.
```

---

## Commands

### `/fastapi-scaffold <entity>`

Generates a full layer-by-kind set for a new entity.

**Produces:**
- `src/models/<entity>.py` — SQLAlchemy `Mapped[]` model extending `UUIDBase`
- `src/schemas/<entity>.py` — Pydantic request/response models
- `src/repositories/<entity>.py` — repo with `@transactional_session` methods
- `src/services/<entity>.py` — module-level singleton
- `src/api/v1/routers/<entity>.py` — FastAPI router with CRUD + soft-delete
- Alembic migration stub

**Prompt shape:**
```
/fastapi-scaffold <entity>
Fields: <name: type, ...>
Relations: <belongs_to X / has_many Y>
Indexes: <(col1, col2) for <query use case>>
Soft-delete: default / disabled
```

---

### `/db-migrate`

Walks Alembic autogenerate + review via `database-reviewer`.

**Use when:** any model change that affects the schema (column add/remove/type, index, constraint, relation).

**Produces:** reviewed Alembic revision under `alembic/versions/`.

**The reviewer checks:**
- Partial unique indexes that respect soft-delete (`WHERE deleted_at IS NULL`)
- `CREATE INDEX CONCURRENTLY` for large tables
- Backfill steps for new NOT NULL columns on populated tables
- Rollback safety of the migration

**Prompt shape:**
```
/db-migrate
Context: <what model change, what table size, what traffic pattern>
Must include: <concurrent index / backfill / rollback plan>
```

---

## Prompt patterns for this stack

### Pattern: make this `@transactional_session`-aware

```
Turn <function> into a @transactional_session repository method.
Move the `async with get_db()` out, parameter is `session: AsyncSession`.
Update every caller to drop manual session management.
```

### Pattern: Mapped[] the model

```
Convert src/models/<entity>.py to SQLAlchemy 2.0 Mapped[] typing.
Every column must use Mapped[type], with mapped_column(...) only for constraints/defaults.
Do not change behaviour.
```

### Pattern: response-drift test

```
Add a test that asserts the exact key set returned by <endpoint>.
If someone adds or removes a response field without updating this test, it must fail.
```

### Anti-pattern (don't do this)

```
Add a new endpoint   ← name the entity, the action, the auth, and the response shape
```

---

## Auto-hooks for this context

Every `.py` Edit/Write triggers (async, in this order):

1. `ruff format` — autoformat
2. `ruff check --fix` — autofix lint issues
3. `mypy` / `pyright` / `ty` — whichever is configured in `pyproject.toml`

Disable for a session: `SC_DISABLED_HOOKS=post-edit-format-python,post-edit-typecheck-python claude-py`.

---

## Pair-with

- `fastapi + devops` — platform repo (API + infra)
- `fastapi + frontend` — full-stack monorepo
- `fastapi + nestjs` — polyglot backend; DB skills dedupe at install

---

## See also

- `common-README.md` — universal workflows (planning, bug fix, root cause, review)
- `INTERNALS.md` — hook lifecycle, safety guardrails

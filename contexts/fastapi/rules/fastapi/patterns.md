---
paths:
  - "**/*.py"
---
# FastAPI Patterns

> Extends [common/patterns.md](../common/patterns.md). These are the patterns actually used in this codebase — match them when adding new features.

## Shared Base Inventory (CRITICAL)

See [common/patterns.md → Shared Base First](../common/patterns.md#shared-base-first-critical). Applies to **every** layer — not only schemas. Before creating a new class/function/module, grep base first.

| Kind | File | Base |
|---|---|---|
| SQLAlchemy model | `db/base.py` | `BaseModel` (timestamps + `deleted_at`), `UUIDBase`, `AutoIncrementBase` |
| Repository | `repositories/base.py` | `BaseRepository[ModelType]` — `get_one/create/update/delete/paginate` |
| Schema — entity response | `schemas/base.py` | `BaseResponseModel` (`id/created_at/updated_at` + `from_attributes=True`) |
| Schema — list envelope | `schemas/base.py` | `OffsetPaginated[T]`, `CursorPaginated[T]` |
| Schema — mutation confirm | `schemas/base.py` | `OkResponse` |
| Schema — error | `schemas/base.py` | `ErrorResponse { detail: str }` (match FastAPI default) |
| Session / txn | `utils/db_transaction.py` | `@transactional_session` |
| Auth dep | `utils/auth.py` | `ApiKey = Annotated[str, Depends(verify_api_key)]` |
| HTTP client | `core/http_client.py` | `HttpClient.instance()` singleton |
| Exception handler | `core/exceptions.py` | `unhandled_exception_handler` |
| Logging middleware | `middlewares/logging.py` | `RequestLoggingMiddleware` |
| Settings | `core/config.py` | `Settings` with nested `BaseSettings` subclasses |

### Rules

- **Never redefine** any of the above per entity. Parametrize via generic.
- **If common shape repeats**: promote to base file. Example — retry wrapper used in 2 services → `utils/retry.py`. Slug generator used in 2 schemas → `utils/slug.py`.
- **Per-entity files only hold domain-specific** fields/queries/business logic. No CRUD boilerplate, no pagination re-implementation.
- **Grep before adding**: `grep -r "class.*Paginated\|class.*Response\b" schemas/` — if a near match exists, extend it.

## Base Model + Soft Delete

All models inherit from `BaseModel`. `UUIDBase` / `AutoIncrementBase` add the primary key.

```python
# db/base.py
from datetime import datetime
from uuid import UUID
from sqlalchemy import DateTime, Integer, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

metadata = MetaData()

class BaseModel(DeclarativeBase):
    metadata = metadata

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class UUIDBase(BaseModel):
    __abstract__ = True
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())

class AutoIncrementBase(BaseModel):
    __abstract__ = True
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
```

**Soft delete is the default.** `BaseRepository.delete()` sets `deleted_at`; all read helpers filter `deleted_at.is_(None)`. Use `hard_delete()` only when you explicitly mean it (GDPR, cascade cleanup).

## Alembic Migrations (CRITICAL)

**Always generate migrations with Alembic. Never hand-write migration files.**

```bash
# After model change:
uv run alembic revision --autogenerate -m "add users table"
uv run alembic upgrade head
```

Rules:
- **Never** create files under `migrations/versions/` by hand — autogenerate only.
- **Always review** generated diff before commit. Autogenerate misses: enum value changes, column renames (sees drop+add), check constraints, server defaults, index name differences. Edit the generated file to fix these — do not author from scratch.
- **One logical change per revision.** No bundling unrelated schema edits.
- **Never edit an applied revision.** If wrong, create new revision that corrects it.
- Run `alembic upgrade head` locally before commit to verify it applies cleanly.

Rationale: autogenerate diffs models vs DB metadata — catches drift humans miss, enforces consistent `op.*` calls, wires revision chain correctly.

## Session Management: `@transactional_session`

We do **not** inject sessions via `Depends(get_db)`. Instead, repository methods are decorated with `@transactional_session`, which:

1. If a `db` kwarg was passed, uses it and does nothing else (caller owns the transaction).
2. Otherwise opens a session with `async with get_db()`, calls the function, commits, and best-effort `refresh()`es the returned ORM object.

```python
# db/session.py
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from core.config import settings

async_engine = create_async_engine(
    settings.DATABASE.DB_URL,
    pool_size=5, max_overflow=10, pool_timeout=30, pool_recycle=1800,
    pool_pre_ping=True, future=True,
)
# Pool sizing notes:
# - Current (5/10) is conservative — good for low-traffic services behind a gateway.
# - SQLAlchemy 2.x guidance for typical async APIs: pool_size=10, max_overflow=20.
# - Async engines use AsyncAdaptedQueuePool by default — do NOT set poolclass=QueuePool.
# - One AsyncEngine per process; never share across event loops without calling .dispose() first.
# - Tune against Postgres max_connections: (pool_size + max_overflow) * workers must fit.
async_session = sessionmaker(
    bind=async_engine, class_=AsyncSession,
    expire_on_commit=False, autocommit=False, autoflush=False,
)

@asynccontextmanager
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

```python
# utils/db_transaction.py
from functools import wraps
from typing import Awaitable, Callable, ParamSpec, TypeVar, cast
from sqlalchemy.ext.asyncio import AsyncSession
from db.session import get_db

P = ParamSpec("P"); R = TypeVar("R")

def transactional_session(fn: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
    @wraps(fn)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        if kwargs.get("db") is not None:
            return await fn(*args, **kwargs)
        async with get_db() as db:
            kwargs["db"] = db
            result = await fn(*args, **kwargs)
            await db.commit()
            if result is not None and not isinstance(result, (bool, list, tuple, dict, set, int, UUID)):
                try:
                    await db.refresh(result)
                except Exception:
                    pass
            return result
    return cast(Callable[P, Awaitable[R]], wrapper)
```

## Generic Repository

One `BaseRepository[ModelType]` drives all CRUD. Per-entity repos subclass it and add domain-specific queries.

```python
# repositories/base.py
from typing import Generic, Type, TypeVar
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from db.base import BaseModel
from utils.db_transaction import transactional_session

ModelType = TypeVar("ModelType", bound=BaseModel)

class BaseRepository(Generic[ModelType]):
    def __init__(self, model: Type[ModelType]) -> None:
        self._model = model

    @transactional_session
    async def get_one(self, *, db: AsyncSession, **filters) -> ModelType | None:
        stmt = select(self._model).filter_by(**filters, deleted_at=None).limit(1)
        return (await db.execute(stmt)).scalar_one_or_none()

    @transactional_session
    async def create(self, values: dict, *, db: AsyncSession) -> ModelType:
        obj = self._model(**values)
        db.add(obj)
        await db.flush()
        return obj

    @transactional_session
    async def delete(self, obj: ModelType, *, db: AsyncSession) -> ModelType:
        obj.deleted_at = func.now()
        await db.flush()
        return obj
```

```python
# repositories/company.py
from models.company import Company
from repositories.base import BaseRepository

class CompanyRepository(BaseRepository[Company]):
    @transactional_session
    async def get_by_external_id(self, external_id: int, *, db: AsyncSession) -> Company | None:
        stmt = select(Company).where(
            Company.external_id == external_id, Company.deleted_at.is_(None),
        )
        return (await db.execute(stmt)).scalar_one_or_none()

company_repository = CompanyRepository(Company)  # module-level singleton
```

## Service Layer

Services hold business logic, call repositories, and own **multi-step transactions**. When a workflow spans multiple repository calls that must be atomic, open a session explicitly and pass `db=` to each call.

**No module-level helpers/constants above the class.** See [coding-style.md → Service / Repository File Organization](./coding-style.md#service--repository-file-organization-critical). Service-bound helpers → `@staticmethod` inside class. Cross-service helpers → `utils/`. Module top = imports + `log` + class + singleton only.

```python
# services/company.py
from db.session import get_db
from repositories.company import company_repository
from repositories.user import user_repository
from schemas.company import CompanyPayload
from schemas.base import OkResponse

class CompanyService:
    async def get_by_external_id(self, external_id: int):
        company = await company_repository.get_by_external_id(external_id)
        if company is None:
            raise HTTPException(status_code=404, detail="Company not found")
        return company

    async def sync_company_with_users(self, payload: CompanyPayload) -> OkResponse:
        async with get_db() as db:
            company = await company_repository.create({"external_id": payload.external_id, "name": payload.name}, db=db)
            for user in payload.users:
                await user_repository.create({"company_id": company.id, **user.model_dump()}, db=db)
            await db.commit()
        return OkResponse()

company_service = CompanyService()  # module-level singleton
```

## Singleton HttpClient

External HTTP calls go through a single shared `httpx.AsyncClient`, created in lifespan and closed on shutdown.

```python
# core/http_client.py
import httpx

class HttpClient:
    _client: httpx.AsyncClient | None = None

    @classmethod
    async def init(cls) -> None:
        if cls._client is None:
            cls._client = httpx.AsyncClient(timeout=30.0)

    @classmethod
    async def close(cls) -> None:
        if cls._client is not None:
            await cls._client.aclose()
            cls._client = None

    @classmethod
    def instance(cls) -> httpx.AsyncClient:
        if cls._client is None:
            raise RuntimeError("HttpClient not initialized")
        return cls._client
```

## Lifespan

Init/cleanup resources and run bootstrap tasks (e.g., seed default API key).

```python
# main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from core.http_client import HttpClient
from repositories.api_key import api_key_repository

@asynccontextmanager
async def lifespan(app: FastAPI):
    await HttpClient.init()
    await api_key_repository.create_default_api_key()
    yield
    await HttpClient.close()

app = FastAPI(lifespan=lifespan)
```

## Nested Pydantic Settings

Group related config into its own `BaseSettings` subclass and compose into `Settings`.

```python
# core/config.py
from pydantic import Field
from pydantic_settings import BaseSettings
from common.enums.environment import Environment

class DatabaseSettings(BaseSettings):
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USERNAME: str
    DB_PASSWORD: str
    DB_NAME: str
    DB_POOL_SIZE: int = 5
    DB_POOL_MAX_OVERFLOW: int = 10

    @property
    def DB_URL(self) -> str:
        return f"postgresql+asyncpg://{self.DB_USERNAME}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

class Settings(BaseSettings):
    ENV: Environment = Environment.DEV
    DATABASE: DatabaseSettings = DatabaseSettings()

    @property
    def is_dev(self) -> bool: return self.ENV == Environment.DEV
    @property
    def is_prod(self) -> bool: return self.ENV == Environment.PROD

settings = Settings()
```

## Global Exception Handler

One catch-all handler logs everything with client IP (respecting `X-Forwarded-For`) and returns a generic 500. `HTTPException` is the only custom exception we raise — no custom exception hierarchy.

```python
# core/exceptions.py
import sys
from fastapi import Request
from fastapi.responses import JSONResponse
from core.logging import log

async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    forwarded = request.headers.get("x-forwarded-for")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    url = f"{request.url.path}?{request.query_params}" if request.query_params else request.url.path
    exc_type, exc_value, _ = sys.exc_info()
    log.error(
        f'{client_ip} - "{request.method} {url}" 500 Internal Server Error '
        f"<{getattr(exc_type, '__name__', 'UnknownException')}: {exc_value}>",
        exc_info=True,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})
```

Register it in `main.py`: `app.add_exception_handler(Exception, unhandled_exception_handler)`.

## Request Logging Middleware

```python
# middlewares/logging.py
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from core.logging import log

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        forwarded = request.headers.get("x-forwarded-for")
        client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
        response = await call_next(request)
        level = "error" if response.status_code >= 500 else "warning" if response.status_code >= 400 else "info"
        getattr(log, level)(
            f"method={request.method} path={request.url.path} status={response.status_code} "
            f"ip={client_ip} duration={time.time() - start:.3f}s"
        )
        return response
```

## CORS with Regex

Subdomain + localhost origins handled by a regex built from `ALLOWED_DOMAINS`.

```python
# common/constants/globals.py
import re
from core.config import settings

raw = [re.escape(d.strip()) for d in settings.ALLOWED_DOMAINS.split(",")]
patterns = []
for d in raw:
    if "localhost" in d:
        patterns.append(rf"^https?://{d}(:\d+)?(/.*)?$")
    else:
        patterns.append(rf"^https://([a-zA-Z0-9-]+\.)*{d}(/.*)?$")
CORS_ALLOWED_ORIGIN_REGEX = "|".join(patterns)
```

```python
# main.py
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=CORS_ALLOWED_ORIGIN_REGEX,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
```

## Eager Loading (N+1)

Default lazy loading breaks in async. Always specify loading strategy explicitly.

```python
from sqlalchemy.orm import selectinload, joinedload

# Many children — one extra query
stmt = select(Company).options(selectinload(Company.users)).where(Company.deleted_at.is_(None))

# Single parent → one child — single JOIN
stmt = select(User).options(joinedload(User.company)).where(User.id == user_id)
```

## Modern Dependency Injection (`Annotated`)

FastAPI's current recommended DI style uses `Annotated[T, Depends(dep)]` and reusable type aliases. This is the style for **all new code**.

```python
# utils/auth.py
from typing import Annotated
from fastapi import Depends

async def verify_api_key(...) -> str: ...

ApiKey = Annotated[str, Depends(verify_api_key)]
```

```python
# api/v1/routers/company.py
from typing import Annotated
from fastapi import APIRouter, Path
from utils.auth import ApiKey
from services.company import company_service

router = APIRouter()

@router.get("/companies/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: Annotated[int, Path(gt=0)],
    _token: ApiKey,
) -> CompanyResponse:
    return await company_service.get_by_id(company_id)
```

**Why this matters:** default-style `x: int = Path(gt=0)` collides with real default values (you can't write `x: int = 5 + Path(...)`), hides params in function defaults rather than annotations, and is the older style. New code uses `Annotated`.

## Streaming Responses (FastAPI 0.134+)

Native streaming with `yield` from path functions — no manual `StreamingResponse` for common cases.

### JSON Lines / NDJSON

```python
# api/v1/routers/events.py
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()

@router.get("/tail")
async def tail_events() -> StreamingResponse:
    async def gen():
        async for event in event_source():
            # Each yielded dict becomes one NDJSON line
            yield event  # FastAPI 0.134+ handles framing + media type
    return StreamingResponse(gen(), media_type="application/x-ndjson")
```

For plain byte streams (downloads, pass-through), return `StreamingResponse(byte_iter, media_type="application/octet-stream")`.

### Server-Sent Events (FastAPI 0.135+)

Use for token-by-token LLM output, live dashboards, progress streams. Not used in-process today — but if streaming does land in-process, this is the shape:

```python
from fastapi import APIRouter
from fastapi.responses import EventSourceResponse  # 0.135+
# Or: from sse_starlette.sse import EventSourceResponse on older FastAPI

router = APIRouter()

@router.get("/stream")
async def stream() -> EventSourceResponse:
    async def events():
        async for chunk in llm_tokens():
            yield {"event": "token", "data": chunk}   # dict → SSE fields
    return EventSourceResponse(events())
```

**SSE gotchas:**
- Disable proxy buffering (`X-Accel-Buffering: no` for nginx, equivalent config upstream).
- Client must send `Accept: text/event-stream`; set a long `keepalive` on the reverse proxy.
- Every yielded item is a full SSE event — flush between tokens, don't batch.
- Wrap the generator body in `try/except/finally` — if the client disconnects, clean up DB sessions, LLM handles, and background tasks.

## Exception Groups (Starlette 1.0 / Python 3.11+)

FastAPI 0.133+ ships on Starlette 1.0+, which unwraps `ExceptionGroup`s raised from async `yield` dependencies. If you raise inside a `BaseHTTPMiddleware.dispatch` or a streaming generator, expect a single exception rather than the wrapper group. When you intentionally fan out with `asyncio.TaskGroup`, catch `ExceptionGroup` explicitly:

```python
try:
    async with asyncio.TaskGroup() as tg:
        tg.create_task(work_a())
        tg.create_task(work_b())
except* HTTPException as eg:
    # re-raise the first HTTPException so FastAPI renders it
    raise eg.exceptions[0]
```

## Discriminated Unions

For polymorphic payloads (sync events, webhook payloads), use `Field(discriminator=...)` — Pydantic v2 picks the right variant in one pass and produces clearer error messages than naive unions.

```python
from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field

class CompanyEvent(BaseModel):
    type: Literal["company.created", "company.updated"]
    company_id: int

class UserEvent(BaseModel):
    type: Literal["user.created", "user.deleted"]
    user_id: int

SyncEvent = Annotated[Union[CompanyEvent, UserEvent], Field(discriminator="type")]

class SyncBatch(BaseModel):
    events: list[SyncEvent]
```

## `TypeAdapter` for non-model validation

When a function receives or produces a shape that isn't a `BaseModel` (e.g., `list[SyncEvent]`, `dict[str, Payload]`) and you need Pydantic validation, use `TypeAdapter` at module scope. Don't rebuild it per call.

```python
from pydantic import TypeAdapter

_sync_batch = TypeAdapter(list[SyncEvent])

def parse_batch(raw: list[dict]) -> list[SyncEvent]:
    return _sync_batch.validate_python(raw)
```

## Strict Content-Type (FastAPI 0.132+)

When upgrading past 0.132, be aware: JSON endpoints reject requests without `Content-Type: application/json`. If upstream callers send raw bodies without the header (some CLIs, curl defaults, old webhooks), either fix the callers or opt the endpoint out. Do **not** disable this globally — it's a real correctness improvement.

## What we do NOT use

- **Background tasks** (`BackgroundTasks`) — we queue work via the sync-events endpoint; no in-process fire-and-forget.
- **Streaming responses today** — not handled in-process. (The patterns above exist so that when streaming does land in-process, we don't reinvent it.)
- **Custom exception hierarchy** — `HTTPException` everywhere + one global handler.
- **`Depends(get_db)` in routes** — use `@transactional_session` on repository methods instead.
- **Class-based dependency-injected services** — services/repos are module-level singletons.
- **`@app.on_event("startup"/"shutdown")`** — deprecated. Use the `lifespan` context manager (we already do).
- **Legacy `x: T = Depends(dep)` in new code** — use `Annotated[T, Depends(dep)]` / named alias.

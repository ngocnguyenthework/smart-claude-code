---
paths:
  - "**/*.py"
---
# FastAPI Coding Style

> Extends [common/coding-style.md](../common/coding-style.md) with FastAPI-specific conventions for this stack: **Python 3.13 + FastAPI 0.115 + Pydantic v2 + SQLAlchemy 2.0 async + asyncpg + Alembic, managed by `uv`, linted/formatted by `ruff`.**

## Project Structure

**Layer-by-kind** (flat), not domain-driven. One file per entity inside each kind folder.

```
src/
  main.py                  # FastAPI app, CORS, middleware, exception handler, lifespan
  launcher.py              # uvicorn entrypoints: dev() and start()
  api/
    v1/
      api_v1.py            # aggregates all v1 routers
      routers/
        auth.py            # one router per feature
        company.py
        ...
  core/
    config.py              # nested BaseSettings (Database, ...)
    exceptions.py          # global exception handler
    http_client.py         # singleton httpx.AsyncClient
    logging.py             # stdlib logging config with per-module levels
  db/
    base.py                # BaseModel, UUIDBase, AutoIncrementBase
    session.py             # async_engine, async_session, get_db()
  models/                  # SQLAlchemy models — one file per entity
  schemas/                 # Pydantic models — one file per entity (base.py holds BaseResponseModel)
  repositories/            # Data access — one file per entity; base.py holds BaseRepository[T]
  services/                # Business logic — one file per service
  middlewares/             # ASGI/HTTP middleware
  utils/                   # Helpers: db_transaction.py (transactional_session), hash.py, auth.py
  common/
    enums/                 # Enums (Environment, roles, event types)
    constants/             # Constants (CORS_ALLOWED_ORIGIN_REGEX, ...)
migrations/                # Alembic
```

Routers live under `api/v1/routers/`, aggregated in `api/v1/api_v1.py`, mounted in `main.py` with prefix `/api/v1`. Never place routers, services, or repos in the same file.

## Tooling

- **Package manager**: `uv` only. Install: `uv sync`. Run: `uv run <cmd>`. Add dep: `uv add <pkg>`.
- **Lint + format**: `ruff` only (line-length 88, `target-version = "py313"`, `quote-style = "double"`). No black, no isort.
- **Python**: 3.13. Use PEP 604 unions (`str | None`), `match` statements, `type` aliases where they clarify.
- **Pre-commit**: `make pre-commit-install` after clone. Conventional-commit format enforced.

## Router Organization

- One `APIRouter` per feature file, `router = APIRouter()` at module top.
- `prefix` and `tags` set on `include_router` in `api_v1.py`, not on the router itself.
- Always specify `response_model` and explicit `description`.
- Path/query params validated with `Path(gt=0)` / `Query(...)` — never accept a raw `int` without a constraint.
- Routes are **thin**: extract params, call service, return. No DB access, no business logic.
- `Depends()` is used for **auth only** (`verify_api_key`). Services and repositories are **module-level singletons** — do not inject them via `Depends`.

```python
# api/v1/routers/company.py
from typing import Annotated
from fastapi import APIRouter, Path
from schemas.company import CompanyResponse
from services.company import company_service
from utils.auth import ApiKey          # type alias — see "Dependency Type Aliases" below

router = APIRouter()

@router.get(
    "/{external_id}",
    response_model=CompanyResponse,
    description="Get company by external id",
)
async def get_company(
    external_id: Annotated[int, Path(gt=0)],
    _: ApiKey,
) -> CompanyResponse:
    return await company_service.get_by_external_id(external_id)
```

**Always prefer `Annotated[T, ...]`** for `Path`, `Query`, `Body`, `Depends`. It's the official FastAPI style since 0.95 — cleaner signatures, better IDE support, no default-value collisions with real defaults. Legacy `x: int = Path(gt=0)` still compiles but reviewers will flag it in new code.

## Dependency Type Aliases

Collapse repeated `Annotated[T, Depends(dep)]` into named aliases kept next to the dependency function. Routes then read as pure Python signatures.

```python
# utils/auth.py
from typing import Annotated
from fastapi import Depends

async def verify_api_key(...) -> str: ...

ApiKey = Annotated[str, Depends(verify_api_key)]
```

Routers import `ApiKey` directly — no `Depends(...)` in the route signature itself.

```python
# api/v1/api_v1.py
from fastapi import APIRouter
from api.v1.routers import auth, company

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["Auth"])
router.include_router(company.router, prefix="/companies", tags=["Company"])
```

## Pydantic Schemas (v2)

- All response models inherit `BaseResponseModel` (provides `id`, `created_at`, `updated_at` + `ConfigDict(from_attributes=True)`).
- Per entity: `XCreate`, `XUpdate`, `XPayload` (for external API inputs), `XResponse`.
- Use `Annotated[type, Field(...)]` for non-trivial validation — not `field: type = Field(...)`.
- `Field(strip_whitespace=False)` when input spacing is meaningful; `Field(to_upper=True)` for things like country codes.

```python
# schemas/base.py
from datetime import datetime
from typing import Generic, TypeVar
from uuid import UUID
from pydantic import BaseModel as PydanticModel, ConfigDict

T = TypeVar("T")

class BaseResponseModel(PydanticModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: datetime
    updated_at: datetime

class OkResponse(PydanticModel):
    ok: bool = True

class OffsetPaginated(PydanticModel, Generic[T]):
    model_config = ConfigDict(from_attributes=True)
    items: list[T]
    total: int
    offset: int
    limit: int

class CursorPaginated(PydanticModel, Generic[T]):
    model_config = ConfigDict(from_attributes=True)
    items: list[T]
    next_cursor: str | None = None
```

```python
# schemas/company.py
from typing import Annotated
from pydantic import BaseModel, Field
from schemas.base import BaseResponseModel

class CompanyPayload(BaseModel):
    external_id: Annotated[int, Field(gt=0)]
    name: Annotated[str, Field(strip_whitespace=False, min_length=1, max_length=500)]
    country_code: Annotated[str | None, Field(min_length=2, max_length=2, to_upper=True)] = None

class CompanyResponse(BaseResponseModel):
    external_id: int
    name: str
```

## Shared Base Schemas (CRITICAL)

**Never re-define common envelopes per entity.** Put generic shapes in `schemas/base.py` once, parametrize at use.

Reuse rules:
- List endpoints → `OffsetPaginated[XResponse]` or `CursorPaginated[XResponse]`. Never create `XListResponse` with duplicate `items/total/offset/limit` fields.
- No-op / mutation confirm → `OkResponse`. Never create `XDeletedResponse`, `XAcceptedResponse`.
- Entity response → inherit `BaseResponseModel` (gives `id/created_at/updated_at`). Never redeclare these.

If common shape repeats across 2+ entities, **promote to `schemas/base.py`** as `Generic[T]` — don't duplicate.

```python
# api/v1/routers/company.py
from schemas.base import OffsetPaginated
from schemas.company import CompanyResponse

@router.get("/", response_model=OffsetPaginated[CompanyResponse])
async def list_companies(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    _: ApiKey,
) -> OffsetPaginated[CompanyResponse]:
    return await company_service.list(limit=limit, offset=offset)
```

Service returns `OffsetPaginated[CompanyResponse]` directly — Pydantic `from_attributes=True` handle ORM→schema coerce on `items`.

## SQLAlchemy Models (2.0 style)

- Always use `Mapped[type]` + `mapped_column(...)`. Never legacy `Column(...)` typing.
- Inherit `UUIDBase` for UUID PKs (most entities) or `AutoIncrementBase` for integer PKs (external-id-ish).
- Every model gets `created_at`, `updated_at`, `deleted_at` for free from `BaseModel`. **Soft delete is the default** — repositories filter `deleted_at IS NULL`.
- One model per file, filename matches model name in snake_case.

```python
# models/company.py
from uuid import UUID
from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column
from db.base import UUIDBase

class Company(UUIDBase):
    __tablename__ = "companies"

    external_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(500))
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    is_chatbot_active: Mapped[bool] = mapped_column(default=False)
```

## Async-First

- Everything is `async def`. No sync DB calls, no `requests`, no `time.sleep`.
- External HTTP: `HttpClient.instance()` (singleton `httpx.AsyncClient`) — never create new clients per request.
- DB: `asyncpg` via SQLAlchemy async engine only.
- CPU-bound work: `asyncio.to_thread(...)` or `run_in_executor`.
- Parallel fan-out: `asyncio.gather(...)`.

## Naming

- Files: `snake_case.py`. Model file matches model name (`company.py` → `Company`).
- Classes: `PascalCase`. Functions/variables: `snake_case`. Constants: `UPPER_SNAKE_CASE`.
- Enums live in `common/enums/`. Never hardcode magic strings for roles, environments, event types, model IDs.
- Module-level service/repository singletons named `<entity>_service`, `<entity>_repository`.

## Imports

- Absolute imports rooted at `src/` (PYTHONPATH is `/app/src`). Never `from ..foo`.
- Order: stdlib → third-party → local (ruff isort rules enforce this).
- No `import *`. No unused imports — ruff will fail CI.

## Logging & Print

- Never `print(...)` in production paths — use `log = logging.getLogger(__name__)`.
- Log levels tunable per module via env (`DB_LOG_LEVEL`, `REPOSITORIES_LOG_LEVEL`, etc.) — see `core/logging.py`.

## Typing

- Type hints on every function signature, including return type.
- No `Any` without a comment explaining why.
- Prefer `list[X]` / `dict[K, V]` / `X | None` (PEP 604/585) over `typing.List` / `typing.Optional`.
- Use `Annotated[T, ...]` for all FastAPI params (`Path`, `Query`, `Body`, `Depends`, `Form`, `Header`). Collapse repeats into aliases.
- Use `TypeAdapter(T)` to validate non-`BaseModel` shapes (e.g., `list[MyPayload]`, `dict[str, MyPayload]`) at module scope — cache the adapter, don't rebuild per call.

```python
from pydantic import TypeAdapter

_payload_list = TypeAdapter(list[SyncPayload])
validated = _payload_list.validate_python(raw_list)
```

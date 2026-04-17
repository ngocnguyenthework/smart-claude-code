---
description: Scaffold a new FastAPI entity across the layer-by-kind structure — model, schema, repository, service, router, migration.
---

# FastAPI Entity Scaffold

This project uses a **layer-by-kind flat layout**. Scaffolding a single entity touches 6+ files across layers — not one domain folder.

## Steps

1. **Ask** for the entity name in singular snake_case (e.g., `product`, `subscription`, `api_token`). Derive:
   - `Entity` (PascalCase, used for the class name).
   - `entity` (snake_case, file names, variable names, table name — pluralize to `entities` for `__tablename__`).

2. **Confirm PK strategy** — UUID (default, inherits `UUIDBase`) or auto-increment integer (inherits `AutoIncrementBase`).

3. **Confirm layer**:
   - Check `src/` structure matches the expected layer-by-kind shape (`models/`, `schemas/`, `repositories/`, `services/`, `api/v1/routers/`).
   - Read `src/db/base.py` for the base class, `src/schemas/base.py` for `BaseResponseModel`, `src/repositories/base.py` for `BaseRepository`, `src/utils/db_transaction.py` for `@transactional_session` — these must already exist.

4. **Generate files** (match existing files' style — read a neighbor first):

   | File | Purpose |
   |---|---|
   | `src/models/<entity>.py` | SQLAlchemy model inheriting `UUIDBase` / `AutoIncrementBase`, `Mapped[]` columns |
   | `src/schemas/<entity>.py` | `XCreate`, `XUpdate`, `XPayload` (if external input), `XResponse(BaseResponseModel)` |
   | `src/repositories/<entity>.py` | `XRepository(BaseRepository[X])` + module-level `x_repository = XRepository(X)` |
   | `src/services/<entity>.py` | `XService` with domain methods + module-level `x_service = XService()` |
   | `src/api/v1/routers/<entity>.py` | `router = APIRouter()`, thin handlers calling `x_service`, `Depends(verify_...)` for auth |

5. **Register the router** in `src/api/v1/api_v1.py`:
   ```python
   from api.v1.routers import <entity>
   router.include_router(<entity>.router, prefix="/<entities>", tags=["<Entity>"])
   ```

6. **Generate Alembic migration**:
   ```bash
   make db-gen message="add_<entity>_table"
   ```
   Then **read the generated file** and verify:
   - Table name is plural (`entities`).
   - `created_at`, `updated_at` have `server_default=sa.func.now()`.
   - `deleted_at` is nullable.
   - UUID PK uses `server_default=sa.text("gen_random_uuid()")`.
   - FK columns have their own indexes.
   - No unrelated drift from someone else's local schema.

7. **Apply migration**:
   ```bash
   make db-sync
   ```

8. **Verify** the scaffold:
   ```bash
   uv run ruff check src/
   uv run ruff format src/
   uv run alembic heads          # should return exactly one head
   # If tests exist:
   uv run pytest tests/ -x
   ```

## Templates (use as reference — adapt to the entity)

**Model**:
```python
# src/models/<entity>.py
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from db.base import UUIDBase

class <Entity>(UUIDBase):
    __tablename__ = "<entities>"

    name: Mapped[str] = mapped_column(String(255))
    # add entity-specific fields
```

**Schema**:
```python
# src/schemas/<entity>.py
from typing import Annotated
from pydantic import BaseModel, Field
from schemas.base import BaseResponseModel

class <Entity>Create(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=255)]

class <Entity>Update(BaseModel):
    name: Annotated[str | None, Field(default=None, min_length=1, max_length=255)] = None

class <Entity>Response(BaseResponseModel):
    name: str
```

**Repository**:
```python
# src/repositories/<entity>.py
from models.<entity> import <Entity>
from repositories.base import BaseRepository

class <Entity>Repository(BaseRepository[<Entity>]):
    pass

<entity>_repository = <Entity>Repository(<Entity>)
```

**Service**:
```python
# src/services/<entity>.py
from fastapi import HTTPException, status
from repositories.<entity> import <entity>_repository
from schemas.base import OffsetPaginated
from schemas.<entity> import <Entity>Create, <Entity>Response, <Entity>Update

class <Entity>Service:
    async def get_by_id(self, id):
        obj = await <entity>_repository.get_one(id=id)
        if obj is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="<Entity> not found")
        return obj

    async def create(self, payload: <Entity>Create):
        return await <entity>_repository.create(payload.model_dump())

    async def list(self, *, limit: int, offset: int) -> OffsetPaginated[<Entity>Response]:
        items, total = await <entity>_repository.list_with_total(limit=limit, offset=offset)
        return OffsetPaginated[<Entity>Response](
            items=[<Entity>Response.model_validate(i) for i in items],
            total=total, offset=offset, limit=limit,
        )

<entity>_service = <Entity>Service()
```

**Router** (uses modern `Annotated[]` DI + `ApiKey` type alias from `utils/auth.py`. List endpoints MUST return `OffsetPaginated[XResponse]` from `schemas/base.py` — never redefine):
```python
# src/api/v1/routers/<entity>.py
from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Path, Query, status
from schemas.base import OffsetPaginated
from schemas.<entity> import <Entity>Create, <Entity>Response
from services.<entity> import <entity>_service
from utils.auth import ApiKey  # = Annotated[str, Depends(verify_api_key)]

router = APIRouter()

@router.get("/", response_model=OffsetPaginated[<Entity>Response])
async def list_<entities>(
    _: ApiKey,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> OffsetPaginated[<Entity>Response]:
    return await <entity>_service.list(limit=limit, offset=offset)

@router.get("/{id}", response_model=<Entity>Response)
async def get_<entity>(
    id: Annotated[UUID, Path(...)],
    _: ApiKey,
) -> <Entity>Response:
    return await <entity>_service.get_by_id(id)

@router.post("/", response_model=<Entity>Response, status_code=status.HTTP_201_CREATED)
async def create_<entity>(
    payload: <Entity>Create,
    _: ApiKey,
) -> <Entity>Response:
    return await <entity>_service.create(payload)
```

If `utils/auth.py` does not yet export the `ApiKey` alias, add it there:
```python
from typing import Annotated
from fastapi import Depends
ApiKey = Annotated[str, Depends(verify_api_key)]
```

## Conventions Enforced

- Follow `rules/fastapi/{coding-style,patterns,security}.md`.
- `Mapped[]` + `mapped_column` only.
- Soft-delete is inherited — never override `deleted_at` behavior unless the entity is exempt by design (document why).
- Module-level singletons for service & repository.
- `Depends()` is for auth only.
- All new endpoints get `response_model` and an explicit `status_code` on non-GETs.

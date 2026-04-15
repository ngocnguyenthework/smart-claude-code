---
paths:
  - "**/*.py"
---
# FastAPI Coding Style

> Extends [common/coding-style.md](../common/coding-style.md) and [python/coding-style.md](../common/coding-style.md) with FastAPI-specific conventions.

## Project Structure

```
src/
  main.py                  # App factory, lifespan, middleware
  config.py                # Settings with pydantic-settings
  database.py              # Engine, session factory
  dependencies.py          # Shared dependencies (get_db, get_current_user)
  domains/
    users/
      router.py            # APIRouter endpoints
      schemas.py           # Pydantic models (Create, Update, Response)
      service.py           # Business logic
      repository.py        # Database access
      models.py            # SQLAlchemy models
    orders/
      ...
  tests/
    conftest.py            # Shared fixtures
    test_users.py
```

## Router Organization

- One `APIRouter` per domain, registered in `main.py`
- Use `prefix` and `tags` for grouping
- Always specify `response_model` and `status_code`

```python
# domains/users/router.py
router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    dto: CreateUserSchema,
    service: UsersService = Depends(get_users_service),
) -> UserResponse:
    return await service.create(dto)

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, service: UsersService = Depends(get_users_service)):
    user = await service.find_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

## Pydantic Schemas

- Separate `CreateXSchema`, `UpdateXSchema`, `XResponse` per domain
- Use `Field()` for validation constraints
- Use `model_config` for serialization settings

```python
from pydantic import BaseModel, Field, EmailStr

class CreateUserSchema(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=255)

class UpdateUserSchema(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)

class UserResponse(BaseModel):
    id: int
    email: str
    name: str

    model_config = {"from_attributes": True}
```

## Dependency Injection

- Use `Depends()` for all injected services and DB sessions
- Generator dependencies for resource cleanup (DB sessions)
- Compose dependencies for layered injection

```python
# dependencies.py
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session

async def get_users_service(db: AsyncSession = Depends(get_db)) -> UsersService:
    return UsersService(UsersRepository(db))

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Validate JWT, fetch user
    ...
```

## Async-First Design

- Use `async def` for all endpoint handlers
- Use async database drivers (`asyncpg` for PostgreSQL)
- Use `run_in_executor` for blocking operations (file I/O, CPU-bound)
- Never call sync ORM operations in async context

```python
# WRONG: Blocking in async
@router.get("/report")
async def get_report():
    result = sync_heavy_computation()  # Blocks event loop
    return result

# CORRECT: Offload to executor
@router.get("/report")
async def get_report():
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, sync_heavy_computation)
    return result
```

## Naming Conventions

- Files: `snake_case` (e.g., `user_schemas.py`, `auth_router.py`)
- Classes: `PascalCase` (e.g., `UsersService`, `CreateUserSchema`)
- Functions/variables: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- Type annotations on all function signatures

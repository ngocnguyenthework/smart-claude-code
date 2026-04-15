---
paths:
  - "**/*.py"
---
# FastAPI Patterns

> Extends [common/patterns.md](../common/patterns.md) with FastAPI-specific architectural patterns.

## Repository Pattern

Protocol-based for testability and swappability:

```python
from typing import Protocol, TypeVar, Generic
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")

class Repository(Protocol[T]):
    async def find_by_id(self, id: int) -> T | None: ...
    async def find_all(self, skip: int = 0, limit: int = 20) -> list[T]: ...
    async def create(self, data: dict) -> T: ...
    async def update(self, id: int, data: dict) -> T: ...
    async def delete(self, id: int) -> None: ...

class UsersRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_by_id(self, id: int) -> User | None:
        return await self.db.get(User, id)

    async def find_all(self, skip: int = 0, limit: int = 20) -> list[User]:
        result = await self.db.execute(
            select(User).offset(skip).limit(limit)
        )
        return list(result.scalars().all())
```

## Service Layer

Business logic isolated from HTTP concerns:

```python
class UsersService:
    def __init__(self, repo: UsersRepository):
        self.repo = repo

    async def create(self, dto: CreateUserSchema) -> User:
        existing = await self.repo.find_by_email(dto.email)
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")
        hashed = hash_password(dto.password)
        return await self.repo.create({**dto.model_dump(), "password": hashed})
```

## Background Tasks

For fire-and-forget side effects:

```python
@router.post("/orders/", status_code=201)
async def create_order(
    dto: CreateOrderSchema,
    background_tasks: BackgroundTasks,
    service: OrdersService = Depends(get_orders_service),
):
    order = await service.create(dto)
    background_tasks.add_task(send_order_confirmation, order.id)
    return order
```

## Middleware Pattern

ASGI middleware chain for cross-cutting concerns:

```python
# Logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start
    logger.info(
        "request_completed",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=round(duration * 1000, 2),
    )
    return response
```

## Lifespan Events

For startup/shutdown resources:

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    redis = await aioredis.from_url(settings.REDIS_URL)
    app.state.redis = redis
    yield
    # Shutdown
    await redis.close()
    await dispose_db()

app = FastAPI(lifespan=lifespan)
```

## Custom Exception Handlers

Consistent error response format:

```python
class AppException(Exception):
    def __init__(self, status_code: int, detail: str, code: str):
        self.status_code = status_code
        self.detail = detail
        self.code = code

@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.detail}},
    )
```

## SQLAlchemy Async Session Management

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
)

async_session = async_sessionmaker(engine, expire_on_commit=False)
```

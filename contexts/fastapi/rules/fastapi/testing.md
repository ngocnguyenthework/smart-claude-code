---
paths:
  - "**/test_*.py"
  - "**/*_test.py"
  - "**/conftest.py"
---
# FastAPI Testing

> Testing is currently sparse in this codebase. When adding tests, follow this shape so they plug in cleanly.

## Tooling

- `pytest` + `pytest-asyncio` + `httpx` — install via `uv add --dev pytest pytest-asyncio pytest-cov`.
- Run: `uv run pytest`. Coverage: `uv run pytest --cov=src --cov-report=term-missing`.
- Async mode: set `asyncio_mode = "auto"` in `pyproject.toml` under `[tool.pytest.ini_options]` so every `async def test_*` is discovered without `@pytest.mark.asyncio`.

## Layout

```
tests/
  conftest.py            # app, client, db_session fixtures
  factories.py           # factory_<entity>(...) helpers returning dicts / ORM instances
  api/
    test_company.py      # one test file per router
    test_auth.py
  services/
    test_company_service.py
  repositories/
    test_company_repository.py
```

## Lifespan-Aware Test Client

If your tests depend on resources set up in `lifespan` (`HttpClient.init()`, seed data), use `TestClient` as a **context manager** — that triggers the lifespan events. Plain `TestClient(app)` without the `with` block silently skips `lifespan`.

```python
from fastapi.testclient import TestClient
from main import app

def test_health_with_lifespan():
    with TestClient(app) as client:       # triggers lifespan startup
        response = client.get("/health")
        assert response.status_code == 200
    # lifespan shutdown has now run — HttpClient is closed
```

For async-first tests use `httpx.AsyncClient` + `ASGITransport` (below) and wrap in an `async with LifespanManager(app)` from `asgi-lifespan` if you need lifespan without `TestClient`.

## Core Fixtures

Match the app's own shape: the app is created via `main:app`, DB via `db.session.get_db`.

```python
# tests/conftest.py
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from main import app
from db.base import BaseModel
from db.session import get_db

TEST_DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/test"

test_engine = create_async_engine(TEST_DB_URL, future=True)
test_session = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

@pytest.fixture(scope="session", autouse=True)
async def _setup_schema():
    async with test_engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.drop_all)

@pytest.fixture
async def db_session():
    # Each test runs in a transaction that's rolled back — fast, isolated.
    async with test_engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        yield session
        await session.close()
        await trans.rollback()

@pytest.fixture
async def client(db_session):
    async def _override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
```

## Override `@transactional_session`-backed repos

Because repositories acquire sessions via `get_db()` internally (via `@transactional_session`), tests must either:

1. Patch `db.session.get_db` to yield the test session, **or**
2. Pass `db=db_session` explicitly to every repository call under test.

Option 2 is simpler for unit-testing a repository/service; Option 1 is needed for end-to-end route tests.

```python
# Option 1: patch module-level
@pytest.fixture(autouse=True)
def _patch_get_db(monkeypatch, db_session):
    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def _fake():
        yield db_session
    monkeypatch.setattr("db.session.get_db", _fake)
    monkeypatch.setattr("utils.db_transaction.get_db", _fake)
```

## Auth in Tests

API-key routes: inject a valid key via `Authorization` header, or override `verify_api_key`.

```python
from utils.auth import verify_api_key

@pytest.fixture
def authed_client(client):
    app.dependency_overrides[verify_api_key] = lambda: "test-token"
    yield client
    app.dependency_overrides.pop(verify_api_key, None)
```

## Example: Route Test

```python
# tests/api/test_company.py
async def test_get_company_by_external_id(authed_client, db_session):
    from models.company import Company
    db_session.add(Company(external_id=42, name="Acme"))
    await db_session.commit()

    response = await authed_client.get("/api/v1/companies/42")

    assert response.status_code == 200
    assert response.json()["external_id"] == 42

async def test_get_company_not_found(authed_client):
    response = await authed_client.get("/api/v1/companies/999")
    assert response.status_code == 404

async def test_get_company_requires_auth(client):
    response = await client.get("/api/v1/companies/42")
    assert response.status_code == 403
```

## Example: Service Test

```python
# tests/services/test_company_service.py
import pytest
from fastapi import HTTPException
from services.company import company_service

async def test_get_by_external_id_not_found(monkeypatch):
    async def _none(*_, **__): return None
    monkeypatch.setattr("services.company.company_repository.get_by_external_id", _none)
    with pytest.raises(HTTPException) as exc:
        await company_service.get_by_external_id(42)
    assert exc.value.status_code == 404
```

## What to Test

| Layer       | Verify                                                          |
|-------------|-----------------------------------------------------------------|
| Router      | status codes, response shape, auth dependency, Pydantic 422s    |
| Service     | business rules, multi-step transaction behavior, error paths    |
| Repository  | query correctness, `deleted_at` filtering, unique/FK constraints|
| Utils       | `gen_sha256_string`, `encrypt/decrypt_key`, auth helpers        |
| Migrations  | `alembic upgrade head` runs cleanly on a fresh DB               |

## External Services

Never hit OpenWebUI, the HR Forte API, or any upstream in tests. Patch `HttpClient.instance()` or use `respx` to stub `httpx` calls.

```python
import respx, httpx
@respx.mock
async def test_fetch_external_user():
    respx.get("https://hrforte.example/api/v1/auth/user").mock(
        return_value=httpx.Response(200, json={"id": 1, "email": "a@b.com"})
    )
    # ... call the service
```

## Testing Streaming / SSE Endpoints

For NDJSON or SSE endpoints, iterate the response as a stream — don't call `.json()`:

```python
async def test_ndjson_tail(client):
    async with client.stream("GET", "/api/v1/events/tail") as response:
        assert response.status_code == 200
        lines = [json.loads(line) async for line in response.aiter_lines() if line]
        assert lines[0]["type"] == "start"
```

For SSE, `httpx-sse` parses the event stream into `(event, data, id)` tuples — use it instead of string-splitting.

## Coverage Target

- Aim for 80% line coverage once the harness is in place — critical business logic (auth, quotas, sync) should be 100%.
- `uv run pytest --cov=src --cov-fail-under=80` in CI.

## Running

```bash
uv run pytest                              # all tests
uv run pytest tests/api/test_company.py    # one file
uv run pytest -k "not_found"               # match expression
uv run pytest --lf                         # last-failed
uv run pytest --cov=src --cov-report=html  # HTML coverage report
```

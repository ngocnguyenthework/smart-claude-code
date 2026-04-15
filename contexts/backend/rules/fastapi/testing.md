---
paths:
  - "**/test_*.py"
  - "**/*_test.py"
  - "**/conftest.py"
  - "**/*.py"
---
# FastAPI Testing

> Extends [common/testing.md](../common/testing.md) with FastAPI-specific testing patterns.

## Test Structure

- Test files: `test_<domain>.py` colocated in `tests/`
- Shared fixtures: `conftest.py`
- Coverage target: 80%+ (branches, functions, lines)
- Runner: `pytest` with `pytest-asyncio`, `pytest-cov`

## E2E Testing with TestClient / httpx

```python
import pytest
from httpx import ASGITransport, AsyncClient
from src.main import create_app
from src.database import get_db

@pytest.fixture
async def app():
    app = create_app()
    yield app

@pytest.fixture
async def client(app):
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client

@pytest.fixture
async def db_session():
    async with async_test_session() as session:
        yield session

@pytest.fixture
async def authenticated_client(client, db_session):
    # Create test user, get token
    token = create_test_token(user_id=1)
    client.headers["Authorization"] = f"Bearer {token}"
    yield client
```

## Testing Endpoints

```python
@pytest.mark.asyncio
async def test_create_user(client: AsyncClient, db_session):
    response = await client.post("/users/", json={
        "email": "test@example.com",
        "password": "securepass123",
        "name": "Test User",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "password" not in data  # Must not leak

@pytest.mark.asyncio
async def test_create_user_invalid_email(client: AsyncClient):
    response = await client.post("/users/", json={
        "email": "not-an-email",
        "password": "securepass123",
    })
    assert response.status_code == 422  # Validation error

@pytest.mark.asyncio
async def test_get_user_unauthorized(client: AsyncClient):
    response = await client.get("/users/1")
    assert response.status_code == 401
```

## Dependency Override Pattern

```python
# Override database dependency for tests
async def override_get_db():
    async with async_test_session() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db
```

## What to Test

| Layer | Test Type | What to Verify |
|-------|-----------|----------------|
| Router | E2E | Status codes, response shape, auth, validation |
| Service | Unit | Business logic, error paths, edge cases |
| Repository | Integration | Query correctness, constraints |
| Dependencies | Unit | Auth validation, permission checks |

## Factory Pattern for Test Data

```python
# tests/factories.py
from faker import Faker

fake = Faker()

def make_user(**overrides) -> dict:
    defaults = {
        "email": fake.email(),
        "password": "securepass123",
        "name": fake.name(),
    }
    return {**defaults, **overrides}
```

## Running Tests

```bash
# All tests with coverage
pytest --cov=src --cov-report=term-missing -v

# Specific domain
pytest tests/test_users.py -v

# Only failing tests
pytest --lf -v
```

---
description: Scaffold a FastAPI domain with router, schemas, service, repository, and tests
---

# FastAPI Domain Scaffold

## Steps

1. **Ask** for the domain name (e.g., `users`, `orders`, `payments`)

2. **Check** existing project structure:
   ```bash
   ls src/ || ls app/
   cat pyproject.toml | grep -E "sqlalchemy|fastapi|alembic"
   ```

3. **Generate** the following files in `src/domains/<domain-name>/`:

   | File | Content |
   |------|---------|
   | `__init__.py` | Empty init |
   | `router.py` | APIRouter with CRUD endpoints, Depends, response_model |
   | `schemas.py` | Pydantic models: Create, Update, Response with Field() validation |
   | `service.py` | Business logic class with repository dependency |
   | `repository.py` | SQLAlchemy async data access |
   | `models.py` | SQLAlchemy declarative model |

4. **Generate test** file in `tests/`:

   | File | Content |
   |------|---------|
   | `test_<domain>.py` | Endpoint tests with TestClient, dependency overrides, validation tests |
   | `conftest.py` additions | Add DB session fixture if not present |

5. **Register** the router in `src/main.py`:
   ```python
   from src.domains.<domain>.router import router as <domain>_router
   app.include_router(<domain>_router)
   ```

6. **Generate Alembic migration** (if Alembic is configured):
   ```bash
   alembic revision --autogenerate -m "add <domain> table"
   ```

7. **Verify** the scaffold:
   ```bash
   ruff check src/
   mypy src/ --ignore-missing-imports
   pytest tests/test_<domain>.py -v
   ```

## Conventions Applied
- Follow rules from `rules/fastapi/coding-style.md`
- Async-first with AsyncSession
- Pydantic v2 with model_config
- Repository pattern with Protocol
- Dependency injection via Depends()

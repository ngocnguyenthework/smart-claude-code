---
description: Switch to FastAPI development mode — FastAPI + PostgreSQL context
---

# Switch to FastAPI Mode

Load the **FastAPI** context profile for Python + PostgreSQL development.

## Active Context
- **Rules**: `rules/fastapi/`, `rules/common/`
- **Agents**: fastapi-reviewer, database-reviewer, code-reviewer, tdd-guide
- **Focus**: Type safety, Pydantic validation, async patterns, SQLAlchemy, testing

## Behavior Adjustments
- Python type hints on all FastAPI signatures (no `Any` unless justified)
- Validate inputs with Pydantic models — no raw dicts at the boundary
- Async-first: prefer `async def` routes; sync only for CPU-bound work
- Follow Repository pattern for data access
- Thin routers — business logic in services
- Test-first with 80%+ coverage

## Quick Commands Available
- `/fastapi-scaffold` — Scaffold a FastAPI domain
- `/db-migrate` — Database migration workflow

## Diagnostic Quick-Reference
```bash
ruff check . && ruff format --check . && mypy src/ && pytest --cov=src -v
```

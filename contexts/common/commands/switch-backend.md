---
description: Switch to backend development mode — NestJS + FastAPI + PostgreSQL context
---

# Switch to Backend Mode

Load the **backend** context profile for NestJS + FastAPI + PostgreSQL development.

## Active Context
- **Rules**: `rules/nestjs/`, `rules/fastapi/`, `rules/common/`
- **Agents**: nestjs-reviewer, fastapi-reviewer, database-reviewer, code-reviewer, tdd-guide
- **Focus**: Type safety, validation, testing, ORM patterns, query optimization

## Behavior Adjustments
- Use TypeScript strict mode for NestJS code
- Use Python type hints on all FastAPI signatures
- Validate all inputs (class-validator for NestJS, Pydantic for FastAPI)
- Follow Repository pattern for data access
- Thin controllers/routers — business logic in services
- Test-first with 80%+ coverage

## Quick Commands Available
- `/nestjs-scaffold` — Scaffold a NestJS module
- `/fastapi-scaffold` — Scaffold a FastAPI domain
- `/db-migrate` — Database migration workflow

## Diagnostic Quick-Reference
```bash
# NestJS
npx tsc --noEmit && npm run lint && npm test -- --coverage

# FastAPI
ruff check . && mypy src/ && pytest --cov=src -v
```

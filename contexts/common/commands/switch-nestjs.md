---
description: Switch to NestJS development mode — NestJS + PostgreSQL context
---

# Switch to NestJS Mode

Load the **NestJS** context profile for TypeScript + PostgreSQL development.

## Active Context
- **Rules**: `rules/nestjs/`, `rules/common/`
- **Agents**: nestjs-reviewer, database-reviewer, code-reviewer, tdd-guide
- **Focus**: Type safety, DTO validation, DI/modules, ORM patterns, testing

## Behavior Adjustments
- TypeScript strict mode — no implicit `any`, no `// @ts-ignore` without justification
- Validate inputs with `class-validator` + `class-transformer` on every DTO
- Follow Repository pattern for data access (TypeORM or Prisma — one per repo)
- Thin controllers — business logic in services
- Guards for auth, Interceptors for cross-cutting concerns, Pipes for validation
- Test-first with 80%+ coverage

## Quick Commands Available
- `/nestjs-scaffold` — Scaffold a NestJS module
- `/db-migrate` — Database migration workflow

## Diagnostic Quick-Reference
```bash
npx tsc --noEmit && npm run lint && npm test -- --coverage
```

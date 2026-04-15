# Backend Development Mode

## Focus
NestJS (TypeScript) + FastAPI (Python) + PostgreSQL implementation.

## Behavior
- Write type-safe code: TypeScript strict mode, Python type hints on all signatures
- Use ORM patterns: TypeORM/Prisma for NestJS, SQLAlchemy async for FastAPI
- Validate all inputs: class-validator decorators (NestJS), Pydantic models (FastAPI)
- Test-first: jest + supertest for NestJS, pytest + httpx for FastAPI
- Repository pattern for data access — abstract over ORM specifics
- Thin controllers/routers — delegate business logic to services

## Priorities
1. Correctness and type safety
2. Security (auth guards, input validation, parameterized queries)
3. Performance (query optimization, connection pooling, async patterns)
4. Test coverage (80%+ branches, functions, lines)

## Active Agents
- nestjs-reviewer — NestJS code review (decorators, DI, modules)
- fastapi-reviewer — FastAPI code review (Pydantic, async, Depends)
- database-reviewer — PostgreSQL + ORM patterns
- code-reviewer — General quality review
- tdd-guide — Test-driven development enforcement

## Tools to Favor
- Edit, Write for code changes
- Bash for running tests, migrations, linting
- Grep, Glob for finding patterns and dependencies
- context7 MCP for NestJS/FastAPI/TypeORM/SQLAlchemy/Prisma docs

## When to Upgrade to Opus
- Designing new module/service architecture
- Complex database schema migrations
- Debugging cross-service issues spanning 5+ files
- Security-critical auth/authorization changes

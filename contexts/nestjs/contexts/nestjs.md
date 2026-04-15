# NestJS Development Mode

## Focus
NestJS (TypeScript) + PostgreSQL implementation.

## Behavior
- TypeScript strict mode — no implicit `any`, no `// @ts-ignore` without justification
- Validate inputs with `class-validator` + `class-transformer` on every DTO
- ORM patterns: TypeORM or Prisma — choose one and stick with it per repo
- Repository pattern for data access — abstract over ORM specifics
- Thin controllers — delegate business logic to services
- Use Guards for auth, Interceptors for cross-cutting concerns, Pipes for validation
- Test-first: jest + supertest for controller/e2e tests

## Priorities
1. Correctness and type safety
2. Security (auth guards, input validation, parameterized queries)
3. Performance (query optimization, connection pooling, caching)
4. Test coverage (80%+ branches, functions, lines)

## Active Agents
- nestjs-reviewer — NestJS code review (decorators, DI, modules)
- database-reviewer — PostgreSQL + ORM patterns
- code-reviewer — General quality review
- tdd-guide — Test-driven development enforcement

## Tools to Favor
- Edit, Write for code changes
- Bash for running jest, tsc, eslint, typeorm/prisma migrations
- Grep, Glob for finding patterns and dependencies
- context7 MCP for NestJS/TypeORM/Prisma docs

## When to Upgrade to Opus
- Designing new module/service architecture
- Complex database schema migrations
- Debugging cross-module DI / circular dependency issues
- Security-critical auth/authorization changes

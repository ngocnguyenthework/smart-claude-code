# nestjs — backend workflows

NestJS + PostgreSQL coverage. **TypeScript 5+ · NestJS 10+ · TypeORM / Prisma · class-validator · class-transformer · Jest / Vitest.**

**Companion docs in `.claude/docs/`:**
- `common-README.md` — universal workflows (planning, bug fix, review)
- `INTERNALS.md` — hook lifecycle, session memory, safety guardrails

---

## Setup

```bash
~/tools/smart-claude/install.sh --context nestjs --dir ~/code/my-api
```

Prerequisites: Node 18+, Postgres (or Supabase), your ORM of choice (TypeORM / Prisma).

Shell alias (add to `~/.zshrc`):
```bash
alias claude-nest='claude --append-system-prompt "$(cat .claude/contexts/nestjs.md 2>/dev/null)"'
```

---

## What this ships

| Folder | Contents |
|---|---|
| `agents/` | `nestjs-reviewer`, `database-reviewer` |
| `commands/` | `/nestjs-scaffold`, `/db-migrate` |
| `rules/nestjs/` | `coding-style`, `patterns`, `security`, `testing` |
| `skills/` | `api-connector-builder`, `api-design`, `backend-patterns`, `database-migrations`, `nestjs-patterns` |
| `contexts/nestjs.md` | Session framing — load via `claude-nest` |
| `settings.json` | (no context-specific hooks — JS/TS format + typecheck come from common) |
| `mcp-servers.json` | `supabase`, `clickhouse` |

---

## What the stack reviewer enforces

- **One module per feature** — controller, service, repo (or TypeORM/Prisma data access), DTOs, tests.
- **Constructor DI only** — no `@Inject()` except for tokens; no property injection.
- **DTOs with `class-validator`** — every request body validated; no `any` at the boundary.
- **Controllers are thin** — route → validate → delegate to service → return. Business logic lives in services.
- **Guards for auth**, **Interceptors for cross-cutting**, **Pipes for transformation** — don't reach for middleware unless it's truly global.
- **No circular imports** — if two modules need each other, extract the shared piece or use `forwardRef` only as a last resort.
- **Migrations are reviewed** — never auto-sync in anything but dev.

---

## Scenarios

### 1. Add a module (CRUD)

**When:** new resource (e.g. `Order`).

```
1. claude-nest
2. /plan "Order CRUD: create/list/get/update/cancel. Cancel is soft-delete."
3. /nestjs-scaffold order
   → generates OrderModule + controller + service + DTOs + entity + tests
4. Wire into AppModule imports
5. Fill service logic, repository queries
6. /db-migrate  (if schema changed)
7. npm test -- order
8. /code-review
```

**Effective prompt:**
```
/nestjs-scaffold order
Fields: id (uuid), customerId (uuid FK), amount (decimal 10,2), status (enum: pending/confirmed/shipped/cancelled), createdAt, updatedAt, cancelledAt.
Cancel = soft-delete (set cancelledAt, don't hard-delete).
List excludes cancelled by default; ?includeCancelled=true to show.
```

**Pitfalls the reviewer flags:**
- Business logic leaking into the controller.
- Missing `class-validator` decorators on DTO fields.
- Service injecting the repo via a token when constructor DI would work.

---

### 2. Auth with Guards

**When:** route(s) need authenticated + authorised access.

```
1. /plan "Protect /orders/* behind JwtAuthGuard. Admin-only for DELETE."
2. If guards don't exist yet:
   - Create JwtAuthGuard extending AuthGuard('jwt')
   - Create RolesGuard + @Roles('admin') decorator
3. Apply: @UseGuards(JwtAuthGuard) on controller; @UseGuards(JwtAuthGuard, RolesGuard) + @Roles('admin') on the delete route
4. Test both 200 (valid token + role) and 401/403 paths
5. /code-review  (reviewer checks every route is covered)
```

**Effective prompt:**
```
Add auth to src/orders/orders.controller.ts.
Use the existing JwtAuthGuard from src/auth/guards/jwt-auth.guard.ts.
Admin-only for DELETE /orders/:id using the existing RolesGuard + @Roles('admin').
Add tests for: (a) no token → 401, (b) non-admin → 403 on DELETE, (c) admin → 204.
```

---

### 3. Schema change + migration

**When:** adding/removing/altering columns, indexes, or constraints.

```
1. Update the entity (TypeORM) or schema.prisma
2. /db-migrate
   → generates migration (typeorm migration:generate / prisma migrate dev)
   → database-reviewer reviews for safety
3. Reviewer checks:
   - Backfill for new NOT NULL on populated tables
   - CREATE INDEX CONCURRENTLY for large tables
   - Rollback safety
4. Apply to a prod-like branch if available
5. /code-review
```

**Effective prompt:**
```
/db-migrate
Context: Add `invoicedAt TIMESTAMP NULL` + index to Order.
Table size: ~5M rows.
Must include: CONCURRENTLY on the index, rollback revert.
```

**Pitfall:** running the migration in dev with `synchronize: true` — the reviewer flags any PR that enables it.

---

### 4. Background job with BullMQ

**When:** work that can't run in-request (sending emails, webhooks, reports, image processing).

```
1. Decide: BullMQ (Redis-backed, dominant for NestJS) or a simpler queue
2. Add a Queue (processor + service):
   - OrderEmailProcessor with @Process('send-confirmation')
   - OrderEmailService.enqueueConfirmation(orderId)
3. Register in the module: BullModule.registerQueue({ name: 'order-email' })
4. Idempotency: the processor must be safe to retry. Use a `jobs_idempotency` row or an entity flag.
5. Test:
   - Processor logic with a mocked job
   - Queue interaction with bullmq's in-memory mock or a Redis test container
```

**Effective prompt:**
```
Add BullMQ job: send-confirmation-email.
Queue: order-email. Processor: src/orders/processors/order-email.processor.ts.
Enqueued from OrderService.confirm(orderId).
Idempotent: skip if order.confirmationEmailSentAt is set.
Retry policy: 3 attempts, exponential backoff starting at 30s.
Tests: processor unit test + integration test for the enqueue side.
```

---

### 5. Redis cache (cache-aside)

**When:** a read-heavy endpoint serving frequently-accessed data.

```
Pattern (cache-aside, from backend-patterns skill):
  1. Try cache → hit: return
  2. Miss → query DB → set cache with TTL → return
  3. Invalidate cache on write

Pitfalls:
  - Cache stampede on expiry: use a lock or probabilistic refresh
  - Stale cache after a failed write: invalidate BEFORE the DB write, then retry on failure
```

**Effective prompt:**
```
Cache GET /orders/:id with cache-aside pattern.
Key: `order:${id}`. TTL: 5 minutes.
Invalidate on any write to that order (update, cancel).
Use the existing CacheService (src/cache/cache.service.ts).
Test: first call is cache miss, second is hit, after update it's a miss again.
```

---

### 6. WebSocket gateway

**When:** you need real-time push (live dashboards, chat, order status updates).

```
1. Create a Gateway: @WebSocketGateway({ namespace: '/orders' })
2. Handle connect/disconnect; validate auth at @SubscribeMessage('join') (guards work here too)
3. Emit events from the service (inject WebSocketGateway)
4. Test: use socket.io-client against the test app
```

**Effective prompt:**
```
Add OrderGateway at namespace /orders.
Clients subscribe to a room `order:${id}` after JoinOrderDto validated.
Emit `order:status-changed` when OrderService.updateStatus runs.
Auth via the existing WsJwtGuard on @SubscribeMessage('join').
Tests: connect → join → verify an update triggers the emit.
```

---

### 7. DTO validation design

**When:** defining the request/response shapes for a new route.

```
1. Request DTO: class with class-validator decorators
   - @IsNotEmpty(), @IsUUID(), @IsEnum(), @Min/Max, @ValidateNested for nested shapes
2. Response: plain class or interface — use class-transformer @Expose/@Exclude for output shaping
3. Enable global ValidationPipe with { whitelist: true, forbidNonWhitelisted: true }
4. Never accept `any`; reject unknown keys.
```

**Effective prompt:**
```
Add CreateOrderDto with:
  - customerId: UUID, required
  - items: non-empty array of {productId: UUID, quantity: int > 0}
  - notes: optional, max 500 chars
Every field must have class-validator decorators.
Any extra key must be rejected (forbidNonWhitelisted).
Test: 10 validation cases covering each decorator.
```

---

### 8. Bug fix (test-first)

**When:** bug reported with a repro.

```
1. claude-nest
2. Reproduce locally
3. Write a failing test at the right layer:
   - Service unit test if the bug is in logic
   - e2e test (@nestjs/testing + supertest) if it crosses boundaries
4. Find the root cause (don't patch the symptom)
5. Fix
6. /code-review
7. Commit: "fix: <description>"
```

**Effective prompt:**
```
Bug: POST /orders with items.length === 0 creates an empty order — should 400.
ValidationPipe should catch @ArrayNotEmpty on items but doesn't.
1. Write the failing test in test/orders.e2e-spec.ts first.
2. Trace why the decorator isn't running.
3. Fix at the DTO/pipe layer, not the controller.
```

---

### 9. Debug DI / module wiring issues

**When:** `Nest can't resolve dependencies`, circular dependency warnings, or mystery `undefined` after constructor.

```
1. Read the error — Nest names the exact missing token.
2. Check, in order:
   a. Is the provider in the module's `providers: []`?
   b. Is it exported from its home module (`exports: []`)?
   c. Does the consuming module import the home module?
   d. If two modules need each other → forwardRef(), but prefer extracting a shared module
   e. If the dep is from a DynamicModule (`forRoot`/`forRootAsync`), is it registered in AppModule?
3. Tests: often the TestingModule doesn't re-import shared modules — override or import them explicitly.
```

**Effective prompt:**
```
Error: "Nest can't resolve dependencies of OrderService (OrderRepository, ?). ConfigService is not found."
Trace the OrdersModule + ConfigModule imports.
List every place ConfigService would need to be provided/imported.
Do not fix yet — show me where the break is first.
```

---

### 10. Performance debug — slow endpoint

**When:** a specific endpoint is slow or CPU is hot.

```
1. claude-research
2. Instrument: request timing logs, DB query logs (TypeORM `logging: ['query']` or Prisma event logs)
3. Common causes (ranked):
   a. N+1 in the ORM → eager loading or explicit relations query
   b. Missing index → migration
   c. Blocking work inside the request → move to BullMQ
   d. Serialisation overhead on large responses → paginate / project fewer fields
4. Measure before + after.
```

**Effective prompt:**
```
GET /orders p95 ~1.2s, ~50 rows/page.
TypeORM logs show ~N queries per request (N+1 on Customer).
Trace OrderService.list → OrderRepository.findAll.
Propose a fix + expected query count.
```

---

## Commands

### `/nestjs-scaffold <entity>`

Generates a full NestJS module skeleton.

**Produces:**
- `src/<entity>/<entity>.module.ts`
- `src/<entity>/<entity>.controller.ts` — CRUD routes
- `src/<entity>/<entity>.service.ts`
- `src/<entity>/entities/<entity>.entity.ts` — TypeORM (or Prisma model)
- `src/<entity>/dto/create-<entity>.dto.ts` + `update-<entity>.dto.ts`
- `src/<entity>/<entity>.controller.spec.ts` + `.service.spec.ts`

**Prompt shape:**
```
/nestjs-scaffold <entity>
Fields: <name: type, ...>
Relations: <belongsTo X / hasMany Y>
Soft-delete: <yes / no / column name>
Auth: <public / JwtAuthGuard / RolesGuard + @Roles('...')>
```

---

### `/db-migrate`

Auto-detects TypeORM vs Prisma vs Alembic and walks the right flow.

**Use when:** any change to the data model.

**Produces:** reviewed migration file.

**Reviewer checks:**
- Partial unique indexes respecting soft-delete
- CREATE INDEX CONCURRENTLY for large tables
- Backfill steps for new NOT NULL columns
- Rollback safety

**Prompt shape:**
```
/db-migrate
Context: <model change, table size, traffic pattern>
Must include: <concurrent index / backfill / rollback plan>
```

---

## Prompt patterns for this stack

### Pattern: thin controller, fat service

```
Move the business logic in <controller method> into the service.
Controller should: parse DTO → call service → return.
Service gets dependencies via constructor. Update the .spec.ts files.
```

### Pattern: DI-safe refactor

```
Extract <logic> into a new Provider <Name>Service.
Register in the module's providers, export if consumed externally.
No @Inject() unless it's a non-class token.
```

### Pattern: e2e test for a route

```
Add test/<feature>.e2e-spec.ts covering <method> <path>.
Use supertest on the app from TestingModule.createNestApplication().
Cover: happy path, each validation failure, each guard rejection.
```

### Anti-pattern (don't do this)

```
Add endpoint for orders  ← missing: auth, validation shape, response shape, pagination strategy
```

---

## Auto-hooks for this context

Inherited from `common`:

1. `post-edit-format.js` — Biome or Prettier on `.ts` Edit/Write
2. `post-edit-typecheck.js` — `tsc --noEmit` on the edited file's project
3. `console.log` warning (doesn't block)

---

## Pair-with

- `nestjs + devops` — platform repo (API + infra)
- `nestjs + frontend` — full-stack monorepo
- `nestjs + fastapi` — polyglot backend; DB skills dedupe at install

---

## See also

- `common-README.md` — universal workflows (planning, bug fix, root cause, review)
- `INTERNALS.md` — hook lifecycle, safety guardrails

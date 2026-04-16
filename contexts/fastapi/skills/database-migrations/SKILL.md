---
name: database-migrations
description: Database migration best practices — zero-downtime expand-contract pattern, safe column operations, concurrent indexes, batch data migrations, and ORM workflows (Prisma, Drizzle, Kysely, Django, golang-migrate).
origin: smartclaude
---

# Database Migration Patterns

## Core Principles

1. **Every change is a migration** — never alter production databases manually
2. **Schema and data migrations are separate** — never mix DDL and DML
3. **Migrations are immutable once deployed** — never edit a migration that ran in production
4. **Test against production-sized data** — 100 rows ≠ 10M rows behavior

## Migration Safety Checklist

Before applying any migration:
- [ ] New columns are nullable or have defaults (never NOT NULL without default)
- [ ] Indexes created with CONCURRENTLY on large tables
- [ ] Data backfill is a separate migration from schema change
- [ ] Tested against production data snapshot
- [ ] Rollback plan documented

## PostgreSQL Patterns

### Safe Column Operations

```sql
-- GOOD: Nullable (no lock)
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- GOOD: With default (Postgres 11+ is instant)
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- BAD: NOT NULL without default = full table rewrite + lock
ALTER TABLE users ADD COLUMN role TEXT NOT NULL;
```

### Non-Blocking Index

```sql
-- BAD: blocks writes
CREATE INDEX idx_users_email ON users (email);

-- GOOD: concurrent, no write lock
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);
-- Note: cannot run inside a transaction block
```

### Large Data Migration (Batch)

```sql
DO $$
DECLARE batch_size INT := 10000; rows_updated INT;
BEGIN
  LOOP
    UPDATE users SET normalized_email = LOWER(email)
    WHERE id IN (SELECT id FROM users WHERE normalized_email IS NULL LIMIT batch_size FOR UPDATE SKIP LOCKED);
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    COMMIT;
  END LOOP;
END $$;
```

## Zero-Downtime: Expand-Contract Pattern

For renaming columns or making breaking changes:

```
Phase 1: EXPAND   — Add new column (nullable), deploy app writes to BOTH old + new
Phase 2: BACKFILL — Migrate existing rows in batches
Phase 3: MIGRATE  — Deploy app reads from new, writes to both
Phase 4: CONTRACT — Deploy app only uses new → drop old column
```

Timeline example: Day 1 (add column) → Day 1 (deploy v2) → Day 2 (backfill) → Day 3 (deploy v3) → Day 7 (drop old column)

## ORM Workflows

**Prisma:**
```bash
npx prisma migrate dev --name add_user_avatar    # dev
npx prisma migrate deploy                        # production
npx prisma migrate dev --create-only --name x   # manual SQL needed
```

**Drizzle:**
```bash
npx drizzle-kit generate   # generate migration from schema
npx drizzle-kit migrate    # apply
npx drizzle-kit push       # dev only (no migration file)
```

**Kysely** — use `Kysely<any>` in migration files (not typed interface, migrations are frozen in time):
```typescript
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createTable('user_profile')
    .addColumn('id', 'serial', col => col.primaryKey())
    .addColumn('email', 'varchar(255)', col => col.notNull().unique())
    .execute()
}
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('user_profile').execute()
}
```

**Django:**
```bash
python manage.py makemigrations && python manage.py migrate
```
Data migration with `migrations.RunPython(forward_fn, reverse_fn)`. Use `SeparateDatabaseAndState` to decouple model changes from DB operations.

**golang-migrate:**
```bash
migrate create -ext sql -dir migrations -seq add_user_avatar
migrate -path migrations -database "$DATABASE_URL" up
migrate -path migrations -database "$DATABASE_URL" force VERSION  # fix dirty state
```

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| Manual SQL in production | No audit trail | Always use migration files |
| Editing deployed migrations | Schema drift | Create new migration |
| NOT NULL without default | Table lock + rewrite | Nullable → backfill → add constraint |
| Inline index on large table | Blocks writes | `CREATE INDEX CONCURRENTLY` |
| Schema + data in one migration | Hard to rollback | Separate migrations |
| Drop column before removing code | App errors | Remove code first, drop column next deploy |

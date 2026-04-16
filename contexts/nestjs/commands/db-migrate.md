---
description: Database migration workflow — auto-detects TypeORM, Prisma, or Alembic
---

# Database Migration

## Steps

1. **Detect ORM** in use:
   ```bash
   # Check for TypeORM
   grep -q "typeorm" package.json 2>/dev/null && echo "TYPEORM"
   # Check for Prisma
   test -f prisma/schema.prisma && echo "PRISMA"
   # Check for Alembic
   test -f alembic.ini && echo "ALEMBIC"
   ```

2. **Ask** for migration description (e.g., "add orders table", "add email index to users")

3. **Generate migration** based on detected ORM:

   **TypeORM:**
   ```bash
   npx typeorm migration:generate -d src/data-source.ts src/migrations/<MigrationName>
   ```

   **Prisma:**
   ```bash
   npx prisma migrate dev --name <migration_name>
   ```

   **Alembic:**
   ```bash
   alembic revision --autogenerate -m "<description>"
   ```

4. **Read and review** the generated migration file

5. **Invoke database-reviewer agent** on the migration with focus on:
   - Destructive operations (DROP TABLE, DROP COLUMN)
   - Adding NOT NULL without default on populated tables
   - Missing indexes on new foreign keys
   - Large table alterations (need CONCURRENTLY for indexes)
   - Data type choices (bigint for IDs, timestamptz, text)

6. **Run migration** (if approved):

   **TypeORM:** `npx typeorm migration:run -d src/data-source.ts`
   **Prisma:** (already applied by migrate dev)
   **Alembic:** `alembic upgrade head`

7. **Verify** migration applied:
   ```bash
   # Check migration status
   # TypeORM: npx typeorm migration:show -d src/data-source.ts
   # Prisma: npx prisma migrate status
   # Alembic: alembic current
   ```

## Safety Rules
- Always review generated migration SQL before running
- Backup database before destructive migrations in production
- Use `CREATE INDEX CONCURRENTLY` for large tables
- Test migration on staging before production

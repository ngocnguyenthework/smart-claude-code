---
description: Alembic migration workflow — uses uv + Makefile targets, aligns with this codebase's conventions.
---

# Database Migration (Alembic)

This project uses **Alembic via `uv`**, with Makefile shortcuts. Models live in `src/models/`, all inheriting `UUIDBase` / `AutoIncrementBase` (soft-delete is in the base). Autogenerate must pick up new models imported somewhere on the app import graph — typically `src/models/__init__.py` or `src/db/base.py`'s `metadata`.

## Steps

1. **Pre-flight**:
   ```bash
   uv run alembic heads       # should print exactly one head; if more → merge first
   uv run alembic current     # confirm local DB is up to date
   ```
   If heads diverge:
   ```bash
   uv run alembic merge -m "merge heads" <head1> <head2>
   ```

2. **Ask** for a short, imperative description (e.g., `add_companies_table`, `add_email_index_to_users`, `add_usage_counter_monthly_reset`). Use snake_case.

3. **Ensure the model is importable** — autogenerate compares DB against `BaseModel.metadata`. A new model file that nothing imports will be invisible to Alembic. Either:
   - Add an import to `src/models/__init__.py`, or
   - Verify the model is imported by something already on the import graph.

4. **Generate**:
   ```bash
   make db-gen message="<description>"
   # equivalent: uv run alembic revision --autogenerate -m "<description>"
   ```

   For migrations Alembic cannot autogenerate (data backfill, raw SQL, renames where autogenerate guesses wrong):
   ```bash
   make db-create message="<description>"
   # equivalent: uv run alembic revision -m "<description>"
   ```

5. **Read** the generated file at `migrations/versions/<hash>_<description>.py`. Verify:
   - [ ] **Scope is correct** — only your intended change is present; no unrelated drift from another dev's schema.
   - [ ] **Timestamps** — new tables have `created_at`, `updated_at`, `deleted_at` with `server_default=sa.func.now()` (and `onupdate=sa.func.now()` for `updated_at`).
   - [ ] **PK** — UUID tables use `server_default=sa.text("gen_random_uuid()")`; integer PKs use `autoincrement=True`.
   - [ ] **Timezone** — every datetime column is `sa.DateTime(timezone=True)`.
   - [ ] **NOT NULL** — required fields (Mapped[T] without `| None`) are `nullable=False` in the migration.
   - [ ] **FK indexes** — every foreign-key column has a companion `op.create_index(...)`.
   - [ ] **Soft-delete partial index** on hot-path tables:
         ```python
         op.create_index("ix_<table>_active", "<table>", ["<query_col>"],
                         postgresql_where=sa.text("deleted_at IS NULL"))
         ```
   - [ ] **Destructive ops** (`drop_column`, `drop_table`) only removed after the code that referenced them was shipped.
   - [ ] **Data migrations** are in a **separate revision** from schema migrations.

6. **Invoke `database-reviewer`** on the migration with an explicit prompt that includes:
   - The migration file contents.
   - Whether the target table is large (>100k rows in prod).
   - Whether there are concurrent writers.
   Ask it to flag: NOT NULL without default, index builds on large tables without `CONCURRENTLY`, destructive ops, missing FK indexes, missing soft-delete partial index.

7. **For large-table operations**, edit the migration to use concurrent index creation. Alembic requires an autocommit block for `CREATE INDEX CONCURRENTLY`:
   ```python
   def upgrade() -> None:
       with op.get_context().autocommit_block():
           op.create_index(
               "ix_large_table_col", "large_table", ["col"],
               postgresql_concurrently=True,
               if_not_exists=True,
           )
   ```

8. **Apply** (dev):
   ```bash
   make db-sync
   # equivalent: uv run alembic upgrade head
   ```

9. **Smoke-test**:
   ```bash
   uv run alembic current             # should show the new revision
   psql "$DEV_DB_URL" -c "\d+ <new_or_changed_table>"
   ```

10. **If something is wrong** before commit:
    ```bash
    make db-rollback                   # uv run alembic downgrade -1
    # delete the bad migration file, fix models, regenerate
    ```

## Safety Rules

- **Never edit a migration that has shipped to any environment.** Create a new one.
- **Backup production** before any destructive or data-migration revision.
- **Ship code first, drop column next deploy** for destructive schema changes (expand-contract).
- **Separate schema and data migrations** — easier rollback, clearer history.
- **Use `CREATE INDEX CONCURRENTLY`** on any table expected to exceed ~100k rows.
- **Test against a production-sized snapshot** when the change touches a large table.

## Writing a Data Backfill Migration

```python
# migrations/versions/<hash>_backfill_<thing>.py
from alembic import op
import sqlalchemy as sa

def upgrade() -> None:
    conn = op.get_bind()
    # Batch to avoid long locks
    batch = 10_000
    while True:
        result = conn.execute(sa.text("""
            WITH batch AS (
                SELECT id FROM users
                WHERE normalized_email IS NULL
                LIMIT :batch FOR UPDATE SKIP LOCKED
            )
            UPDATE users SET normalized_email = LOWER(email)
            FROM batch WHERE users.id = batch.id
        """), {"batch": batch})
        if result.rowcount == 0:
            break

def downgrade() -> None:
    op.execute("UPDATE users SET normalized_email = NULL")
```

## Common Makefile Targets

```bash
make db-gen message="..."    # autogenerate
make db-create message="..." # empty revision (for data backfills, raw SQL)
make db-sync                 # upgrade head
make db-rollback             # downgrade -1
```

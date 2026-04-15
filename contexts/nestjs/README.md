# contexts/nestjs

NestJS + PostgreSQL coverage. Add on top of `common`.

**Install:**

```bash
./install.sh --context nestjs --dir ~/code/my-api
```

## Scenarios

- **You're building a NestJS service.** The `nestjs-reviewer` agent spots missing guards, circular DI, and leaky decorators. `/nestjs-scaffold` generates module + controller + service + tests from a feature description.
- **You're changing a database schema.** `/db-migrate` routes through `database-reviewer` to draft the migration, backfill plan, and rollback path.
- **TS files get auto-formatted and type-checked.** Inherited from `common`: `post-edit-format.js` runs Biome/Prettier and `post-edit-typecheck.js` runs `tsc --noEmit` after every `.ts` Edit/Write.

## What's inside

| Folder | Contents |
|--------|----------|
| `agents/` | `nestjs-reviewer`, `database-reviewer` |
| `commands/` | `/nestjs-scaffold`, `/db-migrate` |
| `rules/nestjs/` | coding-style, patterns, security, testing for NestJS |
| `skills/` | `api-connector-builder`, `api-design`, `backend-patterns`, `database-migrations`, `nestjs-patterns` |
| `contexts/nestjs.md` | NestJS session framing |
| `settings.json` | (no context-specific hooks — JS/TS format + typecheck come from common) |
| `mcp-servers.json` | `supabase`, `clickhouse` |

## Pairs well with

- `--context nestjs,devops` — for a platform repo (API + infra)
- `--context nestjs,frontend` — for a full-stack monorepo
- `--context nestjs,fastapi` — for a polyglot backend (shared DB/API skills get deduped at install)

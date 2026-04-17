# Common Patterns

> **Production-readiness is the baseline, not a stretch goal.** Every feature planned here must pass the checklist in [production-readiness.md](./production-readiness.md) — file uploads use presigned URLs, emails enqueue, long work runs in background jobs, mutations are idempotent, etc. See [skills/production-patterns/SKILL.md](../../skills/production-patterns/SKILL.md) for the correct designs with code.
>
> **Dependency approval is the baseline for adopting libraries.** Before adding any new package / MCP / container image / SaaS, run the workflow in [dependency-approval.md](./dependency-approval.md) + [skills/dependency-selection/SKILL.md](../../skills/dependency-selection/SKILL.md): stdlib check, existing-dep reuse scan, 2+ alternatives compared, `AskUserQuestion` gate, pinned exact version on approval.

## Shared Base First (CRITICAL)

**If a shape, behavior, or helper repeats across 2+ places → promote to a shared base. Never re-define.**

Applies to every kind of component, not only schemas:

| Layer | Put common shape in | Examples |
|---|---|---|
| Data access | `BaseRepository<T>` / `BaseModel` | CRUD, soft-delete, audit columns, pagination |
| Service / use-case | `BaseService` / shared mixins | transactional wrappers, retry, audit logs |
| Schemas / DTOs | `schemas/base.py` / `common/dto/` | `BaseResponseModel`, `OffsetPaginated[T]`, `OkResponse`, `ErrorResponse` |
| Controllers / routers | Shared decorators, guards, pipes | auth, rate-limit, tenant-scope, idempotency |
| UI components | `components/ui/` primitives + layout wrappers | `Button`, `DataTable<T>`, `Pagination`, `FormField` |
| Hooks / utilities | `hooks/` / `lib/` | `usePagination`, `useDebouncedValue`, `formatDate` |
| Types | Shared `types/` / generics | `Paginated<T>`, `ApiResponse<T>`, `Result<T,E>` |
| Infra modules | Terraform modules, Helm base chart | VPC, IAM role, service chart |
| Tests | Shared fixtures, factories | `createUserFactory`, `mockDbSession` |

### Rules

- **Rule of 2**: second time you write same shape → extract to base.
- **Rule of 1 for envelopes**: pagination, error, success, audit envelopes belong in base from day one — never entity-specific (no `UserListResponse`, `ProductPaginated`, `OrderDeletedResponse`).
- **Parametrize via generics**, not via copy-paste. `Paginated[Foo]` / `BaseRepository<Bar>` — not new classes per entity.
- **Promote, don't re-copy**. If same function / type / component exists in two files → move to shared, import from both.
- **Never redeclare base fields**. Entity schemas inherit `id/created_at/updated_at` — don't re-list.
- **Review step**: before creating new class/function, grep existing bases. If near match exists → extend, don't fork.

### Anti-patterns (block on review)

- `XListResponse { items; total; offset; limit }` when `OffsetPaginated[X]` exist.
- `XDeletedResponse { ok: true }` when `OkResponse` exist.
- Per-entity `getPaginated<X>()` helpers when `BaseRepository.paginate()` exist.
- Two hooks doing same debounce with different names.
- Two form-field wrappers with same label+error+input layout.
- Copy-pasted terraform module instead of `module "x" { source = "../modules/x" }`.

## Skeleton Projects

When implementing new functionality:
1. Search for battle-tested skeleton projects
2. Use parallel agents to evaluate options:
   - Security assessment
   - Extensibility analysis
   - Relevance scoring
   - Implementation planning
3. Clone best match as foundation
4. Iterate within proven structure

## Design Patterns

### Repository Pattern

Encapsulate data access behind a consistent interface:
- Define standard operations: findAll, findById, create, update, delete
- Concrete implementations handle storage details (database, API, file, etc.)
- Business logic depends on the abstract interface, not the storage mechanism
- Enables easy swapping of data sources and simplifies testing with mocks

### API Response Format

Use a consistent envelope for all API responses:
- Include a success/status indicator
- Include the data payload (nullable on error)
- Include an error message field (nullable on success)
- Include metadata for paginated responses (total, page, limit)

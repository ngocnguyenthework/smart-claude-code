# Common Patterns

> Production-readiness baseline: see [production-readiness.md](./production-readiness.md). Dependency approval baseline: see [dependency-approval.md](./dependency-approval.md).

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

For new functionality: search battle-tested skeletons → evaluate (security, extensibility, relevance) in parallel agents → clone best match → iterate within proven structure.

## Core Design Patterns

- **Repository**: data access behind abstract interface (`findAll/findById/create/update/delete`). Business logic depends on interface, not storage.
- **API Response Envelope**: consistent shape — `{ success, data, error, meta }`. Pagination metadata in `meta`. Never entity-specific response types (see Shared Base above).

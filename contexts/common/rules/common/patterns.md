# Common Patterns

> **Production-readiness is the baseline, not a stretch goal.** Every feature planned here must pass the checklist in [production-readiness.md](./production-readiness.md) — file uploads use presigned URLs, emails enqueue, long work runs in background jobs, mutations are idempotent, etc. See [skills/production-patterns/SKILL.md](../../skills/production-patterns/SKILL.md) for the correct designs with code.
>
> **Dependency approval is the baseline for adopting libraries.** Before adding any new package / MCP / container image / SaaS, run the workflow in [dependency-approval.md](./dependency-approval.md) + [skills/dependency-selection/SKILL.md](../../skills/dependency-selection/SKILL.md): stdlib check, existing-dep reuse scan, 2+ alternatives compared, `AskUserQuestion` gate, pinned exact version on approval.

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

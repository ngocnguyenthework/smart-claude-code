# Production-Readiness (CRITICAL)

> Every plan, implementation, and review ships production-ready on the first pass. No `TODO(prod)`, no dev-only branches, no "wire it up later." Full anti-pattern catalog with correct designs lives in `skills/production-patterns/SKILL.md` — load that skill when planning or reviewing features touching file I/O, email, background jobs, DB queries, API design, auth, caching, or infra.

## Non-Negotiable Principles

1. **Design for prod from step 1.** Dev is a subset of prod, not the other way around.
2. **Offload work from server when client can do it safely** (presigned URLs, direct client↔provider).
3. **Every external call has timeout, retry with backoff, idempotency key** for mutations.
4. **Every long-running task is a background job**, not inline HTTP handler. Handlers return <1s.
5. **Every mutation has audit trail** — who/what/when/before/after with correlation id.
6. **Fail closed on auth, fail open on cache.** Missing token → reject. Redis down → hit origin.
7. **Every schema change is expand → backfill → contract.** Never single destructive migration on live table.

## Anti-Pattern Categories (see skills/production-patterns for correct designs)

- **File upload/download** — presigned URLs, not server proxy
- **Email/notifications** — enqueue, never inline
- **Background jobs** — cron/queue, not `setTimeout`; idempotency keys; DLQ
- **DB/queries** — no N+1, cursor pagination, index filter columns, parameterized queries
- **API design** — POST for mutations, paginate, rate-limit, UUIDs not ints, generic errors
- **Auth/security** — secret manager, argon2id/bcrypt, auth-by-default, CORS allowlist, HttpOnly+Secure+SameSite
- **Caching/state** — Redis not in-memory, TTL/invalidation documented, key-scoped per user
- **Infrastructure** — config layer, multi-AZ, probes, resource limits, non-root, pinned digests
- **Observability** — structured logs + correlation id, metrics per endpoint, error reporting, tracing

## Production Checklist (per feature)

- [ ] Env-specific values from config layer (no hardcoded URLs/buckets/keys)
- [ ] Secrets from secret manager in prod
- [ ] External calls have timeout + retry + circuit breaker
- [ ] Mutations are idempotent or have idempotency keys
- [ ] Structured logs at entry/exit/error with correlation id
- [ ] Metrics (count + latency + errors) per new endpoint/job
- [ ] Error reporting captures unhandled errors
- [ ] Auth + authz enforced server-side
- [ ] Input validated at boundary with schema
- [ ] Rate limiting on public endpoints
- [ ] Schema changes follow expand → backfill → contract
- [ ] Rollback plan for irreversible changes
- [ ] Health/readiness probes updated if new dep added
- [ ] Resource limits on new containers/jobs
- [ ] No dev-only code path without prod counterpart in same PR

## Deferring Prod Concerns

**Default: never.** Only exception: user explicitly requested throwaway spike. Then plan overview must say "spike — not for prod", risks section lists deferrals, PR + commit repeat caveat, code deleted/replaced before merge. No silent deferral.

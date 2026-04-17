# Production-Readiness (CRITICAL)

> Every plan, implementation, and review ships production-ready on the first pass. No `TODO(prod)`, no dev-only branches, no "wire it up later." The planner enforces this at `/plan` time; reviewers block CRITICAL violations at review time.

## Non-Negotiable Principles

1. **Design for prod from step 1.** Dev is a subset of prod, not the other way around. Every new code path has a prod counterpart in the same PR.
2. **Offload work from the server when the client can do it safely.** Never proxy data through the server if a signed URL, presigned token, or direct client↔provider connection works.
3. **Every external call has a timeout, retry with backoff, and an idempotency key** (for mutations). Unbounded calls are production incidents waiting to happen.
4. **Every long-running task is a background job**, not an inline HTTP request handler. Request handlers return <1s; anything else is async.
5. **Every mutation has an audit trail.** Who, what, when, before/after. At minimum: structured logs with correlation id.
6. **Fail closed on auth, fail open on cache.** Missing token → reject. Redis down → hit origin. Never the reverse.
7. **Every schema change is expand → backfill → contract.** Never a single destructive migration on a live table.

## Architectural Anti-Patterns (REJECT at plan + review)

These are patterns the planner should refuse to emit and the reviewer should flag as CRITICAL. Each has a why and the correct replacement.

### File upload / download

| Anti-pattern | Why bad | Correct pattern |
|---|---|---|
| Backend streams upload to S3 (`multipart` → server → `s3.upload`) | Doubles bandwidth, pegs server memory/CPU, breaks >5MB on free tiers, no resumable upload | **Presigned PUT URL**: backend issues short-lived presigned URL (scoped bucket+key+content-type+size), client uploads direct to S3, backend gets `PUT /files/confirm` with the returned ETag |
| Backend streams download from S3 to client | Same bandwidth waste, server becomes bottleneck | **Presigned GET URL** (short TTL), or CloudFront signed URL for cached assets |
| Storing uploaded files on local disk | Lost on container restart, doesn't scale horizontally | S3 / GCS / Azure Blob with lifecycle policy |
| No virus scan / content-type validation on upload | Malware vector, stored XSS via HTML upload | ClamAV lambda on S3 `ObjectCreated`, or reject by magic-byte check before presign |

### Email / notifications

| Anti-pattern | Why bad | Correct pattern |
|---|---|---|
| `await sendEmail()` inline in HTTP handler | SMTP latency (1-5s) blocks response, SMTP down = 5xx storm | Enqueue to SQS / BullMQ / Celery; worker sends with retry |
| SMTP credentials in code / `.env` committed | Credential leak, rotation impossible | AWS SES / SendGrid / Postmark with IAM role or secret manager |
| No bounce / complaint handling | Sender reputation tanks, future mails land in spam | SNS → bounce webhook → suppression list |
| Raw user input in email templates | HTML injection, phishing amplifier | Template engine with auto-escape + allowlist |

### Background jobs

| Anti-pattern | Why bad | Correct pattern |
|---|---|---|
| `setTimeout` / `setInterval` for scheduled work | Dies with process, no visibility, duplicates on scale-out | Cron job (K8s CronJob, EventBridge), or queue with delayed delivery |
| No idempotency key on retryable jobs | Duplicate side effects (double charge, double email) | Hash of (job type, entity id, occurrence) → dedupe table; worker skips if seen |
| Job failures swallowed | Silent data corruption | DLQ + alerting + max retry with exponential backoff |

### Database / queries

| Anti-pattern | Why bad | Correct pattern |
|---|---|---|
| N+1 query (`for user in users: load(user.orders)`) | 1000 users = 1001 queries, latency explodes | Eager load / `JOIN` / `IN (...)` batch; add test that asserts query count |
| Unbounded `SELECT *` in list endpoints | 10k-row pages OOM the client | Cursor pagination (keyset), column allowlist, max-limit guard |
| No index on frequently filtered column | Seq scan on every request | Add index in the same migration that introduces the filter |
| Raw SQL with string concat | SQL injection | Parameterized queries / ORM / prepared statements |
| Long transactions holding row locks | Contention cascades, deadlocks | Split: read outside tx, mutate inside, commit fast |
| Destructive migration on live table (`DROP COLUMN` in one step) | Old code reads missing column → 500s during deploy | Expand → backfill → contract over ≥2 deploys |

### API design

| Anti-pattern | Why bad | Correct pattern |
|---|---|---|
| Mutations on `GET` | Crawlers / prefetch trigger them, no CSRF protection | Use `POST` / `PUT` / `PATCH` / `DELETE` |
| Endpoint returns unbounded array | Page size grows, response times degrade | Always paginate; enforce max-limit |
| No rate limiting on public endpoints | Trivially DoS'd, abused for scraping | Token bucket per IP + per user |
| Exposing DB IDs (auto-increment int) as public URL | Leaks customer count, enables enumeration | UUID / ULID / nanoid |
| Stack traces in error responses | Leaks internals, secrets, code paths | Generic message to client, full detail to logs with correlation id |
| Synchronous long-poll without timeout | Clients hang, thread pool exhausted | Response within SLA; push updates via WebSocket / SSE / webhook |

### Auth / security

| Anti-pattern | Why bad | Correct pattern |
|---|---|---|
| JWT secret hardcoded / in repo | Tokens can be forged | Secret manager, rotated on schedule |
| Password stored plaintext or with MD5/SHA-1 | Breach = game over | bcrypt / argon2id with tuned cost |
| Missing auth on new endpoint ("it's internal") | Internal services get pwned | Auth on every endpoint by default; public is opt-in |
| CORS `*` on credentialed endpoint | CSRF / token exfil | Allowlist exact origins |
| Session cookie without `HttpOnly` / `Secure` / `SameSite` | XSS steals token trivially | All three flags, `SameSite=Lax` or `Strict` |
| Role check on frontend only | Bypassed with a crafted request | Enforce on server; frontend hides UI only |

### Caching / state

| Anti-pattern | Why bad | Correct pattern |
|---|---|---|
| In-memory cache on multi-replica service | Cache incoherent across pods, useless on scale-out | Redis / Memcached / CDN |
| No TTL / no invalidation strategy | Stale data forever | Pick one: TTL, write-through, or event-driven invalidation — document it |
| Caching user-specific data under global key | Cross-user data leak | Key includes user/tenant scope |

### Infrastructure

| Anti-pattern | Why bad | Correct pattern |
|---|---|---|
| Hardcoded environment values in source | Breaks on env promotion, credentials leak | Config layer + env vars + secret manager |
| Single-AZ deployment for prod | One AZ outage = full downtime | Multi-AZ with LB health checks |
| No health / readiness probes | K8s routes to dead pods | Liveness + readiness + startup probes |
| No resource limits on containers | One pod OOMs the node | `requests` + `limits` on CPU + memory |
| Running as root in container | Privilege escalation on escape | Non-root user, read-only FS, drop capabilities |
| `latest` tag in prod deploy | Silent drift, no rollback | Pinned digest / version tag |

### Observability

| Anti-pattern | Why bad | Correct pattern |
|---|---|---|
| `console.log` / `print` as the only logging | Unstructured, unsearchable, no correlation | Structured JSON logs with request id, user id, trace id |
| No metrics on new code path | Outage visible only from customer reports | Counter (requests), histogram (latency), gauge (in-flight) per endpoint |
| Errors silently swallowed | Bugs hide until support ticket | Sentry / equivalent, with breadcrumbs + release tag |
| No distributed tracing across services | Can't find root cause in a request chain | OpenTelemetry, propagate trace-id header |

## Production Checklist (per feature)

Before marking any feature done:

- [ ] All env-specific values come from config layer (no hardcoded URLs, buckets, keys)
- [ ] Secrets sourced from secret manager in prod (env var in dev is fine)
- [ ] External calls have timeout + retry + circuit breaker where applicable
- [ ] Mutations are idempotent or have idempotency keys
- [ ] Structured logs emitted at entry, exit, and error (with correlation id)
- [ ] Metrics emitted for new endpoint / job (count + latency + errors)
- [ ] Error reporting (Sentry / equivalent) captures unhandled errors
- [ ] Auth + authz enforced server-side; frontend UI is advisory only
- [ ] Input validated at boundary with schema (zod / pydantic / class-validator)
- [ ] Rate limiting on public endpoints
- [ ] Schema changes follow expand → backfill → contract
- [ ] Rollback plan documented for irreversible changes
- [ ] Health / readiness probes updated if new dependency added
- [ ] Resource limits set on new containers / jobs
- [ ] No dev-only code path without a prod counterpart in the same PR

## When to Defer Prod Concerns

**Default: never.** Production concerns are requirements, not polish.

**Only exception**: user explicitly asked for a throwaway spike ("just prototype locally to see if the approach works"). When this happens:
- Plan Overview must say "spike — not for prod" explicitly
- Risks & Mitigations section lists what was deferred
- PR description and commit message repeat the caveat
- Code is deleted or replaced before merge to main

No silent deferral. No "we'll harden later" without a named follow-up ticket.

---
name: production-patterns
description: Production-ready design patterns for common backend/frontend features — file upload, email, jobs, pagination, idempotency, caching, auth. Use when planning or reviewing any feature that touches these areas. Pairs with rules/common/production-readiness.md.
---

# Production Patterns — Correct Designs for Common Features

This skill holds concrete **wrong vs correct** designs for features that teams re-invent badly every project. When planning or reviewing one of these, reach for the correct pattern here — do not invent from scratch.

## When to Activate

- Planning a feature that touches: file I/O, email/SMS, long-running work, search, pagination, auth, caching, rate limiting
- Reviewing code for any of the above
- Refactoring away a known anti-pattern
- Before writing net-new infrastructure code

## Pattern 1: File Upload — Presigned URL, not server proxy

### Wrong — server proxies upload

```typescript
// ❌ Client POSTs file → server → S3. Server buffers full file in memory.
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async upload(@UploadedFile() file: Express.Multer.File) {
  const key = `uploads/${randomUUID()}-${file.originalname}`
  await this.s3.putObject({ Bucket: BUCKET, Key: key, Body: file.buffer })
  return { key }
}
```

Why bad: Doubles bandwidth (client → server → S3), pegs server memory on large files, hard request timeouts kill uploads >30s, no resume on network blip, no direct-to-S3 multipart.

### Correct — presigned PUT URL

```typescript
// Server: issue short-lived signed URL with strict constraints
@Post('uploads/presign')
async presign(@Body() dto: PresignDto, @CurrentUser() user: User) {
  await this.quota.assertCanUpload(user.id, dto.sizeBytes)

  const key = `users/${user.id}/${randomUUID()}-${sanitize(dto.filename)}`
  const url = await this.s3.getSignedUrl('putObject', {
    Bucket: BUCKET,
    Key: key,
    Expires: 300,                               // 5 min
    ContentType: dto.contentType,               // bind
    ContentLength: dto.sizeBytes,               // bind
    Conditions: [
      ['content-length-range', 1, MAX_UPLOAD],  // enforce size
      { 'x-amz-server-side-encryption': 'AES256' },
    ],
  })

  await this.uploads.create({ key, userId: user.id, status: 'pending' })
  return { url, key, expiresAt: Date.now() + 300_000 }
}

@Post('uploads/confirm')
async confirm(@Body() { key, etag }: ConfirmDto, @CurrentUser() user: User) {
  const head = await this.s3.headObject({ Bucket: BUCKET, Key: key })
  if (head.ETag !== etag) throw new BadRequestException('etag mismatch')
  if (head.ContentLength > MAX_UPLOAD) throw new BadRequestException('size')
  return this.uploads.markUploaded(key, user.id)
}
```

```typescript
// Client: PUT directly to S3, report ETag back
const { url, key } = await api.post('/uploads/presign', { filename, contentType, sizeBytes })
const res = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } })
const etag = res.headers.get('ETag')!.replace(/"/g, '')
await api.post('/uploads/confirm', { key, etag })
```

Add: ClamAV lambda on `s3:ObjectCreated:*` for AV scan; bucket policy denies public read; lifecycle rule expires pending uploads after 24h.

### For files >100MB — multipart

Use S3 multipart upload with per-part presigned URLs. Client uploads parts in parallel, calls `CompleteMultipartUpload` on server with the parts list.

---

## Pattern 2: Email — enqueue, don't await

### Wrong — inline send in request handler

```python
# ❌ User waits 2-5s for SMTP, gets 5xx when SES throttles
@router.post("/users")
async def create_user(dto: CreateUserDto):
    user = await users.create(dto)
    await send_welcome_email(user.email)  # blocks response
    return user
```

### Correct — enqueue to worker

```python
@router.post("/users")
async def create_user(dto: CreateUserDto):
    user = await users.create(dto)
    await mail_queue.enqueue(
        WelcomeEmail(user_id=user.id),
        idempotency_key=f"welcome:{user.id}",  # dedupe if retried
    )
    return user

# worker.py
@worker.task(max_retries=5, retry_backoff=True)
async def send_welcome_email(msg: WelcomeEmail):
    user = await users.get(msg.user_id)
    try:
        await ses.send(to=user.email, template="welcome", data={"name": user.name})
    except TransientSESError as e:
        raise Retry(e)  # exponential backoff
    except PermanentSESError as e:
        await suppressions.add(user.email, reason=str(e))
        # no retry
```

Handle SES bounce + complaint via SNS → webhook → suppression list. Never re-email a suppressed address.

---

## Pattern 3: Background jobs — idempotent, with DLQ

### Wrong — fire-and-forget setTimeout

```typescript
// ❌ Dies on deploy, duplicates on scale-out, no retry, no visibility
setTimeout(() => processReport(reportId), 60_000)
```

### Correct — queue with idempotency + DLQ

```typescript
// Enqueue with stable key — retries collapse to one execution
await queue.add('process-report', { reportId }, {
  jobId: `report:${reportId}`,                   // idempotency
  delay: 60_000,
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: false,                           // keep for DLQ inspection
})

// Worker
queue.process('process-report', async (job) => {
  const report = await reports.get(job.data.reportId)
  if (report.status === 'processed') return      // idempotent short-circuit

  await reports.update(report.id, { status: 'processing' })
  const result = await runReport(report)
  await reports.update(report.id, { status: 'processed', result })
})

queue.on('failed', (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    alerts.page('DLQ', { jobId: job.id, error: err.message })
  }
})
```

---

## Pattern 4: Pagination — cursor (keyset), not offset

### Wrong — offset pagination on large tables

```sql
-- ❌ OFFSET 100000 scans 100k rows then discards them. Gets slower as user paginates deeper.
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 100000;
```

Also: inconsistent results when rows are inserted between page loads (skips / duplicates).

### Correct — keyset cursor

```sql
-- Index: (created_at DESC, id DESC)
SELECT * FROM posts
WHERE (created_at, id) < ($cursor_created_at, $cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT 21;                                        -- fetch +1 to detect next page
```

```typescript
async listPosts({ cursor, limit = 20 }: ListDto) {
  const rows = await db.posts.findMany({
    where: cursor ? { OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ]} : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit)
  const nextCursor = hasMore
    ? encodeCursor({ createdAt: items.at(-1)!.createdAt, id: items.at(-1)!.id })
    : null
  return { items, nextCursor }
}
```

Cursor is opaque (base64-encoded) so clients can't forge it.

---

## Pattern 5: Idempotent mutations

### Wrong — no dedupe on network retry

```typescript
// ❌ Client retries on timeout → double charge
@Post('payments')
async charge(@Body() dto: ChargeDto) {
  return this.stripe.charge(dto)
}
```

### Correct — idempotency key header

```typescript
@Post('payments')
async charge(
  @Body() dto: ChargeDto,
  @Headers('Idempotency-Key') key: string,
) {
  if (!key) throw new BadRequestException('Idempotency-Key required')

  const existing = await this.idempotency.find(key)
  if (existing) return existing.response

  const result = await this.stripe.charge({
    ...dto,
    idempotencyKey: key,                         // stripe also dedupes
  })

  await this.idempotency.save(key, result, ttl: '24h')
  return result
}
```

Client generates UUID per logical operation, reuses it across retries.

---

## Pattern 6: Database N+1 → eager load

### Wrong

```python
# ❌ 1 query to load users, then 1 per user to load posts
users = await User.all()
for u in users:
    u.posts = await Post.filter(user_id=u.id)
```

### Correct

```python
# Single JOIN or IN-batch
users = await User.all().prefetch_related("posts")

# or explicit batch:
users = await User.all()
user_ids = [u.id for u in users]
posts = await Post.filter(user_id__in=user_ids)
by_user = groupby(posts, key=lambda p: p.user_id)
for u in users:
    u.posts = by_user.get(u.id, [])
```

Add a test that asserts query count (e.g., `assert_num_queries(2)`). CI catches regressions.

---

## Pattern 7: Rate limiting — token bucket per key

### Wrong — no limit, or in-memory counter

```typescript
// ❌ Multi-replica: each pod has its own counter. User gets N × replicas requests.
const counts = new Map<string, number>()
```

### Correct — Redis token bucket

```typescript
async allow(key: string, limit: number, windowSec: number): Promise<boolean> {
  const script = `
    local tokens = tonumber(redis.call('GET', KEYS[1]) or ARGV[1])
    if tokens <= 0 then return 0 end
    redis.call('SET', KEYS[1], tokens - 1, 'EX', ARGV[2])
    return 1
  `
  return (await redis.eval(script, 1, key, String(limit), String(windowSec))) === 1
}

// Middleware
const key = `rl:${req.user?.id ?? req.ip}:${req.route}`
if (!(await allow(key, 60, 60))) {
  res.setHeader('Retry-After', '60')
  throw new TooManyRequestsException()
}
```

---

## Pattern 8: Caching — bounded, scoped, invalidated

### Wrong

```typescript
// ❌ Global key leaks across users; no TTL; no invalidation on write
const cache = new Map()
async function getProfile(userId: string) {
  if (cache.has('profile')) return cache.get('profile')
  const p = await db.users.findUnique({ where: { id: userId } })
  cache.set('profile', p)
  return p
}
```

### Correct

```typescript
async function getProfile(userId: string) {
  const key = `profile:${userId}:v2`              // version in key for easy bust
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached)

  const profile = await db.users.findUnique({ where: { id: userId } })
  await redis.set(key, JSON.stringify(profile), 'EX', 300)
  return profile
}

// On write — invalidate or write-through
async function updateProfile(userId: string, dto: UpdateDto) {
  const profile = await db.users.update({ where: { id: userId }, data: dto })
  await redis.del(`profile:${userId}:v2`)
  return profile
}
```

Fail-open: on Redis error, hit DB directly — never 500 because cache is down.

---

## Pattern 9: Search — full-text / vector, not `LIKE '%q%'`

### Wrong

```sql
-- ❌ Seq scan, no relevance ranking, no typo tolerance
SELECT * FROM products WHERE name ILIKE '%' || $1 || '%';
```

### Correct

Small scale → PostgreSQL `tsvector` + `GIN` index:

```sql
ALTER TABLE products ADD COLUMN search tsvector
  GENERATED ALWAYS AS (to_tsvector('english', name || ' ' || description)) STORED;
CREATE INDEX idx_products_search ON products USING GIN(search);

SELECT *, ts_rank(search, query) AS rank
FROM products, plainto_tsquery('english', $1) query
WHERE search @@ query
ORDER BY rank DESC
LIMIT 20;
```

Larger scale → OpenSearch / Meilisearch / Typesense with sync via CDC (Debezium) or dual-write with outbox pattern.

Semantic search → pgvector / Pinecone with embeddings (OpenAI / Cohere / local model).

---

## Pattern 10: Auth on every endpoint

### Wrong

```python
# ❌ "Internal" endpoint with no auth — shipped to prod, found by shodan
@router.get("/admin/users")
async def list_users():
    return await users.all()
```

### Correct — deny-by-default, explicit opt-in for public

```python
# Global dependency rejects anonymous requests
app = FastAPI(dependencies=[Depends(require_auth)])

# Opt-in public routes
@router.get("/health", dependencies=[Depends(allow_anonymous)])
async def health(): ...

# Role-scoped routes
@router.get("/admin/users", dependencies=[Depends(require_role("admin"))])
async def list_users(): ...
```

Authorize at service layer too — don't trust the route-level check alone. Users should only see their own data unless role says otherwise.

---

## Pattern 11: Secrets — never in code, never in env file committed

### Wrong

```typescript
// ❌ In source
const STRIPE_KEY = 'sk_live_abc123...'

// ❌ In .env committed to repo
STRIPE_KEY=sk_live_abc123
```

### Correct

- Source reads from `process.env.STRIPE_KEY` / `os.environ["STRIPE_KEY"]`
- `.env.example` in repo documents required keys with placeholder values
- Prod loads from AWS Secrets Manager / SSM Parameter Store / K8s Secret / Vault
- Rotation: keys dated, old key honored for grace period, new key issued, old revoked
- On rotation, app receives SIGHUP or polls secret manager — no redeploy needed

---

## Pattern 12: Observability — structured logs + metrics + traces

### Wrong

```typescript
// ❌ Unstructured, no context, no correlation
console.log('user logged in: ' + userId)
```

### Correct

```typescript
// Structured JSON log with correlation fields
logger.info({
  event: 'user.login',
  userId,
  requestId: ctx.requestId,
  traceId: ctx.traceId,
  ip: req.ip,
  userAgent: req.get('user-agent'),
}, 'user logged in')

// Counter metric
metrics.increment('auth.login.success', { method: 'password' })

// Latency histogram around external calls
const timer = metrics.startTimer('stripe.charge.latency')
try {
  await stripe.charge(...)
  metrics.increment('stripe.charge.success')
} catch (e) {
  metrics.increment('stripe.charge.error', { code: e.code })
  throw e
} finally {
  timer.end()
}
```

Propagate trace id via `traceparent` header across service boundaries. Sentry captures unhandled exceptions with release tag.

---

## Pattern 13: Schema migration — expand → backfill → contract

### Wrong — one migration

```sql
-- ❌ Deployed with new code in same PR. Old pods read missing column during rollout = 500s.
ALTER TABLE users DROP COLUMN legacy_name;
```

### Correct — three deploys

```sql
-- Deploy 1 (expand): new column, nullable, keep old
ALTER TABLE users ADD COLUMN full_name text;

-- App code: dual-write (writes to both), reads from legacy_name with fallback
```

```sql
-- Deploy 2 (backfill): populate new column in batches
UPDATE users SET full_name = legacy_name WHERE full_name IS NULL AND id BETWEEN $1 AND $2;
-- Run in chunks to avoid long locks

-- App code: read from full_name, fall back to legacy_name
```

```sql
-- Deploy 3 (contract): drop old column
ALTER TABLE users DROP COLUMN legacy_name;
-- App code: full_name only
```

Non-negotiable for tables with prod traffic. Smaller tables in low-traffic windows may get away with one step — but plan it explicitly.

---

## Checklist When Using This Skill

Before planning or reviewing a feature in any of these areas:

- [ ] Identified the anti-pattern you're avoiding
- [ ] Picked the correct pattern from this skill
- [ ] Adapted it to the stack (no copy-paste across languages)
- [ ] Added observability (logs + metrics + errors) — not optional
- [ ] Added the prod safeguards (timeout, retry, idempotency, rate limit where applicable)
- [ ] Cross-referenced `rules/common/production-readiness.md` for the checklist

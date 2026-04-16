---
name: backend-patterns
description: Backend architecture patterns — repository pattern, service layer, caching (Redis/cache-aside), retry with exponential backoff, RBAC, background jobs, structured logging.
origin: smartclaude
---

# Backend Patterns

## Repository Pattern

```typescript
// Abstracts data access
interface UserRepository {
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  create(data: CreateUserDto): Promise<User>
  update(id: string, data: UpdateUserDto): Promise<User>
  delete(id: string): Promise<void>
}

class PostgresUserRepository implements UserRepository {
  async findById(id: string) {
    return db.query('SELECT * FROM users WHERE id = $1', [id])
  }
}
```

## Service Layer

```typescript
// Business logic, separated from HTTP/transport layer
class UserService {
  constructor(private repo: UserRepository, private cache: CacheService) {}

  async getUserById(id: string): Promise<User> {
    const cached = await this.cache.get(`user:${id}`)
    if (cached) return cached

    const user = await this.repo.findById(id)
    if (!user) throw new NotFoundError(`User ${id} not found`)

    await this.cache.set(`user:${id}`, user, { ttl: 300 })
    return user
  }
}
```

## Caching — Cache-Aside Pattern

```typescript
async function getWithCache<T>(key: string, fetcher: () => Promise<T>, ttl = 300): Promise<T> {
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached)

  const data = await fetcher()
  await redis.setex(key, ttl, JSON.stringify(data))
  return data
}

// Cache invalidation on write
async function updateUser(id: string, data: UpdateUserDto) {
  const user = await repo.update(id, data)
  await redis.del(`user:${id}`)  // Invalidate cache
  return user
}
```

## Retry with Exponential Backoff

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) throw error
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('Max retries exceeded')
}
```

## Role-Based Access Control (RBAC)

```typescript
const PERMISSIONS = {
  admin: ['read', 'write', 'delete', 'manage_users'],
  editor: ['read', 'write'],
  viewer: ['read'],
}

function hasPermission(user: User, action: string): boolean {
  return PERMISSIONS[user.role]?.includes(action) ?? false
}

// Middleware
function requirePermission(action: string) {
  return (req, res, next) => {
    if (!hasPermission(req.user, action)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}
```

## Background Jobs

```typescript
// BullMQ / Redis-based queue
const emailQueue = new Queue('email', { connection: redis })

// Producer
await emailQueue.add('send-welcome', { userId, email }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 50
})

// Consumer
const worker = new Worker('email', async (job) => {
  await sendEmail(job.data.email, 'Welcome!', templates.welcome)
}, { connection: redis })
```

## Structured Logging

```typescript
import pino from 'pino'
const logger = pino({ level: 'info' })

// Always include context
logger.info({ userId, action: 'login', ip: req.ip }, 'User logged in')
logger.error({ userId, error: err.message, stack: err.stack }, 'Login failed')

// Never log sensitive data
// ❌ logger.info({ password, apiKey }, 'Request received')
// ✅ logger.info({ userId, endpoint }, 'Request received')
```

## N+1 Query Prevention

```typescript
// ❌ BAD: N+1
const users = await db.users.findMany()
for (const user of users) {
  user.posts = await db.posts.findMany({ where: { userId: user.id } })
}

// ✅ GOOD: Single JOIN or batch fetch
const users = await db.users.findMany({
  include: { posts: true }  // Prisma eager loading
})
```

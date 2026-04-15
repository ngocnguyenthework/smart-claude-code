---
name: deployment-patterns
description: Deployment strategies (rolling/blue-green/canary), Docker multi-stage builds, GitHub Actions CI/CD pipeline, health checks, k8s probes, rollback, and production readiness checklist.
origin: smartclaude
---

# Deployment Patterns

## When to Use

- Setting up CI/CD pipelines or Dockerizing an application
- Choosing a deployment strategy (rolling, blue-green, canary)
- Implementing health checks and readiness probes
- Preparing for a production release

## Deployment Strategies

| Strategy | Zero Downtime | Instant Rollback | Infrastructure Cost |
|----------|--------------|-----------------|-------------------|
| Rolling | Yes | No | 1x |
| Blue-Green | Yes | Yes (swap back) | 2x |
| Canary | Yes | Yes (pull 5%) | 1x + % |

**Rolling** — replace instances gradually. Old and new run simultaneously → requires backward-compatible changes.

**Blue-Green** — run two identical envs; switch traffic atomically. Best for critical services with zero tolerance for issues.

**Canary** — route 5% → 50% → 100%. Catches issues before full rollout. Requires traffic splitting and monitoring.

## Docker Multi-Stage Builds

```dockerfile
# Node.js — 3 stage pattern
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --production

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001
USER appuser
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]
```

Docker best practices: specific version tags, non-root user, `.dockerignore` (node_modules, .git, .env), HEALTHCHECK, resource limits.

## GitHub Actions CI/CD

```yaml
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci && npm run lint && npm run typecheck && npm test -- --coverage

  build:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    environment: production
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploy ${{ github.sha }}"
      # kubectl set image deployment/app app=ghcr.io/...:${{ github.sha }}
```

Pipeline order: `PR: lint → typecheck → unit → integration → preview` | `Main: + build image → deploy staging → smoke tests → deploy prod`

## Health Check Endpoint

```typescript
app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.get('/health/detailed', async (req, res) => {
  const checks = { database: await checkDatabase(), redis: await checkRedis() }
  const allOk = Object.values(checks).every(c => c.status === 'ok')
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'ok' : 'degraded', checks })
})
```

Kubernetes probes: `livenessProbe` (interval: 30s, failureThreshold: 3), `readinessProbe` (interval: 10s), `startupProbe` (failureThreshold: 30 for slow starts).

## Config Validation (Fail Fast)

```typescript
import { z } from 'zod'

export const env = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3000),
}).parse(process.env)
```

## Rollback

```bash
kubectl rollout undo deployment/app    # K8s: previous image
vercel rollback                         # Vercel: previous deploy
npx prisma migrate resolve --rolled-back <migration>  # DB
```

## Production Readiness Checklist

- [ ] Tests pass (unit, integration, E2E)
- [ ] No hardcoded secrets; env vars validated at startup
- [ ] `/health` endpoint works
- [ ] Docker image uses pinned versions, non-root user
- [ ] Resource limits set (CPU, memory)
- [ ] Error rate alerts configured
- [ ] Structured JSON logging, no PII
- [ ] CORS, rate limiting, security headers (HSTS, CSP)
- [ ] Rollback plan documented and tested

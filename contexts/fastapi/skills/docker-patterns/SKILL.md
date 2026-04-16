---
name: docker-patterns
description: Docker Compose for local development, multi-stage Dockerfiles (dev vs prod stages), container networking, volume strategies, security hardening, and debugging commands.

---

# Docker Patterns

## When to Use

- Setting up Docker Compose for local development
- Reviewing Dockerfiles for security and size
- Troubleshooting container networking or volume issues

## Docker Compose — Standard Web App Stack

```yaml
services:
  app:
    build: { context: ., target: dev }
    ports: ["3000:3000"]
    volumes:
      - .:/app                      # bind mount for hot reload
      - /app/node_modules           # anonymous: protect container deps
    environment:
      - DATABASE_URL=postgres://postgres:postgres@db:5432/app_dev
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      db: { condition: service_healthy }

  db:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: app_dev }
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes: [redisdata:/data]

  mailpit:                           # local email testing
    image: axllent/mailpit
    ports: ["8025:8025", "1025:1025"]

volumes: { pgdata: {}, redisdata: {} }
```

## Dev vs Production Dockerfile

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS dev          # hot reload, debug tools
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --production

FROM node:22-alpine AS production   # minimal image
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001
USER appuser
COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY --from=build --chown=appuser:appgroup /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]
```

## Override Files

```yaml
# docker-compose.override.yml (auto-loaded, dev extras)
services:
  app:
    environment: [DEBUG=app:*, LOG_LEVEL=debug]
    ports: ["9229:9229"]  # Node.js debugger

# docker-compose.prod.yml
services:
  app:
    build: { target: production }
    restart: always
    deploy:
      resources:
        limits: { cpus: "1.0", memory: 512M }
```

```bash
docker compose up                                           # dev (auto-loads override)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d  # prod
```

## Networking

Services in the same Compose network resolve by service name: `postgres://db:5432/`, `redis://redis:6379/`.

```yaml
# Isolate services with custom networks
networks:
  frontend-net:
  backend-net:
services:
  db:
    networks: [backend-net]   # not reachable from frontend
  api:
    networks: [frontend-net, backend-net]
```

Bind to localhost only: `ports: ["127.0.0.1:5432:5432"]`

## Container Security

```yaml
services:
  app:
    security_opt: [no-new-privileges:true]
    read_only: true
    tmpfs: [/tmp, /app/.cache]
    cap_drop: [ALL]
    cap_add: [NET_BIND_SERVICE]  # only if binding port < 1024
```

Secret management: use `env_file: [.env]` (gitignored) or Docker secrets. Never hardcode in Dockerfile (`ENV API_KEY=...` bakes it into the image layer).

## .dockerignore

```
node_modules
.git
.env
.env.*
dist
coverage
*.log
.next
.cache
```

## Debugging Commands

```bash
docker compose logs -f app          # follow logs
docker compose exec app sh          # shell into container
docker compose exec db psql -U postgres  # postgres CLI
docker compose ps                   # running services
docker stats                        # resource usage
docker compose up --build           # rebuild on change
docker compose down -v              # DESTRUCTIVE: also removes volumes
```

## Anti-Patterns

- `:latest` tags — pin to exact versions for reproducible builds
- Running as root — always create and use non-root user
- Storing data without volumes — containers are ephemeral
- Secrets in `docker-compose.yml` — use `.env` files or Docker secrets
- One giant container — one process per container
- Docker Compose in production without orchestration — use K8s/ECS/Swarm

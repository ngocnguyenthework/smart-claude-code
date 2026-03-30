---
name: api-design
description: REST API design conventions — resource naming, status codes, pagination, filtering, authentication, rate limiting, versioning, error envelopes.
origin: smartclaude
---

# API Design Patterns

## Resource Naming

```
GET    /api/users              # List
GET    /api/users/:id          # Get one
POST   /api/users              # Create
PUT    /api/users/:id          # Full update
PATCH  /api/users/:id          # Partial update
DELETE /api/users/:id          # Delete

# Nested resources
GET /api/users/:id/posts
GET /api/users/:id/posts/:postId

# Filtering, sorting, pagination
GET /api/users?status=active&role=admin&limit=20&offset=0&sort=created_at:desc
```

## Response Envelope

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: { total: number; page: number; limit: number }
}

// Success
{ success: true, data: users, meta: { total: 100, page: 1, limit: 20 } }

// Error
{ success: false, error: 'Validation failed', details: [...] }
```

## Status Codes

| Code | Use |
|------|-----|
| 200 | OK — GET, PUT, PATCH success |
| 201 | Created — POST success |
| 204 | No Content — DELETE success |
| 400 | Bad Request — validation error |
| 401 | Unauthorized — missing/invalid auth |
| 403 | Forbidden — authenticated but no permission |
| 404 | Not Found |
| 409 | Conflict — duplicate resource |
| 422 | Unprocessable Entity — semantic validation error |
| 429 | Too Many Requests — rate limit hit |
| 500 | Internal Server Error |

## Pagination

**Offset-based** (simple, good for random access):
```
GET /api/posts?limit=20&offset=40
{ data: [...], meta: { total: 200, limit: 20, offset: 40, hasMore: true } }
```

**Cursor-based** (better for real-time data, no duplicates):
```
GET /api/posts?limit=20&cursor=eyJpZCI6MTAwfQ==
{ data: [...], meta: { nextCursor: "eyJpZCI6MTIwfQ==", hasMore: true } }
```

Use cursor-based for feeds, activity streams, large datasets.

## Authentication

```
Authorization: Bearer <jwt-token>

# API Key (server-to-server)
X-API-Key: <key>
```

## Rate Limiting Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
Retry-After: 60  # on 429
```

## Versioning

- URL path: `/api/v1/users` (most common, explicit)
- Header: `API-Version: 2024-01-01` (cleaner URLs)
- Avoid query params for versioning

## Input Validation

Always validate at the boundary with schema validation (Zod, Joi, Pydantic):

```typescript
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(['admin', 'user'])
})
```

## Error Response Format

```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

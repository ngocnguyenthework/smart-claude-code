---
paths:
  - "**/*.module.ts"
  - "**/*.controller.ts"
  - "**/*.service.ts"
  - "**/*.guard.ts"
  - "**/*.middleware.ts"
  - "**/main.ts"
---
# NestJS Security

> Extends [common/security.md](../common/security.md) with NestJS-specific security patterns.

## Authentication and Authorization

- Use `@UseGuards(AuthGuard)` on ALL non-public controllers/routes
- Implement role-based access with custom `@Roles()` decorator + `RolesGuard`
- Use Passport strategies (`passport-jwt`, `passport-local`) via `@nestjs/passport`
- Never expose internal IDs without ownership verification

```typescript
// CORRECT: Protected controller with role-based access
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  // All routes require JWT + ADMIN role
}

// Public route exception
@Public()
@Post('auth/login')
async login(@Body() dto: LoginDto) {}
```

## Input Validation

- Enable `ValidationPipe` globally with strict settings
- `whitelist: true` strips unknown properties
- `forbidNonWhitelisted: true` rejects unknown properties with 400
- Use `class-validator` on ALL DTOs — never trust raw request bodies

```typescript
// main.ts — MANDATORY
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
}));
```

## Helmet and CORS

- Always enable `helmet()` in production
- Configure CORS explicitly — never use `cors: true` in production

```typescript
// main.ts
import helmet from 'helmet';

app.use(helmet());
app.enableCors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
});
```

## Rate Limiting

- Use `@nestjs/throttler` on all public endpoints
- Apply stricter limits on auth endpoints (login, register, password reset)

```typescript
@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
  ],
})
export class AppModule {}

// Stricter on auth
@Throttle({ default: { limit: 5, ttl: 60000 } })
@Post('auth/login')
async login() {}
```

## Sensitive Data

- Use `@Exclude()` on entity fields that must never be serialized (passwords, tokens)
- Use `ClassSerializerInterceptor` globally to enforce serialization rules
- Never log passwords, tokens, or PII
- Use `ConfigService` for all secrets — never `process.env` directly in services

## SQL Injection Prevention

- Always use TypeORM QueryBuilder or Repository API with parameter binding
- Never concatenate user input into raw SQL

```typescript
// WRONG: SQL injection
const users = await this.repo.query(
  `SELECT * FROM users WHERE email = '${email}'`
);

// CORRECT: Parameterized query
const users = await this.repo
  .createQueryBuilder('user')
  .where('user.email = :email', { email })
  .getMany();
```

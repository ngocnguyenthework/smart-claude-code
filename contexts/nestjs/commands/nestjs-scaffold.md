---
description: Scaffold a NestJS module with controller, service, DTOs, entity, and test files
---

# NestJS Module Scaffold

## Steps

1. **Ask** for the module/domain name (e.g., `users`, `orders`, `payments`)

2. **Check** existing project structure:
   ```bash
   ls src/
   cat tsconfig.json
   cat package.json | grep -E "typeorm|prisma|@nestjs"
   ```

3. **Detect ORM** in use (TypeORM or Prisma) from dependencies

4. **Generate** the following files in `src/<module-name>/`:

   | File | Content |
   |------|---------|
   | `<name>.module.ts` | Module with imports, controllers, providers, exports |
   | `<name>.controller.ts` | CRUD endpoints with guards, validation, DTOs |
   | `<name>.service.ts` | Business logic with DI |
   | `<name>.repository.ts` | Data access layer (TypeORM or Prisma) |
   | `dto/create-<name>.dto.ts` | Create DTO with class-validator decorators |
   | `dto/update-<name>.dto.ts` | Update DTO extending PartialType(CreateDto) |
   | `dto/<name>-response.dto.ts` | Response DTO with @Exclude on sensitive fields |
   | `entities/<name>.entity.ts` | TypeORM entity OR Prisma schema addition |
   | `<name>.controller.spec.ts` | Controller unit tests |
   | `<name>.service.spec.ts` | Service unit tests with mocked repository |

5. **Wire** the new module into `AppModule` imports

6. **Verify** the scaffold compiles:
   ```bash
   npx tsc --noEmit
   npm run lint
   ```

## Conventions Applied
- Follow rules from `rules/nestjs/coding-style.md`
- Thin controllers, business logic in services
- Repository pattern for data access
- ValidationPipe with whitelist on all DTOs
- All endpoints guarded by default (mark public ones with @Public())

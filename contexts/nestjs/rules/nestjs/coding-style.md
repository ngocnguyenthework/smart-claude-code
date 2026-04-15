---
paths:
  - "**/*.module.ts"
  - "**/*.controller.ts"
  - "**/*.service.ts"
  - "**/*.dto.ts"
  - "**/*.guard.ts"
  - "**/*.pipe.ts"
  - "**/*.interceptor.ts"
  - "**/*.decorator.ts"
  - "**/*.resolver.ts"
  - "**/*.gateway.ts"
---
# NestJS Coding Style

> Extends [common/coding-style.md](../common/coding-style.md) and [typescript/coding-style.md](../common/coding-style.md) with NestJS-specific conventions.

## Module Organization

- One module per domain/feature (e.g., `users/`, `orders/`, `auth/`)
- Each module directory contains: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `entities/`, `*.spec.ts`
- Register all modules in `AppModule` imports
- Use `forRoot()` / `forRootAsync()` for configurable modules

```typescript
// CORRECT: One domain, one module
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
```

## Controllers

- Thin controllers — delegate all business logic to services
- Use decorators for routing, validation, auth
- Return DTOs, never raw entities

```typescript
// WRONG: Business logic in controller
@Post()
async create(@Body() dto: CreateUserDto) {
  const exists = await this.repo.findByEmail(dto.email);
  if (exists) throw new ConflictException();
  const hashed = await bcrypt.hash(dto.password, 10);
  return this.repo.save({ ...dto, password: hashed });
}

// CORRECT: Delegate to service
@Post()
@HttpCode(HttpStatus.CREATED)
async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
  return this.usersService.create(dto);
}
```

## Services and Dependency Injection

- Always use constructor injection with `private readonly`
- Mark all services with `@Injectable()`
- Use `@Inject()` for token-based or interface-based injection
- Default scope (singleton) unless request-scoped is required

```typescript
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly eventEmitter: EventEmitter2,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}
}
```

## DTOs and Validation

- Separate `CreateXDto`, `UpdateXDto`, `XResponseDto` per entity
- Use `class-validator` decorators for input validation
- Use `class-transformer` `@Exclude()` / `@Expose()` for serialization
- `UpdateXDto` should extend `PartialType(CreateXDto)`

```typescript
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UserResponseDto {
  id: string;
  email: string;
  name: string;

  @Exclude()
  password: string;
}
```

## Naming Conventions

- Files: `kebab-case` (e.g., `create-user.dto.ts`, `auth.guard.ts`)
- Classes: `PascalCase` with suffix (e.g., `UsersController`, `AuthGuard`, `CreateUserDto`)
- Methods: `camelCase` matching HTTP semantics (`findAll`, `findOne`, `create`, `update`, `remove`)
- Providers/tokens: `UPPER_SNAKE_CASE` for injection tokens

## Pipes and Interceptors

- Use `ValidationPipe` globally in `main.ts`
- Custom pipes for domain-specific transformations
- Interceptors for cross-cutting concerns (logging, caching, transformation)

```typescript
// main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
```

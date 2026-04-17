---
paths:
  - "**/*.module.ts"
  - "**/*.service.ts"
  - "**/*.controller.ts"
  - "**/*.repository.ts"
---
# NestJS Patterns

> Extends [common/patterns.md](../common/patterns.md) with NestJS-specific architectural patterns.

## Shared Base Inventory (CRITICAL)

See [common/patterns.md → Shared Base First](../common/patterns.md#shared-base-first-critical). Before creating any new class, grep `src/common/` / `src/shared/` first.

| Kind | File | Base |
|---|---|---|
| Entity | `common/entities/base.entity.ts` | `BaseEntity` (id, createdAt, updatedAt, deletedAt) |
| Repository | `common/repositories/base.repository.ts` | `BaseRepository<T>` (abstract) + `TypeOrmBaseRepository<T>` / `PrismaBaseRepository<T>` |
| Service | `common/services/base.service.ts` | `BaseCrudService<T>` — CRUD on top of `BaseRepository<T>` |
| DTO — list envelope | `common/dto/paginated.dto.ts` | `PaginatedDto<T>` (items, total, offset, limit) |
| DTO — mutation confirm | `common/dto/ok.dto.ts` | `OkDto { ok: true }` |
| DTO — query | `common/dto/pagination-query.dto.ts` | `PaginationQueryDto` (`@IsInt() limit/offset`) |
| DTO — error | `common/dto/error-response.dto.ts` | `ErrorResponseDto` matching Nest exception filter |
| Guard | `common/guards/` | `AuthGuard`, `RolesGuard`, `ApiKeyGuard` — shared, not per-module |
| Decorator | `common/decorators/` | `@CurrentUser()`, `@Public()`, `@Roles()` |
| Pipe | `common/pipes/` | `ParseIntPipe`, `ValidationPipe` configured globally |
| Interceptor | `common/interceptors/` | `TransformInterceptor` (wraps response), `LoggingInterceptor` |
| Exception filter | `common/filters/all-exceptions.filter.ts` | Single global filter |
| Config | `common/config/` | Typed `ConfigService` — no `process.env` in feature code |

### Rules

- **Controllers return `PaginatedDto<XResponseDto>`** for list endpoints — never `XListDto { items[], total }`.
- **Services extend `BaseCrudService<T>`** when CRUD — override only domain methods.
- **Repositories extend `BaseRepository<T>`** — new repo = 0 boilerplate, just type param.
- **DTOs extend base** — `XResponseDto extends BaseResponseDto` for `id/createdAt/updatedAt`.
- **Guards / interceptors / pipes in `common/`** — never duplicate auth logic per module.

## Repository Pattern

Abstract repository for swappable data access (TypeORM, Prisma, or test mock):

```typescript
// Abstract repository
export abstract class BaseRepository<T> {
  abstract findById(id: string): Promise<T | null>;
  abstract findAll(filter?: Partial<T>): Promise<T[]>;
  abstract create(data: Partial<T>): Promise<T>;
  abstract update(id: string, data: Partial<T>): Promise<T>;
  abstract delete(id: string): Promise<void>;
}

// TypeORM implementation
@Injectable()
export class UsersTypeOrmRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) { super(); }

  async findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }
  // ... other methods
}

// Register in module
@Module({
  providers: [
    { provide: BaseRepository, useClass: UsersTypeOrmRepository },
    UsersService,
  ],
})
export class UsersModule {}
```

## CQRS Pattern

For complex domains, separate reads from writes with `@nestjs/cqrs`:

```typescript
// Command
export class CreateOrderCommand {
  constructor(
    public readonly userId: string,
    public readonly items: OrderItemDto[],
  ) {}
}

// Command Handler
@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(private readonly ordersRepo: OrdersRepository) {}

  async execute(command: CreateOrderCommand): Promise<Order> {
    const order = await this.ordersRepo.create(command);
    return order;
  }
}

// Query
export class GetOrderQuery {
  constructor(public readonly orderId: string) {}
}
```

## Event-Driven Pattern

Use `EventEmitter2` for decoupled side effects:

```typescript
// Emit in service
@Injectable()
export class OrdersService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async create(dto: CreateOrderDto) {
    const order = await this.ordersRepo.save(dto);
    this.eventEmitter.emit('order.created', new OrderCreatedEvent(order));
    return order;
  }
}

// Listen in separate service
@Injectable()
export class NotificationsListener {
  @OnEvent('order.created')
  handleOrderCreated(event: OrderCreatedEvent) {
    // Send email, push notification, etc.
  }
}
```

## Microservice Patterns

For service-to-service communication:

```typescript
// TCP transport
@Module({
  imports: [
    ClientsModule.register([{
      name: 'ORDERS_SERVICE',
      transport: Transport.TCP,
      options: { host: 'localhost', port: 3001 },
    }]),
  ],
})
export class AppModule {}

// Message pattern
@MessagePattern({ cmd: 'get_order' })
async getOrder(@Payload() data: { id: string }) {
  return this.ordersService.findById(data.id);
}
```

## Configuration Pattern

Use `@nestjs/config` with validation:

```typescript
// config/database.config.ts
export default registerAs('database', () => ({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  name: process.env.DB_NAME,
}));

// Validate with Joi or class-validator in AppModule
ConfigModule.forRoot({
  validationSchema: Joi.object({
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().default(5432),
  }),
})
```

## Interceptor Patterns

- `LoggingInterceptor` — Log request/response timing
- `CacheInterceptor` — Cache GET responses
- `TransformInterceptor` — Wrap responses in standard envelope
- `TimeoutInterceptor` — Abort long-running requests

---
paths:
  - "**/*.spec.ts"
  - "**/*.e2e-spec.ts"
  - "**/*.module.ts"
  - "**/*.service.ts"
  - "**/*.controller.ts"
---
# NestJS Testing

> Extends [common/testing.md](../common/testing.md) with NestJS-specific testing patterns.

## Test Structure

- Unit tests: `*.spec.ts` colocated with source files
- E2E tests: `test/*.e2e-spec.ts` at project root
- Coverage target: 80%+ (branches, functions, lines)

## Unit Testing with TestingModule

```typescript
describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<UsersRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UsersRepository,
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            findByEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    repository = module.get(UsersRepository);
  });

  it('should create a user', async () => {
    repository.findByEmail.mockResolvedValue(null);
    repository.save.mockResolvedValue(mockUser);

    const result = await service.create(createUserDto);
    expect(result.email).toBe(createUserDto.email);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });
});
```

## Mocking Providers

- Use `useValue` for simple mocks (object with jest.fn())
- Use `useClass` for alternative implementations
- Use `useFactory` for dynamic/async mocks
- Mock only direct dependencies — not transitive ones

## E2E Testing with Supertest

```typescript
describe('UsersController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UsersRepository)
      .useValue(mockRepository)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('POST /users — creates user', () => {
    return request(app.getHttpServer())
      .post('/users')
      .send(createUserDto)
      .expect(201)
      .expect((res) => {
        expect(res.body.email).toBe(createUserDto.email);
        expect(res.body.password).toBeUndefined();
      });
  });

  it('POST /users — rejects invalid input', () => {
    return request(app.getHttpServer())
      .post('/users')
      .send({ email: 'not-an-email' })
      .expect(400);
  });
});
```

## What to Test

| Layer | Test Type | What to Verify |
|-------|-----------|----------------|
| Service | Unit | Business logic, error handling, edge cases |
| Controller | Unit | Route decorators, DTO validation, response mapping |
| Controller | E2E | Full request/response cycle, auth, status codes |
| Guard | Unit | Access control logic, role checks |
| Pipe | Unit | Transformation and validation behavior |
| Repository | Integration | Query correctness against real DB (test containers) |

## Database Testing

- Use test containers (`testcontainers` package) for integration tests
- Reset database state between tests (truncate or transaction rollback)
- Never share database state between test files

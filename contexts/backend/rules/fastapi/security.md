---
paths:
  - "**/*.py"
---
# FastAPI Security

> Extends [common/security.md](../common/security.md) with FastAPI-specific security patterns.

## Authentication

- Use `fastapi.security.OAuth2PasswordBearer` for JWT-based auth
- Hash passwords with `passlib[bcrypt]` or `argon2-cffi`
- Sign JWTs with `python-jose` or `PyJWT` — use RS256 for production
- Short-lived access tokens (15-30 min) + longer refresh tokens

```python
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["RS256"])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = await db.get(User, user_id)
    if user is None:
        raise credentials_exception
    return user
```

## Input Validation

- Pydantic validates all request bodies automatically
- Add `Field()` constraints for stricter validation
- Use `Path()`, `Query()` for path/query parameter validation
- Never trust raw request data — always go through Pydantic models

```python
@router.get("/users")
async def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    search: str = Query(default=None, max_length=255),
):
    ...
```

## CORS Configuration

- Never use `allow_origins=["*"]` in production
- Specify exact origins, methods, and headers

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,  # List of exact origins
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

## Rate Limiting

- Use `slowapi` for endpoint-level rate limiting
- Stricter limits on auth endpoints

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, dto: LoginSchema):
    ...
```

## SQL Injection Prevention

- Always use SQLAlchemy ORM or parameterized queries
- Never use f-strings or `.format()` in SQL

```python
# WRONG: SQL injection
result = await db.execute(text(f"SELECT * FROM users WHERE email = '{email}'"))

# CORRECT: Parameterized
result = await db.execute(
    select(User).where(User.email == email)
)

# CORRECT: Raw SQL with parameters
result = await db.execute(
    text("SELECT * FROM users WHERE email = :email"),
    {"email": email}
)
```

## Security Scanning

```bash
# Static analysis for security issues
bandit -r src/ -ll
# Dependency vulnerability check
pip-audit
# Type checking catches unsafe patterns
mypy src/
```

## Secrets Management

- Use `pydantic-settings` for environment-based configuration
- Never hardcode secrets in source
- Validate required secrets at startup

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SECRET_KEY: str
    DATABASE_URL: str
    ALLOWED_ORIGINS: list[str] = []

    model_config = {"env_file": ".env"}
```

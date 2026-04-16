---
paths:
  - "**/*.py"
---
# FastAPI Security

> Extends [common/security.md](../common/security.md). These rules match what this service actually does — API-key + external-JWT auth, no local user passwords.

## Authentication

Two auth dependencies coexist, plus a fallback:

- `verify_api_key` — server-to-server. `Authorization: Bearer <key>` with SHA256 hash lookup.
- `verify_openwebui_access_token` — end-user. Validates a JWT against the upstream OpenWebUI service.
- `verify_auth` — tries both, for endpoints reachable from either caller type.

**We do not hash user passwords locally.** No passlib, no bcrypt, no argon2 in this codebase — user auth is delegated to the upstream service.

```python
# utils/auth.py
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from repositories.api_key import api_key_repository

bearer_security = HTTPBearer(auto_error=False)

async def verify_api_key(
    request: Request,
    auth: HTTPAuthorizationCredentials | None = Depends(bearer_security),
) -> str:
    token = auth.credentials if auth else None
    if not token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Api key is missing")
    if not await api_key_repository.verify_key(token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="unauthenticated")
    return token
```

## API Key Storage

- Store **only the SHA256 hash** of the key in the DB — never plaintext.
- Return the plaintext key to the client **exactly once**, at creation time.
- For keys that must be decrypted later (rare — we avoid this where possible), use `cryptography.Fernet` with a key from settings.

```python
# utils/hash.py
import hashlib
from secrets import token_urlsafe
from cryptography.fernet import Fernet
from core.config import settings

def gen_sha256_string(input_str: str | None = None) -> str:
    data = input_str or token_urlsafe(16)
    return hashlib.sha256(data.encode()).hexdigest()

_fernet = Fernet(settings.FERNET_KEY.encode())

def encrypt_key(key: str) -> str:
    return _fernet.encrypt(key.encode()).decode()

def decrypt_key(encrypted: str) -> str:
    return _fernet.decrypt(encrypted.encode()).decode()
```

## Input Validation

- Every request body is a Pydantic model — never accept raw `dict`.
- Use `Annotated[type, Field(...)]` for constraints, and `Annotated[int, Path(gt=0)]` / `Annotated[int, Query(ge=0, le=100)]` for params (modern DI style, see `patterns.md`).
- Enum-typed fields in schemas reject unknown values automatically.
- `Field(strip_whitespace=False)` when input spacing matters (e.g., company names).
- For polymorphic payloads, use discriminated unions (`Field(discriminator="type")`) — faster and gives precise validation errors pointing at the bad variant.
- **Strict Content-Type (FastAPI 0.132+)**: JSON endpoints reject requests missing `Content-Type: application/json`. This is a security improvement (prevents content sniffing / CSRF via text/plain). Do not disable globally.

```python
@router.get("/users")
async def list_users(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, max_length=255),
    _: str = Depends(verify_api_key),
):
    ...
```

## CORS

Never `allow_origins=["*"]` with `allow_credentials=True` — browsers reject that combination anyway. We use `allow_origin_regex` generated from the `ALLOWED_DOMAINS` setting so subdomains and localhost:port variants work without listing every origin.

```python
# main.py
from common.constants.globals import CORS_ALLOWED_ORIGIN_REGEX

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=CORS_ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## SQL Injection

All queries go through SQLAlchemy 2.0 `select(...)` / ORM methods — parameters are bound automatically. If you must use `text()`, always use named bind parameters. **No f-strings in SQL, ever.**

```python
# WRONG
await db.execute(text(f"SELECT * FROM users WHERE email = '{email}'"))

# CORRECT — ORM
await db.execute(select(User).where(User.email == email, User.deleted_at.is_(None)))

# CORRECT — raw SQL with bind params
await db.execute(text("SELECT * FROM users WHERE email = :email"), {"email": email})
```

## Secrets Management

- All secrets come from environment via nested `BaseSettings` classes — never hardcode.
- `.env`, `.env.dev` loaded by `uvicorn` via `env_file=` in `launcher.py`.
- Never commit `.env*` files. `.env.example` lives in the repo with placeholder values.
- `DatabaseSettings`, `OpenWebUISettings` etc. fail fast at startup if required fields are missing.

## Rate Limiting

This service does **not** apply request-level rate limiting — it runs behind an API gateway and inherits the gateway's limits. Instead we track **usage quotas** (daily/monthly query counts) per-user and per-company via the `usage_counter` table and `UsageLimit` Pydantic model. When adding a quota-bearing endpoint, increment the counter inside the same transaction as the work it gates.

## Logging — Do Not Leak

- Never log full request bodies, tokens, API keys, or decrypted data.
- The request-logging middleware logs: method, path, status, client IP (X-Forwarded-For aware), duration. Add nothing more at this layer.
- On exception, the global handler logs `exc_info=True` — the stack trace is server-side only; the response is always `{"detail": "Internal Server Error"}`.

## Security Checks

```bash
uv run ruff check .              # lint (catches many bug classes)
uv run pip-audit                 # dependency CVEs
# bandit is NOT part of this project's toolchain — ruff's security rules (S*) cover what we need.
```

## Threat Model Notes

- The service sits behind a trusted gateway that terminates TLS and enforces gateway-level auth. We still validate every request at the app layer (defense in depth).
- `X-Forwarded-For` is trusted — treat the first hop as the client IP for logging only (never for auth).
- All DB writes go through repositories; no route touches the session directly, so soft-delete and audit timestamps cannot be bypassed accidentally.

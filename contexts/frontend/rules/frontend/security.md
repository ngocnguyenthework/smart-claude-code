---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.ts"
  - "**/middleware.ts"
---
# Frontend Security

> Extends [common/security.md](../common/security.md) with React/Next.js-specific security patterns.

## XSS Prevention

- React auto-escapes JSX expressions — `{userInput}` is safe
- **NEVER** use `dangerouslySetInnerHTML` with unsanitized user content
- If HTML rendering is needed, sanitize with `DOMPurify` first

```tsx
// WRONG: XSS vulnerability
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// CORRECT: Sanitize first
import DOMPurify from "dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />

// BEST: Avoid dangerouslySetInnerHTML entirely
<div>{userContent}</div>
```

## Input Validation

- Validate ALL form inputs with **Zod** schemas on BOTH client and server
- Never trust client-side validation alone — always validate in Server Actions / API routes

```tsx
// Shared validation schema
const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
});

// Server Action — validates server-side
"use server";
export async function createUser(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten() };
  // ...
}
```

## Authentication

- Use middleware for route protection (not client-side redirects)
- Store JWT in `httpOnly` cookies (not localStorage)
- Implement CSRF protection for Server Actions
- Use `next-auth` or similar for OAuth flows

```tsx
// middleware.ts — server-side route protection
export function middleware(request: NextRequest) {
  const session = request.cookies.get("session");
  if (!session && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
```

## Environment Variables

- Private secrets: **NO** `NEXT_PUBLIC_` prefix (server-only)
- Public keys only: `NEXT_PUBLIC_` prefix (exposed to browser)
- Never expose `DATABASE_URL`, `JWT_SECRET`, API secret keys to the client

## Content Security Policy

```tsx
// next.config.js
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];
```

## CORS for API Routes

```tsx
// In route handlers
export async function GET(request: NextRequest) {
  // Validate origin
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response("Forbidden", { status: 403 });
  }
  // ...
}
```

## Third-Party Script Safety

```tsx
// Use next/script for third-party scripts
import Script from "next/script";

<Script
  src="https://analytics.example.com/script.js"
  strategy="lazyOnload"  // Load after page is interactive
/>
```

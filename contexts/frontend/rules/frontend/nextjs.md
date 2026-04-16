---
paths:
  - "**/app/**/*.tsx"
  - "**/app/**/*.ts"
  - "**/next.config.*"
  - "**/middleware.ts"
---
# Next.js App Router Conventions

## App Router Fundamentals

- **Server Components by default** — no `"use client"` needed for data fetching
- **`"use client"` only** when: useState, useEffect, event handlers, browser APIs
- **File-based routing**: `app/dashboard/page.tsx` → `/dashboard`
- **Layouts**: `layout.tsx` wraps child pages, persists across navigation
- **Loading**: `loading.tsx` for Suspense boundaries
- **Error**: `error.tsx` for error boundaries

## Data Fetching

```tsx
// Server Component — direct data fetching (NO useEffect, NO useState)
export default async function UsersPage() {
  const users = await db.user.findMany(); // Direct DB call
  return <UserList users={users} />;
}

// With search params
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const { page = "1", search } = await searchParams;
  const users = await getUsers({ page: parseInt(page), search });
  return <UserList users={users} />;
}
```

## Route Handlers (API Routes)

```tsx
// app/api/users/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = searchParams.get("page") ?? "1";
  const users = await getUsers({ page: parseInt(page) });
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // Validate with Zod
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const user = await createUser(parsed.data);
  return NextResponse.json(user, { status: 201 });
}
```

## Server Actions

```tsx
// app/actions/users.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export async function createUser(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  await db.user.create({ data: parsed.data });
  revalidatePath("/users");
}
```

## Middleware

```tsx
// middleware.ts (root level)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Auth check
  const token = request.cookies.get("session")?.value;
  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
```

## Metadata and SEO

```tsx
// Static metadata
export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage your account",
};

// Dynamic metadata
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await getUser(params.id);
  return { title: user.name };
}
```

## Common Patterns

### Parallel Routes

```
app/
  @modal/
    (.)photo/[id]/page.tsx    # Intercepted route (modal)
  dashboard/
    @analytics/page.tsx       # Parallel slot
    @team/page.tsx             # Parallel slot
    layout.tsx                 # Renders both slots
    page.tsx
```

### Route Groups

```
app/
  (auth)/                     # Group: no URL segment
    login/page.tsx            # /login
    register/page.tsx         # /register
    layout.tsx                # Shared auth layout
  (dashboard)/
    overview/page.tsx         # /overview
    settings/page.tsx         # /settings
    layout.tsx                # Shared dashboard layout
```

## Anti-Patterns

```tsx
// WRONG: useEffect for data fetching in Server Components
"use client";
export default function UsersPage() {
  const [users, setUsers] = useState([]);
  useEffect(() => { fetch("/api/users").then(...) }, []);
}

// CORRECT: Server Component with direct fetch
export default async function UsersPage() {
  const users = await getUsers();
  return <UserList users={users} />;
}

// WRONG: Client-side fetch for initial data
// CORRECT: Server Component + pass as props to client component

// WRONG: Using `router.push` for form submissions
// CORRECT: Use Server Actions with revalidation
```

## Environment Variables

```
# Public (available in browser) — prefix with NEXT_PUBLIC_
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_STRIPE_KEY=pk_test_...

# Private (server only)
DATABASE_URL=postgres://...
JWT_SECRET=...
STRIPE_SECRET_KEY=sk_test_...
```

Never expose private env vars to the client. Next.js enforces this by requiring `NEXT_PUBLIC_` prefix.

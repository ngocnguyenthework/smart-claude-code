---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.ts"
---
# Frontend Patterns — React / Next.js

> Extends [common/patterns.md](../common/patterns.md) with React/Next.js-specific architectural patterns.

## Shared Base Inventory (CRITICAL)

See [common/patterns.md → Shared Base First](../common/patterns.md#shared-base-first-critical). Before creating any component / hook / util, grep `components/ui/`, `hooks/`, `lib/` first.

| Kind | Location | Base |
|---|---|---|
| UI primitive | `components/ui/` (shadcn) | `Button`, `Input`, `Select`, `Dialog`, `Table`, `Card` — never fork |
| Layout wrapper | `components/layout/` | `PageHeader`, `EmptyState`, `ErrorBoundary`, `LoadingState` |
| Data table | `components/data-table/` | `DataTable<T>` (columns, sort, pagination, row actions) — one impl, generic |
| Form field | `components/form/` | `FormField`, `FormError`, `FormLabel` — wrap RHF + shadcn once |
| Pagination | `components/pagination/` | `<Pagination />` driven by URL state (`nuqs`) |
| Hooks — data | `hooks/` | `usePaginatedQuery<T>`, `useDebouncedValue`, `useInfiniteList<T>` |
| Hooks — UI | `hooks/` | `useMediaQuery`, `useClickOutside`, `useCopyToClipboard` |
| API client | `lib/api/` | Single `fetcher`/`apiClient` — all fetch() go through it (auth, error, tracing) |
| Types — API | `types/api.ts` | `Paginated<T>`, `ApiResponse<T>`, `ApiError`, `Result<T,E>` |
| Types — domain | `types/` | shared across pages — never re-declare per page |
| Schemas | `lib/schemas/` | Zod schemas shared between forms + API boundary |
| Utils | `lib/utils/` | `cn`, `formatDate`, `formatCurrency`, `slugify` |

### Rules

- **List screens use `DataTable<T>` + `Paginated<T>` type** — never bespoke `<UserTable>` with hand-rolled pagination.
- **Forms use `FormField` wrapper** — never re-wire label+error+input per form.
- **All fetch through `lib/api/`** — never raw `fetch()` in components (no auth header drift, no scattered error handling).
- **Empty / error / loading states use shared components** — `<EmptyState title="No users" />` not bespoke divs.
- **Debounce / query-key / pagination logic in hooks** — never inline `useEffect(() => setTimeout(...))` per page.
- **Zod schema owns the type**: `type User = z.infer<typeof UserSchema>` — one source of truth for form + API.

## State Management Strategy

| Scope | Tool | When |
|-------|------|------|
| Component-local | `useState` | Simple UI state |
| Shared/form | React Hook Form + Zod | Form state, validation |
| Server state | `@tanstack/react-query` or Server Components | API data, caching |
| Global client | Zustand | Auth state, theme, UI preferences |
| URL state | `nuqs` or `searchParams` | Filters, pagination, tabs |

```tsx
// URL state for filters (persists on refresh, shareable)
import { useQueryState } from "nuqs";

export function UserFilters() {
  const [search, setSearch] = useQueryState("search", { defaultValue: "" });
  const [role, setRole] = useQueryState("role");
  // URL: /users?search=john&role=admin
}
```

## Data Fetching Patterns

### Server Components (Preferred for Initial Data)

```tsx
// app/users/page.tsx — Server Component
export default async function UsersPage() {
  const users = await getUsers();
  return <UserTable users={users} />;
}
```

### React Query (for Client-Side Interactivity)

```tsx
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function UserList() {
  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => fetch("/api/users").then(r => r.json()),
  });

  const queryClient = useQueryClient();
  const createUser = useMutation({
    mutationFn: (data: CreateUser) =>
      fetch("/api/users", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  if (isLoading) return <Skeleton className="h-64" />;
  return <UserTable users={users} onCreate={createUser.mutate} />;
}
```

## Layout Patterns

### Dashboard Layout

```tsx
// app/(dashboard)/layout.tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar className="hidden md:flex md:w-64 md:flex-col" />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

### Loading States with Suspense

```tsx
// app/users/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
```

### Error Boundaries

```tsx
// app/users/error.tsx
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 p-8">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
```

## Composition Patterns

### Compound Components

```tsx
// Components that work together
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content here</CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Render Props / Slots

```tsx
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  toolbar?: React.ReactNode;
  emptyState?: React.ReactNode;
}
```

### Provider Pattern

```tsx
// Wrap app in providers (app/layout.tsx)
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <QueryProvider>
            <Toaster />
            {children}
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

## Performance Patterns

- **`React.memo`** — Only for expensive components re-rendering with same props
- **`useMemo`** — Expensive computations (sorting, filtering large lists)
- **`useCallback`** — Stable function references for child component props
- **Dynamic imports** — Code-split heavy components

```tsx
// Dynamic import for heavy component
const Chart = dynamic(() => import("@/components/chart"), {
  loading: () => <Skeleton className="h-64" />,
  ssr: false,
});
```

## Optimistic Updates

```tsx
const deleteMutation = useMutation({
  mutationFn: deleteUser,
  onMutate: async (userId) => {
    await queryClient.cancelQueries({ queryKey: ["users"] });
    const previous = queryClient.getQueryData(["users"]);
    queryClient.setQueryData(["users"], (old: User[]) =>
      old.filter(u => u.id !== userId)
    );
    return { previous };
  },
  onError: (err, userId, context) => {
    queryClient.setQueryData(["users"], context?.previous);
    toast({ title: "Failed to delete", variant: "destructive" });
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
});
```

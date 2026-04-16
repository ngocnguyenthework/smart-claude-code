---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.ts"
  - "**/*.js"
  - "**/*.css"
---
# Frontend Coding Style — React / Next.js / Tailwind CSS / shadcn/ui

> Extends [common/coding-style.md](../common/coding-style.md) with React and Next.js specific conventions.

## Project Structure (Next.js App Router)

```
src/
  app/
    layout.tsx              # Root layout (providers, fonts, metadata)
    page.tsx                # Home page
    (auth)/
      login/page.tsx
      register/page.tsx
    dashboard/
      layout.tsx            # Dashboard layout (sidebar, nav)
      page.tsx
      settings/page.tsx
    api/
      users/route.ts        # Route handlers
  components/
    ui/                     # shadcn/ui components (DO NOT edit directly)
      button.tsx
      card.tsx
      dialog.tsx
    forms/                  # Form components
      user-form.tsx
    layouts/                # Layout components
      sidebar.tsx
      header.tsx
    [feature]/              # Feature-specific components
      user-card.tsx
      user-list.tsx
  lib/
    utils.ts                # cn() helper, formatters
    api.ts                  # API client functions
    validations.ts          # Zod schemas
  hooks/
    use-debounce.ts
    use-media-query.ts
  types/
    index.ts                # Shared TypeScript types
  styles/
    globals.css             # Tailwind directives + CSS variables
```

## Component Conventions

- **One component per file** — named export matching filename
- **PascalCase** for component files and names (`UserCard.tsx` exports `UserCard`)
- **kebab-case** for non-component files (`use-debounce.ts`, `api-client.ts`)
- **Colocate** related files: component, test, styles in same directory
- **Max 200 lines** per component — extract sub-components if larger

```tsx
// CORRECT: Small, focused component
export function UserCard({ user }: UserCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{user.name}</CardTitle>
        <CardDescription>{user.email}</CardDescription>
      </CardHeader>
    </Card>
  );
}

// WRONG: Monolithic component with inline logic, effects, and rendering
```

## React Patterns

### Server vs Client Components (Next.js App Router)

```tsx
// Server Component (default) — no "use client" directive
// Use for: data fetching, accessing backend resources, keeping secrets server-side
export default async function UsersPage() {
  const users = await getUsers(); // Direct DB/API call
  return <UserList users={users} />;
}

// Client Component — needs interactivity
"use client";
export function SearchBar({ onSearch }: SearchBarProps) {
  const [query, setQuery] = useState("");
  // Event handlers, state, effects, browser APIs
}
```

**Rule**: Default to Server Components. Only add `"use client"` when you need:
- `useState`, `useEffect`, `useReducer`
- Event handlers (`onClick`, `onChange`, etc.)
- Browser-only APIs (`window`, `localStorage`, `IntersectionObserver`)
- Third-party client libraries

### Props and Types

```tsx
// Define props interface above component
interface UserCardProps {
  user: User;
  onEdit?: (id: string) => void;
  className?: string;
}

// Destructure props, use defaults
export function UserCard({ user, onEdit, className }: UserCardProps) {
  return (
    <Card className={cn("w-full", className)}>
      {/* ... */}
    </Card>
  );
}
```

### Custom Hooks

Extract reusable logic into hooks:

```tsx
// hooks/use-users.ts
export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, []);

  return { users, isLoading, error };
}
```

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Component files | PascalCase | `UserCard.tsx` |
| Component names | PascalCase | `export function UserCard` |
| Hook files | kebab-case with `use-` prefix | `use-debounce.ts` |
| Hook names | camelCase with `use` prefix | `useDebounce` |
| Utility files | kebab-case | `format-date.ts` |
| Type files | kebab-case | `user-types.ts` |
| CSS variables | kebab-case | `--primary-foreground` |
| Tailwind classes | Utility-first | `className="flex items-center gap-2"` |

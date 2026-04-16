---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.css"
  - "**/tailwind.config.*"
  - "**/postcss.config.*"
---
# Tailwind CSS Conventions

## Core Principles

- **Utility-first**: Use Tailwind classes directly, avoid custom CSS unless necessary
- **Design tokens via CSS variables**: Define in `globals.css`, reference in `tailwind.config`
- **Use `cn()` helper**: For conditional/merged classes (from `lib/utils.ts`)
- **Responsive-first**: Mobile-first breakpoints (`sm:`, `md:`, `lg:`, `xl:`)

## Class Ordering

Follow a consistent order (Tailwind Prettier plugin enforces this):

```tsx
// Layout → Sizing → Spacing → Typography → Visual → Interactive
<div className="flex items-center justify-between w-full p-4 text-sm font-medium text-gray-900 bg-white rounded-lg shadow-sm hover:bg-gray-50 transition-colors" />
```

Install and configure `prettier-plugin-tailwindcss` for automatic class sorting.

## The `cn()` Helper

Use for conditional classes and merging with `tailwind-merge`:

```tsx
// lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Usage
<Button className={cn(
  "px-4 py-2",
  variant === "destructive" && "bg-red-500 text-white",
  disabled && "opacity-50 cursor-not-allowed",
  className, // Allow parent override
)} />
```

## Design Tokens with CSS Variables

```css
/* globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... dark mode tokens */
  }
}
```

## Responsive Design

Mobile-first approach:

```tsx
// Mobile: stack, Tablet: 2-col, Desktop: 3-col
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {items.map(item => <Card key={item.id} />)}
</div>

// Mobile: hidden sidebar, Desktop: visible
<aside className="hidden md:flex md:w-64 md:flex-col">
  <Sidebar />
</aside>
```

## Anti-Patterns

```tsx
// WRONG: Inline styles
<div style={{ display: 'flex', alignItems: 'center' }} />

// CORRECT: Tailwind utilities
<div className="flex items-center" />

// WRONG: @apply in CSS (defeats utility-first)
.card { @apply flex items-center p-4 bg-white rounded-lg; }

// CORRECT: Component with Tailwind classes
function Card({ children }) {
  return <div className="flex items-center p-4 bg-white rounded-lg">{children}</div>;
}

// WRONG: Arbitrary values everywhere
<div className="w-[347px] mt-[13px] text-[#1a2b3c]" />

// CORRECT: Use design tokens or standard scale
<div className="w-80 mt-3 text-gray-800" />
```

## Dark Mode

Use `dark:` variant with class-based strategy:

```tsx
<div className="bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-50">
  <p className="text-muted-foreground">Uses CSS variable, auto dark mode</p>
</div>
```

Prefer CSS variable-based tokens (shadcn/ui approach) over explicit `dark:` classes.

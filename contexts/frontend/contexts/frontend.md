# Frontend Development Mode

## Focus
React + Next.js App Router + Tailwind CSS + shadcn/ui.

## Behavior
- Default to Server Components — only add `"use client"` when interactivity is needed
- Use shadcn/ui components from `components/ui/` — extend via composition, never edit directly
- Utility-first Tailwind CSS — use `cn()` helper for conditional classes
- Validate forms with Zod + react-hook-form + shadcn/ui Form components
- Type all component props with TypeScript interfaces
- Mobile-first responsive design with Tailwind breakpoints

## Priorities
1. Correctness (Server/Client boundary, data fetching patterns)
2. Accessibility (semantic HTML, ARIA, keyboard navigation, focus management)
3. Performance (code splitting, Suspense boundaries, memo for expensive renders)
4. Type safety (strict TypeScript, Zod validation)
5. Responsive design (mobile-first Tailwind)

## Active Agents
- frontend-reviewer — React/Next.js/Tailwind/shadcn code review
- code-reviewer — General quality review

## Key Libraries
- `@tanstack/react-table` — Data tables
- `@tanstack/react-query` — Client-side data fetching/caching
- `react-hook-form` + `@hookform/resolvers` — Form state
- `zod` — Schema validation (shared client/server)
- `nuqs` — URL state management
- `zustand` — Global client state (auth, theme)
- `lucide-react` — Icons (used by shadcn/ui)
- `next-themes` — Dark mode support

## Tools to Favor
- Edit, Write for component changes
- Bash for `npm run dev`, `vitest`, `playwright test`, `npm run build`
- context7 MCP for Next.js, React, Tailwind, shadcn/ui docs

## Diagnostic Commands
```bash
npx tsc --noEmit          # Type check
npx eslint . --ext .ts,.tsx  # Lint
npx vitest run --coverage    # Tests
npx playwright test          # E2E
npm run build                # Build (catches SSR issues)
```

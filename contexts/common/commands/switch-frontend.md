---
description: Switch to frontend development mode — React + Next.js + Tailwind + shadcn/ui context
---

# Switch to Frontend Mode

Load the **frontend** context profile for React + Next.js + Tailwind CSS + shadcn/ui development.

## Active Context
- **Rules**: `rules/frontend/`, `rules/common/`
- **Agents**: frontend-reviewer, code-reviewer
- **Focus**: Server/Client Component boundary, accessibility, responsive design, type safety

## Behavior Adjustments
- Default to Server Components — only `"use client"` when interactivity is needed
- Use shadcn/ui components — extend via composition, never edit `components/ui/` directly
- Utility-first Tailwind — use `cn()` helper for conditional classes
- Forms: Zod + react-hook-form + shadcn/ui Form components
- Mobile-first responsive design

## Key Libraries
- shadcn/ui, Tailwind CSS, Radix UI primitives
- @tanstack/react-query, @tanstack/react-table
- react-hook-form + zod, nuqs
- Vitest + React Testing Library, Playwright

## Quick Commands Available
- `/switch-backend` — Switch back to backend mode
- `/switch-devops` — Switch to infrastructure mode

## Diagnostic Quick-Reference
```bash
npx tsc --noEmit          # Type check
npx eslint . --ext .ts,.tsx  # Lint
npx vitest run --coverage    # Tests
npm run build                # Build + SSR validation
```

# frontend — UI workflows

**React · Next.js (App Router) · Tailwind · shadcn/ui · Playwright E2E.**

**Companion docs in `.claude/docs/`:**
- `common-README.md` — universal workflows (planning, bug fix, review)
- `INTERNALS.md` — hook lifecycle, safety guardrails

---

## Setup

```bash
~/tools/smart-claude/install.sh --context frontend --dir ~/code/my-next-app
```

Prerequisites: Node 18+, your package manager (pnpm/npm/bun/yarn), and if you want the E2E flow: `@playwright/test` installed.

Shell alias:
```bash
alias claude-fe='claude --append-system-prompt "$(cat .claude/contexts/frontend.md 2>/dev/null)"'
```

---

## What this ships

| Folder | Contents |
|---|---|
| `agents/` | `frontend-reviewer`, `e2e-runner` |
| `commands/` | _(none — `/plan`, `/code-review` from `common` cover core flows)_ |
| `rules/frontend/` | `coding-style`, `patterns`, `security`, `testing` |
| `skills/` | `accessibility`, `frontend-patterns`, `nextjs-turbopack` |
| `contexts/frontend.md` | Session framing — load via `claude-fe` |
| `settings.json` | _(no additional hooks — `post-edit-format` from `common` covers JS/TS)_ |
| `mcp-servers.json` | `playwright`, `browserbase`, `browser-use`, `magic` |

---

## What the reviewer enforces

- **Server Components by default** — Client Components only when interactivity, browser APIs, or state hooks are genuinely needed.
- **`'use client'` at the top of the smallest subtree possible** — not at page-level unless the whole page is interactive.
- **No prop drilling past one or two levels** — lift state, use Context + Reducer, or reach for a store (Zustand / Jotai) when scale warrants.
- **Tailwind utility-first** — no CSS modules or styled-components unless there's a clear reason.
- **shadcn/ui components live in `components/ui/`** and are **edited in place** (they're copies, not a dependency).
- **Forms**: React Hook Form + Zod validator. Server Actions for mutations unless a REST API is already there.
- **Accessibility is not optional** — every interactive element needs a name, roles for custom controls, keyboard reachability, focus ring.
- **TypeScript strict** — no `any` at component boundaries; use `unknown` if truly unknown.

---

## Scenarios

### 1. New page / App Router route

**When:** adding a new route (e.g. `/orders/[id]`).

```
1. claude-fe
2. /plan "Order detail page: server-rendered, fetches order + items, shows a client-side status toggler."
3. Create app/orders/[id]/page.tsx (Server Component)
4. Extract interactive bits to app/orders/[id]/_components/StatusToggle.tsx ('use client')
5. Fetch data on the server (direct DB call or fetch to API)
6. loading.tsx for suspense boundary, error.tsx for error boundary
7. /code-review
```

**Effective prompt:**
```
/plan App Router page at app/orders/[id]/page.tsx.
- Server Component (uses server-side fetch to /api/orders/[id]).
- A <StatusToggle /> subtree is client (needs state + form submission).
- loading.tsx with a skeleton.
- error.tsx that logs to Sentry + shows a retry.
Don't add any new deps — use what's already installed.
```

**Pitfalls the reviewer flags:**
- `'use client'` at the top of page.tsx when only a button needs it.
- Fetching with client-side `useEffect` when it could be a Server Component.
- Missing loading/error boundaries (user sees a flash of nothing).

---

### 2. Server Component vs Client Component

**When:** you're unsure which to pick for a new component.

```
Decision tree:
  Uses useState/useEffect/useContext?         → Client
  Uses browser APIs (window, localStorage)?   → Client
  Event handlers (onClick, onSubmit)?         → Client
  Uses hooks from a library?                  → Client (unless they're .server variants)
  Otherwise                                    → Server (default)

Mixing rule:
  A Server Component can import and render a Client Component.
  A Client Component CANNOT import a Server Component — pass Server-rendered JSX via `children` or a prop.
```

**Effective prompt:**
```
Audit app/dashboard/page.tsx. Which subtrees are 'use client' unnecessarily?
Show the minimal refactor: push 'use client' down to the smallest boundary.
Don't change behaviour.
```

---

### 3. shadcn/ui install + extend

**When:** you need a new shadcn component (Dialog, Command, DataTable, etc.) or want to modify an existing one.

```
1. npx shadcn@latest add <component>
   → lands in components/ui/<component>.tsx (your code now)
2. Extend in place — these are copies, not a versioned package
3. For composed components (forms, data tables), create a wrapper in components/<feature>/
4. Tailwind utility classes only; no className prop bleed to consumers
5. Test keyboard nav + focus ring (a11y)
```

**Effective prompt:**
```
Install shadcn Dialog + extend:
- Add a <ConfirmDialog> wrapper that takes {title, description, onConfirm, variant: 'destructive' | 'default'}.
- Default focus on Cancel for destructive, Confirm otherwise.
- Trap focus, restore on close.
- Accessible name on the trigger.
```

---

### 4. Form with validation

**When:** any non-trivial form (login, settings, multi-step wizard).

```
Stack:
  - React Hook Form (useForm)
  - Zod schema + zodResolver
  - shadcn <Form> + <FormField> wrappers (if installed)
  - Server Action for submission (or API route if SSR isn't appropriate)

Pattern:
  1. Zod schema at the top (single source of truth)
  2. type FormValues = z.infer<typeof schema>
  3. useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: ... })
  4. Submit handler calls the Server Action
  5. Success: router.refresh() or redirect
  6. Error: setError at the field or form level
```

**Effective prompt:**
```
Build the Settings > Profile form.
Fields: name (1-100 chars), email (valid, disallow '+' for test accounts), bio (max 500).
Zod schema + react-hook-form + zodResolver.
Submit via a Server Action updateProfile(data). On success, toast + router.refresh().
Server-side errors land in form.setError('root', ...).
```

**Pitfalls:**
- Duplicating validation between Zod (client) and the server. **Reuse the schema** on both sides.
- Not handling `isSubmitting` — the button should disable.

---

### 5. Data fetching strategy

**When:** deciding how to get data into a component.

```
Decision tree:
  Static at build time (marketing pages)    → fetch in generateStaticParams / generateMetadata
  Server-rendered per request                → fetch in the Server Component
  Client-side, cache + revalidate            → SWR or TanStack Query
  Realtime (WebSocket / SSE)                 → dedicated client subscription
  User-specific, must be fresh               → Server Component with { cache: 'no-store' }

Cache hint:
  fetch(url, { next: { revalidate: 60 } })     // ISR-like
  fetch(url, { cache: 'no-store' })            // always fresh
  fetch(url)                                    // defaults to force-cache in Next
```

**Effective prompt:**
```
The /orders/[id] page needs real-time status (server pushes updates via SSE).
Current: Server Component + useEffect polling (bad).
Refactor to: Server Component for initial render (fresh data), then client subscribes to /api/orders/[id]/stream for updates.
State lives in a Client Component subtree; the shell stays server.
```

---

### 6. Accessibility audit

**When:** before shipping a user-facing feature, or after a refactor.

```
1. accessibility skill (auto-loaded by frontend context)
2. Self-check pass:
   a. Tab through the page — can I reach every interactive element?
   b. Screen reader names: does each control announce something useful?
   c. Heading hierarchy: one h1, no skipped levels
   d. Focus ring visible on keyboard focus
   e. Colour contrast (use axe-core or the Chrome dev tools audit)
   f. Forms: each input has a <label>; error messages linked via aria-describedby
3. /code-review  — reviewer has a11y in its checklist
```

**Effective prompt:**
```
Audit components/orders/OrderList.tsx for a11y.
Use the accessibility skill. Focus:
- Are the row actions reachable via keyboard?
- Does the status badge convey status via more than colour?
- Is the sort header announced as a button with state?
Report findings grouped by WCAG level (AA required, AAA nice-to-have).
```

---

### 7. E2E flow with Playwright

**When:** a new user-facing flow ships; or a bug should be reproduced at the browser level.

```
1. e2e-runner agent (pairs with playwright MCP)
2. Write the test as a user story:
   test('user can place an order', async ({ page }) => { ... })
3. Use role-based selectors: page.getByRole('button', { name: 'Checkout' })
4. Avoid CSS selectors; they're brittle
5. Assert on user-visible outcomes: role=heading, visible text, URL
6. Run: npx playwright test --project=chromium
7. On failure, the e2e-runner can triage and propose the fix
```

**Effective prompt:**
```
Ask the e2e-runner:
Write a Playwright flow: guest adds 2 items → checkout → fills card (test card 4242 4242 4242 4242) → confirms → sees thank-you page.
Use role-based selectors. Cover the happy path only.
Place under tests/e2e/checkout.spec.ts.
After writing, run it and triage any failure.
```

---

### 8. Performance optimization

**When:** Lighthouse / Core Web Vitals are red, or a page feels sluggish.

```
1. Measure first:
   - npm run build && npm start ; then Lighthouse on the prod build
   - next-bundle-analyzer for bundle size
   - React DevTools Profiler for render cost
2. Ranked fixes:
   a. Too much client code → push more to Server Components
   b. Large bundle → dynamic import heavy components (next/dynamic)
   c. Re-render storms → React.memo / useMemo / useCallback (only if profiled!)
   d. Images unoptimized → next/image with width + height
   e. Fonts blocking → next/font with display: 'swap'
3. Measure after — keep the delta
```

**Effective prompt:**
```
Lighthouse says LCP is 3.8s on /dashboard. Target <2.5s.
1. Profile: which subtree is the heaviest? (next-bundle-analyzer output attached)
2. Propose the 2-3 highest-leverage fixes in priority order.
3. For each, show the code change and the expected LCP delta.
Measure after shipping each fix — don't stack guesses.
```

**Pitfall:** reaching for `useMemo`/`useCallback` without profiling. The reviewer flags speculative memoization.

---

## Commands

Frontend uses the common-bundle commands:

- `/plan` — plan any page / feature
- `/code-review` — pre-PR review
- `/refactor-clean` — dead code cleanup
- `/build-fix` — when `next build` is red

For E2E flows, invoke the `e2e-runner` agent directly.

---

## Prompt patterns for this stack

### Pattern: push `'use client'` down

```
In <file>, 'use client' is at the top. Only the <X> subtree actually needs it.
Refactor so 'use client' moves to the smallest client boundary.
The server parts stay server. Don't change user-visible behaviour.
```

### Pattern: shadcn-aware component

```
Build <Component> using shadcn primitives (<Dialog>, <Button>, <Form>, etc.).
Edit the primitives in place if you need variations; don't wrap and re-style.
Keyboard + screen-reader must work out of the box.
```

### Pattern: accessible by construction

```
Build <Component>. A11y requirements:
  - Interactive elements reachable via Tab, in visual order
  - Custom controls have explicit role + aria-*
  - Focus ring visible (Tailwind focus-visible:ring-*)
  - Each form input has a <Label htmlFor=...>
```

### Pattern: measure before optimizing

```
Performance concern: <metric + target>.
Before proposing any change, measure with <tool> and show the current number.
Propose one change at a time, predict the delta, measure after.
```

### Anti-pattern (don't do this)

```
Make this faster   ← no metric, no target, no measurement
Add a nice button  ← no variant, no behaviour, no a11y contract
```

---

## MCP servers this context enables

| Server | When to use |
|---|---|
| `playwright` | E2E runs and DOM introspection from agents |
| `browserbase` | Cloud browser (remote sessions, testing without a local Chromium) |
| `browser-use` | AI-driven browser automation flows |
| `magic` | Quick component generation — drop a description, get a first-cut shadcn-compatible component |

Fill in API keys before enabling. These live in the merged `.mcp.json` at the project root.

---

## Auto-hooks for this context

Inherited from `common`:

1. `post-edit-format.js` — Biome or Prettier on JS/TS Edit/Write
2. `post-edit-typecheck.js` — `tsc --noEmit` on the edited file's project
3. `console.log` warning (doesn't block — remove before committing)

---

## Pair-with

- `frontend + nestjs` — full-stack TypeScript monorepo
- `frontend + fastapi` — full-stack (TS UI, Python API)
- `frontend + devops` — deploy targets (Vercel, CloudFront)
- `all` — mega-monorepo

---

## See also

- `common-README.md` — universal workflows
- `INTERNALS.md` — hook lifecycle, MCP cost accounting

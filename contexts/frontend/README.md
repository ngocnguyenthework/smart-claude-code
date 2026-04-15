# contexts/frontend

React / Next.js / Tailwind / shadcn/ui / E2E coverage. Add on top of `common`.

**Install:**

```bash
./install.sh --context frontend --dir ~/code/my-next-app
```

## Scenarios

- **You're reviewing a React PR.** `frontend-reviewer` checks the rendering model (server vs. client components in Next), hook dependency correctness, a11y, bundle bloat, and TypeScript discipline.
- **You're running E2E tests.** `e2e-runner` drives Playwright flows, triages failures, and explains the root cause. Pairs with the `playwright` MCP server (auto-included in this context).
- **You want a generated UI component.** The `magic` MCP server (Magic UI) is registered — you can ask the agent to draft a component and drop it into the codebase.
- **You want to probe a cloud browser.** The `browserbase` and `browser-use` MCP servers are registered for cloud-browser sessions (remote scraping, visual regression).

## What's inside

| Folder | Contents |
|--------|----------|
| `agents/` | `frontend-reviewer`, `e2e-runner` |
| `commands/` | _(none — `/plan`, `/code-review` from `common` cover the core flows)_ |
| `rules/frontend/` | coding-style, patterns, security, testing for React/Next |
| `skills/` | 4 frontend skills (Turbopack patterns, accessibility, etc.) |
| `contexts/frontend.md` | frontend session framing |
| `settings.json` | _(no additional hooks — `post-edit-format` from `common` handles JS/TS)_ |
| `mcp-servers.json` | `playwright`, `browserbase`, `browser-use`, `magic` |

## Pairs well with

- `--context frontend,backend` — for a full-stack Next.js + API monorepo
- `--context all` — for a mega-monorepo

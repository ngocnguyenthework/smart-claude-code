# Git Workflow

## Commit Message Format (CRITICAL)

Use **only** the one-line conventional-commit subject. **No body, no footer.**

```
<type>: <description>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Rules:
- Lowercase after the colon, no trailing period, keep under 72 chars
- Do **not** add a body, bullet list, or `Co-Authored-By` footer
- One commit = one logical change

## Push & PR Policy (CRITICAL)

- **Never run `git push`** — leave pushing to the user
- **Never create pull requests** (no `gh pr create`, no web UI)
- Staging (`git add`) and committing (`git commit`) are fine; stop there
- If the user explicitly asks to push or open a PR, confirm first, then proceed

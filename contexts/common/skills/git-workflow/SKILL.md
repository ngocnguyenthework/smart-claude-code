---
name: git-workflow
description: Git workflow patterns — branching strategies, conventional commits, merge vs rebase, conflict resolution, release management.

---

# Git Workflow Patterns

## Branching Strategies

| Strategy | Team Size | Release Cadence | Best For |
|----------|-----------|-----------------|----------|
| GitHub Flow | Any | Continuous | SaaS, web apps, startups |
| Trunk-Based | 5+ experienced | Multiple/day | High-velocity, feature flags |
| GitFlow | 10+ | Scheduled | Enterprise, regulated industries |

**GitHub Flow (recommended):** `main` is always deployable → feature branches → PR → merge → deploy.

## Conventional Commits

Use the one-line subject form only. **No body, no footer.**

```
<type>: <description>
```

Types: feat, fix, docs, style, refactor, test, chore, perf, ci, revert

**Good examples:**
```
feat: add OAuth2 login
fix: retry requests on 503 with exponential backoff
chore: update dependencies
```

**Bad examples:** `fixed stuff`, `updates`, `WIP`, or any multi-paragraph commit message.

Rules: lowercase after colon, no trailing period, max 72 chars, no body.

## Push & PR Policy

- **Never `git push`** — leave pushing to the user
- **Never create pull requests** (no `gh pr create`, no web UI)
- Only run push/PR commands when the user explicitly asks, and confirm first

## Merge vs Rebase

- **Merge**: preserves history, use for merging feature → main
- **Rebase**: linear history, use for updating local branch with latest main (never on shared branches)

```bash
# Update feature branch before PR
git fetch origin && git rebase origin/main
git push --force-with-lease origin feature/my-feature
```

## Conflict Resolution

```bash
git checkout --ours path/to/file    # Keep main version
git checkout --theirs path/to/file  # Keep feature version
git add path/to/file && git commit
```

Prevention: keep branches short-lived, rebase frequently, communicate about shared files.

## Branch Naming

```
feature/user-auth
fix/login-redirect-loop
hotfix/critical-security-patch
release/1.2.0
```

## Undoing Mistakes

```bash
git reset --soft HEAD~1      # Undo last commit, keep changes
git revert HEAD              # Undo last commit safely (for public branches)
git checkout HEAD -- file    # Undo file changes
git commit --amend --no-edit # Add forgotten file to last commit
```

## Anti-Patterns

- Committing directly to main
- Giant PRs (1000+ lines) — break into smaller focused PRs
- `git push --force origin main` — use `git revert` instead
- Long-lived feature branches (weeks/months)
- Committing `.env`, `dist/`, `node_modules/`

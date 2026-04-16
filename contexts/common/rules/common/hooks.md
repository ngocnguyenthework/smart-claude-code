# Hooks System

## Hook Types

- **PreToolUse**: Before tool execution (validation, blocking dangerous ops)
- **PostToolUse**: After tool execution (auto-format, type-check)
- **Stop**: When session ends (session state persistence)

## Stack-Specific Hooks

- Block `terraform apply` without plan review
- Block `kubectl apply/delete` on production
- Auto-format Python with ruff after edits
- Auto-format TypeScript with prettier after edits
- Type-check Python with pyright after edits
- Type-check TypeScript with tsc after edits

## Safety Rules

- Never use `--dangerously-skip-permissions` on untrusted code
- Never skip git hooks with `--no-verify`
- Configure `allowedTools` in `~/.claude.json` for auto-accept

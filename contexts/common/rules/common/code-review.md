# Code Review Standards

## When to Review

**MANDATORY review triggers:**
- After writing or modifying code
- Before any commit to shared branches
- When security-sensitive code is changed (auth, payments, user data, infrastructure)
- When architectural changes are made
- Before merging pull requests

## Review Checklist

Before marking code complete:
- [ ] Code is readable and well-named
- [ ] Functions are focused (<50 lines)
- [ ] Files are cohesive (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Errors are handled explicitly
- [ ] No hardcoded secrets or credentials
- [ ] No console.log or debug statements
- [ ] Tests exist for new functionality
- [ ] Test coverage meets 80% minimum
- [ ] Passes production-readiness checklist in [production-readiness.md](./production-readiness.md) — no architectural anti-patterns (server-proxied uploads, inline emails, N+1, offset pagination on large tables, missing idempotency, in-memory cache on multi-replica, etc.)

## Security Review Triggers

**STOP and use security-reviewer or infra-security-reviewer when:**
- Authentication or authorization code
- User input handling
- Database queries
- File system operations
- Infrastructure-as-Code changes (Terraform, K8s manifests)
- External API calls
- Payment or financial code

## Review Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| CRITICAL | Security vulnerability or data loss risk | **BLOCK** - Must fix before merge |
| HIGH | Bug or significant quality issue | **WARN** - Should fix before merge |
| MEDIUM | Maintainability concern | **INFO** - Consider fixing |
| LOW | Style or minor suggestion | **NOTE** - Optional |

## Agent Usage

See [agents.md](./agents.md) for reviewer agent table + routing rules.

## Approval Criteria

- **Approve**: No CRITICAL or HIGH issues
- **Warning**: Only HIGH issues (merge with caution)
- **Block**: CRITICAL issues found

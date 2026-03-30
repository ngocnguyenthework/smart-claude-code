---
name: blueprint
description: Turn a one-line objective into a multi-session construction plan with dependency graph, parallel step detection, anti-pattern catalog, and adversarial review gates.
origin: smartclaude
---

# Blueprint

Turn a one-line objective into a construction-ready multi-session plan.

## When to Use

- Starting a project or major feature from scratch
- Objective is EPIC or HIGH complexity
- Work will span multiple sessions or team members
- Need to identify parallelizable work upfront

## Blueprint Process

### 1. Objective Clarification
Restate the objective as a testable outcome:
- "Users can log in with email/password and persist sessions"
- NOT: "add auth"

### 2. Dependency Graph
Map all components and their dependencies:
```
[Database schema] → [Auth service] → [JWT middleware] → [Protected routes]
                  → [Email service] → [Password reset flow]
```

### 3. Phase Breakdown
Group work into independently deliverable phases:

```markdown
## Phase 1: Foundation (can deploy standalone)
- [x] Database schema
- [x] Core auth service
- [ ] Unit tests

## Phase 2: Core Experience (completes happy path)
- [ ] Login/register endpoints
- [ ] JWT issuance and validation
- [ ] Protected route middleware

## Phase 3: Edge Cases
- [ ] Password reset flow
- [ ] Session expiry handling
- [ ] Rate limiting on auth endpoints

## Phase 4: Hardening
- [ ] Audit logging
- [ ] Brute force protection
- [ ] Security review
```

### 4. Parallel Step Detection
Identify steps that can run in parallel:
- Database schema + Email templates (no dependency)
- Frontend components + Backend endpoints (interface-driven)
- Unit tests + Integration tests (different files)

### 5. Anti-Pattern Catalog
For each phase, list common mistakes:
- Auth: storing plain passwords, weak JWT secrets, missing HTTPS
- Database: missing indexes on foreign keys, no migration rollback plan
- API: missing rate limiting, no input validation

### 6. Adversarial Review Gates
Before advancing each phase:
- [ ] "How does this fail at 10x load?"
- [ ] "What happens if this service is unavailable?"
- [ ] "What's the attack surface we've created?"
- [ ] "Can we roll this back independently?"

## Output Format

```markdown
# Blueprint: [Objective]

**Outcome**: [Testable success criterion]
**Estimated Sessions**: N
**Parallelizable**: Yes/No

## Dependency Graph
[ASCII or mermaid diagram]

## Phases
[Phase breakdown with acceptance criteria per phase]

## Risks
[Top 3 risks with mitigations]

## Session 1 Starting Point
[Exact first task to begin with]
```

# Development Workflow

> Extends [git-workflow.md](./git-workflow.md) with the full feature development process.

## Feature Implementation Workflow

0. **Research & Reuse** _(mandatory before any new implementation)_
   - Search GitHub for existing implementations and patterns
   - Check library docs (use context7 MCP for framework-specific docs)
   - Search package registries before writing utility code
   - Prefer adopting proven approaches over writing net-new code

1. **Plan First**
   - Use **planner** or **aws-architect** agent for implementation plan
   - Identify dependencies and risks
   - Break down into phases
   - **Design for production on first pass** — see [production-readiness.md](./production-readiness.md) anti-pattern catalog and [skills/production-patterns/SKILL.md](../../skills/production-patterns/SKILL.md) for correct designs (presigned uploads, enqueued emails, cursor pagination, idempotency, etc.)

2. **TDD Approach**
   - Use **tdd-guide** agent
   - Write tests first (RED) → Implement (GREEN) → Refactor (IMPROVE)
   - Verify 80%+ coverage

3. **Code Review**
   - Use appropriate reviewer agent (nestjs-reviewer, fastapi-reviewer, terraform-reviewer, k8s-reviewer, frontend-reviewer, code-reviewer)
   - Address CRITICAL and HIGH issues before commit

4. **Commit & Push**
   - Conventional commits format
   - See [git-workflow.md](./git-workflow.md) for details

5. **Pre-Review Checks**
   - All CI/CD checks passing
   - Merge conflicts resolved
   - Branch up to date with target

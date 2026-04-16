---
description: Restate requirements, assess risks, and create step-by-step implementation plan. WAIT for user confirmation before touching any code.
---

# Plan Command

Invoke the **planner** agent to create a comprehensive implementation plan before writing any code.

## What This Command Does

1. **Restate Requirements** — Clarify what needs to be built
2. **Identify Risks** — Surface potential issues and blockers
3. **Create Step Plan** — Break down implementation into phases
4. **Wait for Confirmation** — MUST receive user approval before proceeding

## When to Use

Use `/plan` when:
- Starting a new feature
- Making significant architectural changes
- Working on complex refactoring
- Multiple files/components will be affected
- Requirements are unclear or ambiguous

## How It Works

The planner agent will:
1. Analyze the request and restate requirements in clear terms
2. Break down into phases with specific, actionable steps
3. Identify dependencies between components
4. Assess risks and potential blockers
5. Estimate complexity (High/Medium/Low)
6. Present the plan and **WAIT for your explicit confirmation**

## Important Notes

**CRITICAL**: The planner agent will **NOT** write any code until you explicitly confirm with "yes", "proceed", or similar.

If you want changes, respond with:
- "modify: [your changes]"
- "different approach: [alternative]"
- "skip phase 2 and do phase 3 first"

## Integration with Other Commands

After planning:
- Use `/build-fix` if build errors occur
- Use `/code-review` to review completed implementation
- Use `/checkpoint` to save state at each phase

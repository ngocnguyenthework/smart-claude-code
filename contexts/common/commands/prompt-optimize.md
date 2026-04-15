---
description: Analyze a draft prompt and output an optimized version ready to paste and run. Does NOT execute the task — outputs advisory analysis only.
---

# /prompt-optimize

Analyze and optimize the following prompt for clarity, precision, and efficiency.

## Your Task

Apply a 5-phase analysis to the user's input:

1. **Intent Detection** — Classify the task type (new feature, bug fix, refactor, research, testing, review, infrastructure)
2. **Scope Assessment** — Evaluate complexity: TRIVIAL / LOW / MEDIUM / HIGH / EPIC
3. **Component Matching** — Map to relevant skills, commands, agents, and model tier
4. **Missing Context Detection** — Identify gaps. If 3+ critical items missing, ask the user to clarify before generating
5. **Workflow & Model** — Determine lifecycle position, recommend model tier, split into multiple prompts if HIGH/EPIC

## Output Requirements

- Present diagnosis, recommended components, and an optimized prompt
- Provide both **Full Version** (detailed) and **Quick Version** (compact)
- The optimized prompt must be complete and ready to copy-paste into a new session
- End with a clear next step

## CRITICAL

Do NOT execute the user's task. Output ONLY the analysis and optimized prompt.

## User Input

$ARGUMENTS

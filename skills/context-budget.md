---
name: context-budget
description: Audits Claude Code context window consumption across agents, skills, MCP servers, and rules. Identifies bloat and produces prioritized token-savings recommendations.
origin: smartclaude
---

# Context Budget

Analyze token overhead across every loaded component and surface optimizations to reclaim context space.

## When to Use

- Session performance feels sluggish or output quality degrading
- You've added many skills, agents, or MCP servers recently
- Planning to add more components and need to check headroom
- Want to know how much context window you actually have

## How It Works

### Phase 1: Inventory — estimate token consumption

- **Agents**: count lines × 1.3 — flag files >200 lines
- **Skills**: count tokens per SKILL.md — flag files >400 lines
- **Rules**: count tokens per file — flag files >100 lines
- **MCP Servers**: ~500 tokens per tool — flag servers with >20 tools
- **CLAUDE.md**: flag combined total >300 lines

### Phase 2: Classify

| Bucket | Criteria | Action |
|--------|----------|--------|
| Always needed | Referenced in CLAUDE.md, backs active command | Keep |
| Sometimes needed | Domain-specific, not referenced in CLAUDE.md | On-demand |
| Rarely needed | No command reference, overlapping content | Remove or lazy-load |

### Phase 3: Report Format

```
Context Budget Report
═══════════════════════════════════════
Total estimated overhead: ~XX,XXX tokens
Effective available context: ~XXX,XXX tokens (XX%)

Component Breakdown:
│ Agents     │ N │ ~X,XXX tokens │
│ Skills     │ N │ ~X,XXX tokens │
│ Rules      │ N │ ~X,XXX tokens │
│ MCP tools  │ N │ ~XX,XXX tokens│

Top 3 Optimizations:
1. [action] → save ~X,XXX tokens
2. [action] → save ~X,XXX tokens
3. [action] → save ~X,XXX tokens
```

## Key Rules

- **MCP is the biggest lever**: each tool schema ~500 tokens; a 30-tool server costs more than all your skills combined
- **Agent descriptions load always**: even unincoked agents have their description in every Task context
- **CLI > MCP for simple wrappers**: replace GitHub/Vercel MCP with `/gh-pr` type commands to save ~5k-15k tokens
- Keep under 10 MCPs enabled, under 80 total active tools
- Audit after adding any agent, skill, or MCP server

---
name: deep-research
description: Multi-source web research using firecrawl and exa MCPs — 5-step workflow from goal clarification to cited report delivery. Use for competitive analysis, tech evaluation, due diligence, or any multi-source synthesis.
origin: smartclaude
---

# Deep Research

Produce thorough, cited research reports from multiple web sources.

## When to Use

- User asks to "research", "deep dive", "investigate", or "what's the current state of..."
- Competitive analysis, technology evaluation, market sizing
- Due diligence on companies, technologies, or approaches
- Any question requiring synthesis from multiple sources

## MCP Requirements

At least one of:
- **firecrawl**: `firecrawl_search`, `firecrawl_scrape`
- **exa**: `web_search_exa`, `web_search_advanced_exa`, `crawling_exa`

Both together give best coverage.

## Workflow

### Step 1: Clarify (1-2 questions max)
- "Goal — learning, making a decision, or writing something?"
- "Any specific angle?"

If user says "just research it" — skip ahead with reasonable defaults.

### Step 2: Plan Sub-Questions
Break topic into 3-5 research sub-questions:
```
Topic: "Impact of AI on healthcare"
→ What are the main applications today?
→ What clinical outcomes have been measured?
→ What are the regulatory challenges?
→ Who are the leading companies?
→ What's the market size/trajectory?
```

### Step 3: Multi-Source Search
For each sub-question, search with 2-3 keyword variations:

```
firecrawl_search(query: "<keywords>", limit: 8)
web_search_exa(query: "<keywords>", numResults: 8)
web_search_advanced_exa(query: "<keywords>", numResults: 5, startPublishedDate: "2025-01-01")
```

Target 15-30 unique sources. Prioritize: academic/official/reputable news > blogs > forums.

### Step 4: Deep-Read Key Sources
Fetch full content from 3-5 most promising URLs:
```
firecrawl_scrape(url: "<url>")
crawling_exa(url: "<url>", tokensNum: 5000)
```

Do not rely only on search snippets.

### Step 5: Synthesize Report

```markdown
# [Topic]: Research Report
*Generated: [date] | Sources: [N] | Confidence: High/Medium/Low*

## Executive Summary
[3-5 sentence overview]

## 1. [First Major Theme]
- Key point ([Source Name](url))
- Supporting data ([Source Name](url))

## Key Takeaways
- [Actionable insight 1]
- [Actionable insight 2]

## Sources
1. [Title](url) — one-line summary

## Methodology
Searched [N] queries, analyzed [M] sources.
```

**Delivery:** Short topics → post in chat. Long reports → executive summary in chat + save full report to file.

## Parallel Research (Broad Topics)

For large topics, launch 3 subagents in parallel:
- Agent 1: Sub-questions 1-2
- Agent 2: Sub-questions 3-4
- Agent 3: Sub-question 5 + cross-cutting themes

Each returns findings → main session synthesizes.

## Quality Rules

1. Every claim needs a source — no unsourced assertions
2. Cross-reference — single-source claims get flagged as unverified
3. Prefer sources from last 12 months
4. Acknowledge gaps explicitly
5. Separate fact from inference — label estimates and projections
6. No hallucination — "insufficient data found" is a valid answer

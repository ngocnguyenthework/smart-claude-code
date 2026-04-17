# Coding Style

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate existing ones:

```
// Pseudocode
WRONG:  modify(original, field, value) → changes original in-place
CORRECT: update(original, field, value) → returns new copy with change
```

Rationale: Immutable data prevents hidden side effects, makes debugging easier, and enables safe concurrency.

## File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large modules
- Organize by feature/domain, not by type

## Error Handling

ALWAYS handle errors comprehensively:
- Handle errors explicitly at every level
- Provide user-friendly error messages in UI-facing code
- Log detailed error context on the server side
- Never silently swallow errors

## Input Validation

ALWAYS validate at system boundaries:
- Validate all user input before processing
- Use schema-based validation where available
- Fail fast with clear error messages
- Never trust external data (API responses, user input, file content)

## Comments

PREFER SELF-EXPLANATORY CODE OVER COMMENTS:
- Clear names (functions, variables, types) beat comments — rename before you explain
- Write a comment only when the WHY is non-obvious (hidden constraint, subtle invariant, workaround for a known bug)
- Keep comments short, simple words, one line when possible — no paragraphs, no multi-line banners
- Do NOT restate WHAT the code does — well-named identifiers already say that
- Do NOT reference tasks, tickets, callers, or dates ("used by X", "added for Y", "fix for #123") — that belongs in the PR / commit, not the file
- Do NOT leave `// removed ...` / `// TODO: refactor later` tombstones — delete the code or open an issue
- Docstrings on public APIs: one short line describing purpose + non-obvious contract only
- If you feel the need to write a long comment, the function is doing too much — split it instead

## Function Design (CRITICAL — SOLID)

ONE FUNCTION = ONE TASK:
- Single Responsibility: each function does one thing, named for that thing
- Keep functions concise (<50 lines, ideally <20) — long functions hide bugs and resist reuse
- Extract branches/cases into named helpers instead of growing one function with many `if`/`switch` paths
- No flag parameters (`doX(mode)` with divergent behavior) — split into `doXFast` / `doXSafe`
- Depend on abstractions (interfaces, injected deps), not concretions — enables testing and swap-out
- Open for extension, closed for modification — add a new function/strategy rather than editing a stable one
- If a function needs a long comment, a big docstring, or the word "and" in its name — split it

Rationale: small single-task functions are reusable, testable in isolation, and readable without scrolling.

## Code Quality Checklist

Before marking work complete:
- [ ] Code is readable and well-named
- [ ] Functions do ONE task (SRP) and are small (<50 lines)
- [ ] No flag params / mixed responsibilities — long branches extracted into helpers
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No hardcoded values (use constants or config)
- [ ] No mutation (immutable patterns used)
- [ ] Comments are minimal and explain WHY, not WHAT

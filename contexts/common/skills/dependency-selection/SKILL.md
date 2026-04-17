---
name: dependency-selection
description: How to research, evaluate, and present library/package choices so the user can approve with full context. Pairs with rules/common/dependency-approval.md — the rule states the policy, this skill gives the workflow.
---

# Dependency Selection — Research, Compare, Ask

This skill is the executable companion to `rules/common/dependency-approval.md`. The rule forbids silently installing things; this skill describes *how to do the homework* so the approval gate is substantive, not ceremonial.

## When to Activate

- About to run `npm install X` / `pip install X` / any equivalent (see rule for the full list)
- User asked for a capability and you are considering "easiest: pull in a library"
- You just wrote >30 lines of custom code that smells like it duplicates a common library
- Planner is emitting a plan that introduces new packages — bake the comparison in before approval

## Workflow

```
┌─────────────────────────────────────────────────┐
│  0. CHECK EXISTING                              │
│     Grep manifest + lockfile for libs that      │
│     already cover the use case                  │
├─────────────────────────────────────────────────┤
│  1. STDLIB CHECK                                │
│     Can the runtime's standard library handle   │
│     this in <50 lines?                          │
├─────────────────────────────────────────────────┤
│  2. CANDIDATE DISCOVERY                         │
│     npm/PyPI/crates/Go search → top 3 matches   │
│     GitHub code search for real-world usage     │
├─────────────────────────────────────────────────┤
│  3. EVALUATE (rubric below)                     │
│     Score each candidate on 6 axes              │
├─────────────────────────────────────────────────┤
│  4. PRESENT + ASK                               │
│     Table of alternatives + recommendation +    │
│     AskUserQuestion gate                        │
├─────────────────────────────────────────────────┤
│  5. ON APPROVAL                                 │
│     Pin exact version · add manifest comment    │
│     record the decision in plan DISCUSSION.md   │
└─────────────────────────────────────────────────┘
```

## 0. Existing-Dep Check (never skip)

```bash
# Node
cat package.json | jq '.dependencies + .devDependencies'
grep -E '"<keyword>"' package-lock.json pnpm-lock.yaml yarn.lock

# Python
grep -E '^<keyword>' requirements*.txt pyproject.toml
uv pip list 2>/dev/null || pip list

# Go
grep -E '<keyword>' go.mod
```

Common "already there" cases:

| Need | Check for | Stdlib alternative |
|---|---|---|
| HTTP client | `axios`, `got`, `ky`, `node-fetch`, `httpx`, `requests` | `fetch` (Node 18+), `urllib.request` |
| UUID | `uuid`, `nanoid`, `ulid` | `crypto.randomUUID()` (Node 14.17+), `uuid` stdlib (Python) |
| Date format | `date-fns`, `dayjs`, `luxon`, `moment` | `Intl.DateTimeFormat`, `datetime.strftime` |
| Validation | `zod`, `yup`, `joi`, `class-validator`, `pydantic` | — (pydantic is stdlib-adjacent in FastAPI projects) |
| Slug / kebab-case | `slugify`, `lodash.kebabcase` | One-line regex |
| Deep clone | `lodash.clonedeep` | `structuredClone()` (Node 17+) |
| Debounce / throttle | `lodash.debounce`, `just-debounce-it` | 8-line function |
| State (React) | `zustand`, `jotai`, `redux`, `valtio` | `useState` + context for small cases |
| Data fetching (React) | `@tanstack/react-query`, `swr` | — (these *are* the correct answer; don't roll your own) |

Rule of thumb: if the problem can be solved in <50 lines of focused stdlib code **and** the team won't need to maintain edge cases (timezones, i18n, locale), skip the dep.

## 1. Stdlib First

Each runtime has grown a lot:

- **Node**: `fetch`, `crypto.randomUUID`, `structuredClone`, `Intl`, `URL`, `URLSearchParams`, `AbortController`, `EventTarget`, `node:test`
- **Python**: `pathlib`, `dataclasses`, `functools`, `itertools`, `contextlib`, `concurrent.futures`, `secrets`, `uuid`, `datetime`+`zoneinfo`
- **Go**: most of what you need is in stdlib (`net/http`, `context`, `encoding/json`, `sync`, `time`)
- **Rust**: fewer stdlib batteries — external crates are the norm

If stdlib covers 90% and you only need 10% more, consider inlining rather than pulling a library for that 10%.

## 2. Candidate Discovery

Parallel search — use the researcher pattern from `search-first` skill:

- **npm/PyPI/crates** — top 3 by downloads for the keyword
- **GitHub code search** — `"import <library>"` to see real-world adoption in projects with >100 stars
- **Context7 MCP** (`docs-lookup` agent) — fetch current docs to confirm API surface matches the need
- **Awesome lists** — `awesome-<ecosystem>` repos often curate quality alternatives

Stop at 3 candidates. More is analysis paralysis.

## 3. Evaluation Rubric (6 axes)

Score each candidate 1-5 per axis. Record the numbers in the ask.

| Axis | What to look at |
|---|---|
| **Fit** | Does its API match the shape of the problem? How much glue do you write? |
| **Maintenance** | Last release date · release cadence · open-vs-closed issue ratio · last commit |
| **Popularity** | Weekly downloads (npm/PyPI) · GitHub stars · major framework adoption |
| **License** | MIT / Apache-2.0 / BSD = safe · LGPL = caution · GPL/AGPL = reject for proprietary · SSPL/BUSL = read carefully |
| **Size** | Install size incl. transitives (`npm pack` dry-run / `pip show` / `cargo bloat`). Tree-shakeable? ESM-native? |
| **Security** | Known CVEs (`npm audit` / `pip-audit` / `cargo audit`) · maintainer count (bus factor) · typo-squat risk |

Fit + Security are weighted higher — a perfect-fit package with an unpatched critical CVE is still a reject.

## 4. Presentation Template

Use this shape in the conversation before calling `AskUserQuestion`:

```markdown
**Need:** <one sentence — the concrete capability>

**Already installed?** <yes/no — name any existing library that covers it>

**Stdlib-only feasible?** <yes/no — one-line rationale>

**Candidates evaluated:**

| Package | Version | License | Weekly DL | Last release | Size (w/ deps) | Transitives | CVEs (12mo) |
|---|---|---|---|---|---|---|---|
| `pkg-a` | 2.4.1 | MIT | 18M | 2 wk ago | 15 kB | 2 | 0 |
| `pkg-b` | 3.0.0 | Apache-2.0 | 11M | 3 mo ago | 72 kB | 8 | 1 (patched) |
| custom | — | — | — | — | ~40 LoC | 0 | — |

**Recommendation:** `pkg-a@2.4.1`. Smallest footprint, most actively maintained, API is a near-1:1 with our need.

**Trade-offs accepted:**
- Adds 2 transitive deps (both >10M weekly DL, no known CVEs)
- Tied to its plugin system — swapping later costs ~1 day

**Approval gate:** [AskUserQuestion follows]
```

Then call:

```
AskUserQuestion({
  question: "Add pkg-a@2.4.1 as a runtime dependency?",
  options: [
    "Approve — install pkg-a@2.4.1",
    "Use pkg-b instead (richer API, bigger footprint)",
    "Build custom (stdlib-only, ~40 LoC)",
    "Skip this capability for now",
  ],
})
```

## 5. Post-Approval Hygiene

- **Pin exact version** in the manifest (`"dayjs": "1.11.10"` — not `^1.11.10`). Bumps later go through a fresh review, not a silent `npm update`.
- **One-line manifest comment** if the package's purpose is not obvious from name alone. (Some manifests support comments — `package.json` via a `// ...` key is tolerated by most tooling but not standard; prefer a code comment at the import site if the manifest format is strict JSON.)
- **Record the decision** in the plan's `DISCUSSION.md` (if a plan exists): date, chosen package, alternatives considered, trade-off. This is how future-you remembers why `pkg-a` beat `pkg-b`.
- **Check license header** — add to `LICENSES-THIRD-PARTY.md` / attribution file if the project tracks that.

## Batching Approvals

One feature often needs several deps at once (runtime + types + test fixtures). Bundle them into a single ask:

```
**Feature:** JWT-based auth for the `/admin` API

**Proposed deps (batch):**
1. `jose@5.2.0` (runtime JWT library — MIT, 9M dl/wk)
2. `@types/jose` (TS types — dev-only)
3. `supertest@6.3.0` (dev — integration test client)

Recommendation: approve all three as a unit. Separate approvals would fragment the review.
```

Then a single `AskUserQuestion` with the batch.

## Anti-Patterns

- **Silent install** — running `npm install X` inside a Bash call with no approval step prior
- **Retroactive justification** — installing, then explaining after. Order matters: research → present → ask → install
- **Stacking alternatives** — when the user says no to `pkg-a`, offering `pkg-b` without a fresh comparison
- **Ignoring the existing-dep check** — installing a second library that overlaps with one already in the manifest
- **Hand-waving transitives** — "it has some dependencies" without counting them
- **"Industry standard"** — popularity ≠ fit. State the specific reason *this project* needs it.

## Integration Points

### With `/plan` orchestrator

The planner emits a `## Dependencies` section in `PLAN.md` listing every new dep the plan introduces, with the rubric scores inline. The orchestrator reads that section and gates approval **before** dispatching the implementer — implementers never install unapproved deps.

### With planner agent

During planning, if a step requires a new dep, the planner pauses its normal high-level-discovery batch to include the dep in the `AskUserQuestion` rather than writing a plan that assumes approval. If many deps are needed, the planner defers the detailed comparison to the implementer phase but lists the packages + one-line purpose in the plan so the user sees the footprint up front.

### With implementer agents

Implementers read `rules/common/dependency-approval.md` in their "Read First" step. If the plan's `## Dependencies` section is missing a package they find they need, the implementer stops and surfaces a fresh approval gate — never "I'll just add this quickly."

### With `search-first` skill

`search-first` is the broader sibling: it covers all research-before-coding (including MCP servers, existing skills, skeleton projects). `dependency-selection` is narrower: it's specifically the approval-gate workflow for adding a package to the dependency graph.

## Examples

### Example 1 — rejected: existing dep covers it

```
Need: URL-safe random IDs for invite tokens

Check: crypto.randomUUID() is in the stdlib. Project already imports crypto in 3 places.

Recommendation: use stdlib. No new dep, no approval needed.
```

### Example 2 — approved: clear winner

```
Need: PDF generation from HTML templates for invoices

Candidates:
| Package | Weekly DL | Size | License | Notes |
|---|---|---|---|---|
| puppeteer | 4M | 280MB (Chromium) | Apache-2.0 | Heavy, but real browser |
| pdf-lib | 900k | 1.2 MB | MIT | Pure-JS, no headless browser, no full CSS |
| wkhtmltopdf | (syscall) | — | LGPL | System binary, deployment pain |

Recommendation: puppeteer — invoices need real CSS rendering. Accept the image-size cost; already have a worker service that runs headless chrome.

[AskUserQuestion] Add puppeteer@22.4.0 to worker service?
```

### Example 3 — rejected outright (no approval surfaced)

```
Need: color-string parser
Candidate: "colorz" — 42 weekly DL, last release 2019-08, 1 maintainer, no tests.

Rejection reason: abandoned, unused. Not surfaced for approval.

Next step: either use `color` (5M dl/wk, active) or write 20 lines of stdlib parsing.
```

# Dependency Approval (CRITICAL)

> Never add a new library, package, framework, MCP server, Claude Code plugin, container image, system binary, or external service without an **explicit user approval gate**. "I think we need X" is not enough — explain, compare, and ask.

## Scope

This rule applies **before** any of the following:

- `npm install`, `pnpm add`, `yarn add`, `bun add`
- `pip install`, `poetry add`, `uv add`, `pipx install`, `conda install`
- `go get`, `go install`
- `cargo add`, `cargo install`
- `gem install`, `bundle add`
- `brew install`, `apt install`, `apk add`
- `helm repo add`, `helm install <chart>`, Helm chart `dependencies:` entry
- Terraform `required_providers`, Terraform module source change
- `FROM` line in a Dockerfile referencing a new base image
- Adding a new MCP server to `.mcp.json` / `mcp-servers.json`
- Adding a new external SaaS (Stripe, SendGrid, Datadog, etc.) that implies SDK + credentials
- Any hand-edit to `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, `Chart.yaml`, `composer.json`

It also applies to **auto-generated suggestions** — if you were about to recommend "just install X and do Y," stop and run the approval workflow instead.

## Non-Scope (no approval needed)

- Lockfile refreshes (`npm install` with no args, `poetry lock --no-update`) against already-approved deps
- Patch / minor version bumps of **already-approved** deps (still mention in commit; do not change majors silently)
- Dev-container / CI tool changes that don't land in the project's runtime dependency graph **and** that the user already delegated (e.g. "manage CI for me")
- Standard library imports — `fs`, `os`, `json`, `collections`, etc.

If uncertain whether something counts, treat it as in-scope and ask.

## The Approval Workflow

Before the install command runs, before the dependency line gets written, you MUST:

### 1. State the need

One sentence, concrete. What problem does this solve right now? No vague "for flexibility" or "industry standard."

### 2. List alternatives considered

At minimum three rows in a comparison:

1. **Standard library / built-in** — what it would take to do this without any new dep
2. **Existing project deps** — is something already installed that covers this (check `package.json` / `pyproject.toml` / `go.mod` before suggesting)
3. **The proposed new dep** — with its closest 1-2 competitors

For each, list: approximate maintenance status (last release date), weekly downloads or stars, license, install size incl. transitives, known CVEs in the last 12 months.

### 3. Recommend + justify

One paragraph. Why this one over the others. Name the trade-off you are accepting (e.g. "adds 12 transitive deps, but avoids 300 lines of custom parsing").

### 4. Ask with `AskUserQuestion`

Never assume approval. Surface the decision as a structured gate:

```
question: "Add <package> (<version>) as a dependency?"
options:
  - "Approve — install <package>"
  - "Pick different option — I'll name it"
  - "Build custom instead (no new dep)"
  - "Skip this capability for now"
```

**Batch** related decisions when possible (e.g. a single install touches runtime + types + test fixtures — ask once with all three listed).

### 5. After approval

- Pin the exact version you asked about (no `^` / `~` bumps later silently)
- Add one-line inline comment in the manifest file if the package name doesn't make its purpose obvious
- If the user rejects, do NOT add it later in the same session unless they revisit the decision

## What a Good Ask Looks Like

> I want to add a date-parsing capability for the `/reports` endpoint. I considered:
>
> | Option | Notes | Size |
> |---|---|---|
> | `Date`+ native `Intl` | ~40 lines of custom offset logic, brittle around DST | 0 |
> | `dayjs` (2.x, MIT, last release 2 weeks ago, 18M dl/wk, 0 known CVE) | Small, plugin-based, similar API to moment | 7 kB + 2 plugins ≈ 15 kB |
> | `luxon` (3.x, MIT, last release 3 months ago, 11M dl/wk) | Richer timezone handling, heavier | 72 kB |
>
> Recommendation: `dayjs@1.11.10` — our needs are parsing + formatting, no heavy timezone math. Smallest footprint, actively maintained.
>
> **[AskUserQuestion]** Add `dayjs@1.11.10` as a dependency?

## What a Bad Ask Looks Like (REJECT)

- "I'll install lodash real quick" → no alternatives, no justification, no ask
- "Let me pull in `uuid`" → `crypto.randomUUID()` has been in Node since 14.17; you skipped the stdlib check
- "Industry standard, let's use it" → not a reason
- Running `npm install <x>` inside a `Bash` call without any approval step prior

## Existing-Dep Reuse Check

Before the alternatives comparison, grep the lockfile + manifest for already-installed libs that cover the use case. Examples:

- Need HTTP client? → Check for `axios`, `got`, `ky`, `node-fetch`, `httpx`, `requests` before suggesting another
- Need validation? → Check for `zod`, `yup`, `joi`, `class-validator`, `pydantic`
- Need UUIDs? → `crypto.randomUUID()` (stdlib) before `uuid`
- Need dates? → Check for `date-fns`, `dayjs`, `luxon`, `moment`, `temporal-polyfill`
- Need state? → Check for `zustand`, `jotai`, `redux`, `@tanstack/react-query`, `swr`

Adding a second library that does what a first already does is a red flag — usually the right move is to use the existing one, not add a parallel.

## Transitive Dependency Scrutiny

A "small" package that pulls 40 transitives is not small. Before approval, check:

```
npm ls <package>        # or: pnpm why / yarn why
pip show <package>      # or: uv tree / pipdeptree
```

If a single package brings in >20 transitives, flag that in the ask. The user may prefer a smaller alternative even at the cost of more custom code.

## Security / Supply Chain Minimum

Reject outright (do not even surface for approval) if:

- Package has <100 weekly downloads AND <50 stars (proceed only if user explicitly asks for it)
- Last release >2 years ago on an actively-used ecosystem (npm/PyPI — Go/Rust are often stable)
- Known critical CVE in the current major with no fixed version
- Typo-squat candidate (name within 1-2 edits of a popular package)
- License incompatible with project (GPL in a proprietary codebase, etc.)

Surface the rejection to the user with the reason, not silently.

## Severity

| Level | Situation |
|---|---|
| **CRITICAL** | Adding runtime dep / container image / MCP / SaaS without approval gate |
| **HIGH** | Version-bumping a major without approval |
| **HIGH** | Suggesting a dep without the alternatives comparison |
| **MEDIUM** | Not pinning the exact version after approval |
| **MEDIUM** | Approved dep, but missing inline manifest comment when purpose is unclear |

CRITICAL violations block the commit. HIGH should be fixed before merge. MEDIUM is reviewer discretion.

## See Also

- `.claude/skills/dependency-selection/SKILL.md` — the full evaluation workflow, with rubric + presentation templates
- `.claude/skills/search-first/SKILL.md` — research-before-coding (broader scope — also covers MCP / skill alternatives)
- `.claude/rules/common/production-readiness.md` — why "just install X" often hides a production anti-pattern

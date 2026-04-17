# Dependency Approval (CRITICAL)

> Never add a library, package, framework, MCP server, plugin, container image, system binary, or external service without an **explicit user approval gate**. Full research workflow (live version lookup, comparison templates, transitive scrutiny, good/bad ask examples) lives in `skills/dependency-selection/SKILL.md` — load it when running the gate.

## Scope (approval required)

- Package installs: `npm|pnpm|yarn|bun add`, `pip|poetry|uv|pipx|conda install`, `go get|install`, `cargo add|install`, `gem install`, `bundle add`
- System installs: `brew install`, `apt install`, `apk add`
- Helm: `helm repo add`, `helm install <chart>`, chart `dependencies:` entry
- Terraform: `required_providers`, module source change
- Docker: new `FROM` base image
- MCP: new server in `.mcp.json` / `mcp-servers.json`
- SaaS: new external service with SDK + credentials (Stripe, SendGrid, Datadog, etc.)
- Manifest edits: `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, `Chart.yaml`, `composer.json`

Applies to auto-suggestions too — if about to recommend "just install X", stop and run the gate.

## Non-Scope

- Lockfile refreshes of already-approved deps
- Patch/minor version bumps of already-approved deps (mention in commit)
- Stdlib imports

Uncertain? Treat as in-scope and ask.

## The Gate (summary — details in skill)

1. **State need** — one concrete sentence
2. **List alternatives** — stdlib + existing project deps + proposed (with 1-2 competitors). Live-fetch versions/downloads/CVEs (never from memory)
3. **Recommend + justify** — name the trade-off accepted
4. **Ask via `AskUserQuestion`** — never assume approval
5. **After approval** — pin exact version; no silent major bumps

## Hard-Reject (do not even surface)

- <100 weekly downloads AND <50 stars (unless user asks explicitly)
- Last release >2 years ago on npm/PyPI
- Known critical CVE in current major, no fix
- Typo-squat candidate
- License incompatible with project

Surface rejection with reason, not silently.

## Severity

| Level | Situation |
|---|---|
| CRITICAL | Runtime dep / image / MCP / SaaS without gate |
| HIGH | Major version bump without approval; no alternatives comparison |
| MEDIUM | Missing exact-version pin; missing manifest inline comment |

## See Also

- `skills/dependency-selection/SKILL.md` — full evaluation workflow + rubric + templates
- `skills/search-first/SKILL.md` — research-before-coding (broader scope)
- `rules/common/production-readiness.md` — why "just install X" often hides prod anti-pattern

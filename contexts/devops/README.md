# contexts/devops

GitOps & IaC stack coverage: Terraform, Terragrunt, Kubernetes, ArgoCD, Helm, Kustomize, AWS. Add on top of `common`.

**Install:**

```bash
./install.sh --context devops --dir ~/code/infra
```

## Scenarios

- **You're reviewing a Terraform PR.** `/tf-plan-review` runs `terraform plan` and pipes the output to the `terraform-reviewer` agent for blast-radius / state-change gating.
- **You have a Terragrunt stack.** `terragrunt-reviewer` understands dependency graphs, `find_in_parent_folders`, stack/layer separation, and `prevent_destroy` policies. `/terragrunt-plan` runs `run-all plan` with review.
- **You're rolling out with ArgoCD.** `/argocd-audit` scans `Application` / `ApplicationSet` manifests for anti-patterns: auto-sync safety, sync waves, health checks, RBAC, PruneLast.
- **You're packaging with Helm.** `/helm-lint` runs `helm lint` + values schema validation. `helm-reviewer` audits chart structure, `values.yaml` hierarchy, `_helpers.tpl`, and secret handling.
- **You're overlaying with Kustomize.** `/kustomize-diff` renders and diffs overlays before apply. `kustomize-reviewer` checks base/overlay layout, strategic merges, components, and secret generators.
- **You're modifying AWS infra.** `aws-architect` (Opus) helps with VPC / IAM / compute design; `/aws-cost-check` flags unexpected cost drivers from recent Terraform changes.
- **You want a security pass.** `/infra-security-scan` runs `infra-security-reviewer` across the entire stack (secrets in state, public S3, open SGs, IAM over-permission).

## Guardrails (hooks)

Added on top of the `common` baseline:

- `PreToolUse (Bash)` — blocks `terraform apply` without explicit confirmation
- `PreToolUse (Bash)` — blocks `kubectl apply` / `delete` on prod contexts unless gated
- `PreToolUse (Bash)` — blocks `terragrunt run-all apply`
- `PreToolUse (Bash)` — warns on `argocd app sync` / `delete` for prod-tagged apps

## What's inside

| Folder | Contents |
|--------|----------|
| `agents/` | `terraform-reviewer`, `terragrunt-reviewer`, `k8s-reviewer`, `argocd-reviewer`, `helm-reviewer`, `kustomize-reviewer`, `aws-architect`, `infra-security-reviewer` |
| `commands/` | `/tf-plan-review`, `/terragrunt-plan`, `/argocd-audit`, `/helm-lint`, `/kustomize-diff`, `/k8s-audit`, `/aws-cost-check`, `/infra-security-scan` |
| `rules/` | `terraform`, `terragrunt`, `kubernetes`, `argocd`, `helm`, `kustomize`, `aws` — each with `coding-style.md`, `patterns.md`, `security.md`, `testing.md` |
| `skills/` | 2 DevOps skills |
| `contexts/devops.md` | DevOps session framing |
| `settings.json` | prod-safety guardrails (listed above) |
| `mcp-servers.json` | `vercel`, `railway`, `cloudflare-docs` |

## Pairs well with

- `--context devops,backend` — for a platform repo (infra + API)
- `--context all` — for a mega-monorepo

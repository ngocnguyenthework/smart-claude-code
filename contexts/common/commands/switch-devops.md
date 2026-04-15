---
description: Switch to DevOps/infrastructure mode — Terraform + Terragrunt + AWS + Kubernetes + Helm + Kustomize + ArgoCD (GitOps)
---

# Switch to DevOps Mode

Load the **devops** context profile for IaC and GitOps work.

## Active Context
- **Rules**: `rules/terraform/`, `rules/terragrunt/`, `rules/kubernetes/`, `rules/helm/`, `rules/kustomize/`, `rules/argocd/`, `rules/aws/`, `rules/common/`
- **Agents**: terraform-reviewer, terragrunt-reviewer, k8s-reviewer, helm-reviewer, kustomize-reviewer, argocd-reviewer, aws-architect, infra-security-reviewer
- **Focus**: Security-first, blast radius + sync radius awareness, cost optimization, state + rollout safety

## CRITICAL Guardrails
- **NEVER** `terraform apply` / `terragrunt apply` without reviewing plan output first
- **NEVER** `kubectl apply/delete` on production without confirmation
- **NEVER** enable ArgoCD auto-sync on production without rollback evidence
- **ALWAYS** run security scan before merging IaC changes
- **ALWAYS** render Helm/Kustomize + diff against main before merge
- **ALWAYS** check blast radius (count of affected resources) and sync radius (cluster/namespace scope)
- **FLAG** any IAM wildcard, any `sourceRepos: ['*']`, any `image.tag: latest`, any `spec.selector` change

## Quick Commands Available
- `/tf-plan-review` — Terraform plan + security review
- `/terragrunt-plan` — Terragrunt run-all plan with dependency + blast review
- `/helm-lint` — Helm chart lint + schema + rendered-diff
- `/kustomize-diff` — Kustomize overlay render + selector regression + secret scan
- `/argocd-audit` — ArgoCD Application / AppProject sync safety audit
- `/k8s-audit` — Raw Kubernetes manifest audit
- `/aws-cost-check` — Cost impact analysis
- `/infra-security-scan` — Full IaC security scan (checkov, tfsec, kube-linter)

## Diagnostic Quick-Reference
```bash
# Terraform
terraform fmt -check && terraform validate && tflint && checkov -d . --quiet

# Terragrunt
terragrunt hclfmt --terragrunt-check && terragrunt run-all validate --terragrunt-non-interactive

# Helm
helm lint . --strict && helm template . --values values-prod.yaml | kubeconform -strict

# Kustomize
kustomize build overlays/prod | kubeconform -strict

# ArgoCD
argocd app diff <name> && argocd app resources <name> --output json

# AWS cost
infracost breakdown --path .
```

## Stack Selection Hint
If the PR primarily touches:
- `*.tf` → terraform-reviewer
- `*.hcl` → terragrunt-reviewer
- `Chart.yaml` / `charts/**` → helm-reviewer
- `kustomization.yaml` / `overlays/**` → kustomize-reviewer
- `applications/**` / `applicationsets/**` → argocd-reviewer
- `manifests/**/*.yaml` (raw) → k8s-reviewer

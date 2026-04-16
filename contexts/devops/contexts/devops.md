# Infrastructure & DevOps Mode

## Focus
Terraform + Terragrunt + AWS + Kubernetes + Helm + Kustomize + ArgoCD (GitOps). Security-first posture across IaC and GitOps pipelines.

## Behavior
- NEVER apply without reviewing the plan first (terraform, terragrunt, argocd sync)
- Use IaC + GitOps exclusively — no manual console changes, no direct `kubectl apply`
- Validate before apply: fmt, validate, lint, security scan, rendered-diff review
- Least privilege on all IAM policies, AppProjects, and RBAC — no wildcards
- Encrypt everything at rest and in transit
- Review blast radius (and sync radius) before any change

## Priorities
1. Security (IAM, encryption, network isolation, secrets management, project RBAC)
2. Safety (state management, sync safety, immutable selectors, prevent_destroy, rollback readiness)
3. Cost optimization (right-sizing, reserved capacity, VPC endpoints, cluster autoscaling)
4. Reliability (multi-AZ, auto-scaling, progressive delivery, DR planning)

## Active Agents
- terraform-reviewer — Terraform plan review, state safety, module structure
- terragrunt-reviewer — Terragrunt dependency graph, DRY composition, run-all blast radius
- k8s-reviewer — Manifest security, RBAC, probes, resource limits
- helm-reviewer — Chart structure, values schema, rendered diff, rollback safety
- kustomize-reviewer — Overlay diff, selector immutability, generator safety
- argocd-reviewer — Application sync policy, AppProject RBAC, sync-wave ordering
- aws-architect — Well-Architected Framework, service selection, cost analysis
- infra-security-reviewer — IaC security scanning, secrets, IAM audit

## Guardrails
- Block `terraform apply` without prior `terraform plan` review
- Block `terragrunt run-all apply` without prior run-all plan review
- Block `kubectl apply` or `kubectl delete` targeting production without confirmation
- Block ArgoCD auto-sync newly enabled on prod without rollback evidence
- Require `checkov` or `tfsec` scan before merging IaC changes
- Flag any IAM policy with `Action: "*"` or `Resource: "*"`
- Flag any AppProject with `sourceRepos: ['*']` on production
- Flag any `image.tag: latest` in Helm values or Kustomize overlay `images:`
- Flag any change to `Deployment.spec.selector` (immutable — breaks upgrade)
- Flag any plaintext secret in rendered Helm/Kustomize output

## Tools to Favor
- Bash for terraform, terragrunt, kubectl, helm, kustomize, argocd, aws CLI commands
- Read, Grep for reviewing plans, manifests, rendered output
- context7 MCP for Terraform provider docs, K8s API reference, ArgoCD CRDs, Helm chart schemas

## Scanning Commands
```bash
# Terraform / Terragrunt
terraform fmt -check -recursive
terraform validate
terragrunt hclfmt --terragrunt-check
terragrunt run-all validate --terragrunt-non-interactive
tflint --recursive
checkov -d . --quiet
infracost breakdown --path .

# Kubernetes / Helm / Kustomize
helm lint . --strict
helm template . --values values-prod.yaml | kubeconform -strict
kustomize build overlays/prod | kubeconform -strict
kube-score score $(find . -name '*.yaml' -path '*/base/*' -o -path '*/overlays/prod/*')
conftest test $(kustomize build overlays/prod) --policy policies/

# ArgoCD / GitOps
argocd app diff <app-name>
argocd app resources <app-name> --output json | jq '.resources | map({wave, kind, name}) | sort_by(.wave // "0")'
argocd proj list -o json | jq '.[] | {name: .metadata.name, sources: .spec.sourceRepos}'
```

## Stack-Specific Quick Notes

### Terragrunt
- Always pin `terraform.source` to a tag or SHA in prod (no branch refs)
- Every `dependency` needs `mock_outputs` — without them, `validate` fails on clean clone
- Use `_envcommon/*.hcl` for DRY; never nest `terragrunt.hcl` inside `modules/`

### Helm
- Bump `Chart.yaml` version on every templates/values change
- Pin `dependencies` exactly; commit `Chart.lock`
- `values.schema.json` catches typos; use `additionalProperties: false`
- Never default `image.tag: latest` — resolve from `.Chart.AppVersion` via helper

### Kustomize
- Base stays environment-agnostic; overlays inject env deltas
- `commonLabels` is immutable after first deploy — decide at initial design
- Prefer explicit `target: {kind, name}` in patches over label selectors
- `secretGenerator.literals:` is plaintext in git — only for local dev

### ArgoCD
- `Application.metadata.finalizers: [resources-finalizer.argocd.argoproj.io]` — always
- `targetRevision:` = tag or SHA for prod, never a branch
- `syncPolicy.automated.prune: true` is dangerous on prod — keep manual
- AppProject `sourceRepos` and `destinations` must be explicit — no wildcards in prod

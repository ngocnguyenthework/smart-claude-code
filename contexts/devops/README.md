# devops — infrastructure workflows

GitOps + IaC coverage: **Terraform · Terragrunt · Kubernetes · ArgoCD · Helm · Kustomize · AWS.**

**Companion docs in `.claude/docs/`:**
- `common-README.md` — universal workflows (planning, review, prompt patterns)
- `INTERNALS.md` — hook lifecycle, safety guardrails

---

## Setup

```bash
~/tools/smart-claude/install.sh --context devops --dir ~/code/infra
```

Prerequisites: `terraform`, `terragrunt`, `kubectl`, `helm`, `kustomize`, `argocd`, `aws`, `infracost` (for `/aws-cost-check`), `checkov` or `trivy` (for security scans).

Shell alias:
```bash
alias claude-ops='claude --append-system-prompt "$(cat .claude/contexts/devops.md 2>/dev/null)"'
```

---

## What this ships

| Folder | Contents |
|---|---|
| `agents/` | 8 reviewers: `terraform-reviewer`, `terragrunt-reviewer`, `k8s-reviewer`, `argocd-reviewer`, `helm-reviewer`, `kustomize-reviewer`, `aws-architect`, `infra-security-reviewer` |
| `commands/` | 8 commands (see below) |
| `rules/` | per-tool rule bundles: `terraform/`, `terragrunt/`, `kubernetes/`, `argocd/`, `helm/`, `kustomize/`, `aws/` |
| `skills/` | `deployment-patterns`, `docker-patterns` |
| `contexts/devops.md` | Session framing — load via `claude-ops` |
| `settings.json` | prod-safety PreToolUse hooks (see below) |
| `mcp-servers.json` | `vercel`, `railway`, `cloudflare-docs` |

---

## Guardrails (added on top of common)

| Trigger | Action |
|---|---|
| `terraform apply` without prior plan | **Block** |
| `terragrunt run-all apply` | **Block** |
| `kubectl apply\|delete` to a prod context | **Block** unless env-var gate set |
| `argocd app sync\|delete` for prod-tagged apps | **Warn** |

These fire in the `PreToolUse` Bash hook. Disable per session: `SC_DISABLED_HOOKS=devops-tf-guard claude-ops`.

---

## Scenarios

### 1. New Terraform module

**When:** adding or significantly extending a module (VPC, EKS cluster, RDS instance).

```
1. claude-ops
2. /plan "Add Terraform module for <resource>, to be consumed by <env>"
3. Write HCL following rules/terraform/patterns.md
4. terraform fmt + terraform validate
5. /tf-plan-review            → terraform plan output reviewed by terraform-reviewer
6. /infra-security-scan       → security pass (IAM wildcards, public resources)
7. /aws-cost-check            → cost delta
8. PR → human approval → apply
```

**Effective prompt for step 2:**
```
/plan Terraform module: aws-rds-postgres (Aurora Serverless v2).
- Inputs: cluster_name, min_capacity (0.5), max_capacity, vpc_id, subnet_ids, allowed_sg_ids
- Must: encryption at rest (kms_key_id input), backup retention >=14d, deletion protection
- Must not: public access, public snapshots
- Outputs: cluster endpoint, reader endpoint, secret ARN (managed in Secrets Manager)
```

**Pitfalls the reviewer flags:**
- Hard-coded `us-east-1` or account IDs.
- IAM policies with `Action: "*"` or `Resource: "*"` without explicit scoping.
- Resources without `tags` propagation from a shared variable.

---

### 2. Terragrunt stack change

**When:** wiring a module into environments, or reshaping the stack tree.

```
1. Identify affected units in the DAG:  terragrunt graph-dependencies | head
2. Edit the relevant terragrunt.hcl(s)
3. /terragrunt-plan            → run-all plan with dependency-aware review
4. Reviewer checks:
   - No accidental `prevent_destroy = false` removal on stateful resources
   - remote_state is consistent across layers
   - `find_in_parent_folders()` lineage unchanged
5. Apply one env at a time (dev → staging → prod)
```

**Effective prompt:**
```
/terragrunt-plan
Context: adding the new aws-rds-postgres module to live/dev/data/rds-analytics.
Traffic: net-new, no migration.
Must include: plan output for dev only, blast-radius for prod (other units that might cascade).
```

---

### 3. Kubernetes deployment change

**When:** new Deployment, HPA, PDB, or changes to an existing workload.

```
1. Update manifests (raw YAML, or Helm/Kustomize overlay)
2. kubectl diff -f <manifests>   (against current cluster)
3. /k8s-audit                    → security + best-practices audit
   Reviewer checks:
   - securityContext: runAsNonRoot, readOnlyRootFilesystem, no privileged
   - resources.requests + limits
   - liveness + readiness probes (and startupProbe for slow-start)
   - PDB for HA workloads
   - NetworkPolicy for egress/ingress
4. PR → merge → ArgoCD sync (or kubectl apply under the gate)
```

**Effective prompt:**
```
/k8s-audit
File: k8s/prod/api-server-deployment.yaml
Focus: resource requests (currently unset — I suspect OOM in the last incident),
       liveness probe (httpGet /healthz — is 10s initial delay enough for our startup?),
       PDB (missing — we have 3 replicas).
```

---

### 4. ArgoCD application rollout

**When:** onboarding a new service to ArgoCD or changing sync behaviour.

```
1. Author / edit Application manifest
2. /argocd-audit                 → scans for anti-patterns
   Checks:
   - syncPolicy.automated with prune + selfHeal — intentional?
   - syncOptions: PruneLast (avoid orphan-before-create), ApplyOutOfSyncOnly
   - RBAC scope: does AppProject restrict source repos + destination ns?
   - Health checks defined for CRDs
3. PR → merge → ArgoCD picks up via gitops
4. Watch first sync; roll back by reverting the PR
```

**Effective prompt:**
```
/argocd-audit
File: argocd/apps/payments-service.yaml
Concern: we just had an incident where an image rollback wasn't picked up because selfHeal re-applied the stale manifest. Trace through syncPolicy + options.
```

---

### 5. Helm chart authoring

**When:** packaging an app, or updating values for a new environment.

```
1. Author Chart.yaml + templates/ + values.yaml + values.schema.json
2. helm lint .
3. /helm-lint                   → lint + schema validation + render dry-run
4. helm template . -f values-prod.yaml  (inspect rendered manifests)
5. Reviewer checks:
   - No hard-coded namespaces / cluster issuers
   - _helpers.tpl: reusable labels + selectors follow app.kubernetes.io/* conventions
   - Secrets never in values.yaml — refer to ExternalSecret / sealed-secrets
   - Chart.yaml version bump follows semver intent
```

**Effective prompt:**
```
/helm-lint
Chart: charts/payments-api
Values files: values.yaml, values-dev.yaml, values-prod.yaml.
Focus: verify the rendered output of values-prod.yaml has the new `ingress.tls` block wired correctly.
```

---

### 6. Kustomize overlay

**When:** adjusting per-env overrides, adding a component, or reshaping the base.

```
1. Edit base/ or overlays/<env>/
2. /kustomize-diff <env>        → render + diff vs current
   Reviewer checks:
   - Base vs overlay separation (no env-specific content in base)
   - Patches use strategicMergePatch where feasible (JSON patches are last-resort)
   - Components are used for cross-cutting overlays (monitoring, sidecars)
   - Secret/ConfigMap generators have stable hashSuffix handling
3. PR → merge → ArgoCD or kubectl apply
```

**Effective prompt:**
```
/kustomize-diff staging
Focus: we're adding a new sidecar (otel-collector) via a component.
Verify it lands in all apps and doesn't duplicate env vars already set in base.
```

---

### 7. AWS architecture decision

**When:** non-trivial design — picking between ECS vs EKS, RDS vs Aurora vs DynamoDB, VPC topology.

```
1. aws-architect agent (Opus — ask explicitly)
2. Describe: workload characteristics (qps, data size, latency SLO),
   constraints (budget, compliance, team familiarity),
   boundary (what's in scope vs out)
3. Agent produces: 2-3 options with trade-offs, recommended pick, ADR skeleton
4. /plan to break the recommendation into phases
5. Implement as a Terraform module (scenario 1)
```

**Effective prompt:**
```
Ask aws-architect: we need a message queue for 10k msg/s peak, 30d retention, multi-consumer fan-out. Ordering per-key, not globally. Team has used SQS before, not SNS+SQS. Budget-constrained.
Options I want compared: SQS-only, SNS+SQS fan-out, Kinesis, MSK.
Produce: trade-off matrix + recommendation + ADR draft.
```

---

### 8. Security scan before merge

**When:** any infra change is about to land (make it part of your PR template).

```
1. /infra-security-scan
   Cross-tool pass:
   - Terraform: IAM wildcards, secrets in state, unencrypted resources
   - Kubernetes: root containers, cluster-admin RBAC, missing limits
   - AWS: public S3, unencrypted storage, missing VPC Flow Logs
   - Helm/Kustomize: the rendered output goes through the same checks
2. Triage CRITICAL / HIGH / MEDIUM — CRITICAL blocks merge
3. Fix + re-scan
```

**Effective prompt:**
```
/infra-security-scan
Scope: changes in this PR (terraform plan output + rendered k8s manifests).
Focus: new RDS module — verify no public access, encryption at rest, IAM scoped to app roles only.
```

---

### 9. AWS cost check

**When:** PR adds or modifies AWS resources and you want the blast-radius on the bill.

```
1. /aws-cost-check
   Uses infracost on the terraform plan output
   Surfaces:
   - Monthly delta (added/removed/changed resources)
   - Resources likely to cost unexpectedly (NAT gateways, data transfer, idle RDS)
2. If >threshold, ask aws-architect for alternatives
```

**Effective prompt:**
```
/aws-cost-check
Plan file: plan.out (run from live/prod).
Expected delta: under $200/mo (new RDS + one NAT).
If anything exceeds, flag it.
```

---

### 10. Production incident response

**When:** something is on fire. You need Claude to be a calm co-pilot, not a cowboy.

```
1. DO NOT let Claude run destructive commands. The devops hooks block terraform apply / kubectl prod / terragrunt run-all apply by default — leave them blocking.
2. claude-research (read-only)
3. Describe: what's broken, when it started, what changed recently
   git log --since="2 hours ago" --all
4. Triage hypothesis:
   - Recent deploy? → roll back via ArgoCD revision or kubectl rollout undo
   - Recent infra change? → terraform state revert or explicit targeted change
   - External (cloud provider, DNS)? → confirm with status page, not with commands
5. Once cause is identified, one change at a time with explicit approval
6. Post-incident: write the ADR / postmortem with chief-of-staff or doc-updater agent
```

**Effective prompt:**
```
Incident: /api/v1/* is returning 503. Started ~10min ago. Last deploy was 45min ago.
I don't need a fix yet. I need you to:
1. List what changed in the last hour (git log, argocd history).
2. Rank suspects by likelihood + rollback-reversibility.
3. For the top suspect, what's the exact rollback command — don't run it.
```

---

## Commands

Every command is read-heavy by default (no apply). The safety hooks block destructive Bash even if a command tries.

### `/tf-plan-review`

Runs `terraform plan` (or reads a saved plan), routes output through `terraform-reviewer`.

**Produces:** annotated plan — blast-radius, state changes, resources being replaced (destructive), IAM deltas.

**Prompt shape:**
```
/tf-plan-review
Env: <dev / staging / prod>
Focus: <optional — "RDS snapshot before replace", "VPC peering change">
```

---

### `/terragrunt-plan`

Runs `terragrunt run-all plan` (stack-aware). Routes through `terragrunt-reviewer`.

**Produces:** per-unit plan summary, dependency graph, blast-radius across the stack.

**Prompt shape:**
```
/terragrunt-plan
Scope: <live/dev / live/prod / specific unit>
Concern: <optional — "is the state migration clean?">
```

---

### `/argocd-audit`

Scans Application / ApplicationSet / AppProject manifests.

**Produces:** findings per app — sync policy safety, RBAC scope, PruneLast, health checks.

**Prompt shape:**
```
/argocd-audit
Apps: <path pattern / specific file>
Focus: <optional — "syncPolicy.automated safety", "AppProject source restrictions">
```

---

### `/helm-lint`

`helm lint` + values schema validation + render dry-run.

**Prompt shape:**
```
/helm-lint
Chart: <path>
Values files: <comma-separated>
Focus: <optional>
```

---

### `/kustomize-diff`

Renders overlay + diffs against current (or against base).

**Prompt shape:**
```
/kustomize-diff <env>
Focus: <optional — "check the new component lands everywhere">
```

---

### `/k8s-audit`

Raw YAML audit for security + best-practice (probes, resources, RBAC, NetworkPolicy).

**Prompt shape:**
```
/k8s-audit
Files: <path pattern>
Focus: <optional — specific concern>
```

---

### `/aws-cost-check`

infracost-powered cost delta on a terraform plan.

**Prompt shape:**
```
/aws-cost-check
Plan file: <path, or run from live/<env>>
Expected delta: <optional budget, used to flag overages>
```

---

### `/infra-security-scan`

Cross-tool security pass (Terraform + K8s + Helm/Kustomize rendered output).

**Prompt shape:**
```
/infra-security-scan
Scope: <PR changes / entire repo / specific module>
Focus: <optional concern — e.g. "IAM on the new module">
```

---

## Prompt patterns for this stack

### Pattern: blast-radius first

```
<change description>
Before suggesting approval, enumerate the blast radius:
  - Resources replaced vs modified in place
  - Cross-stack dependencies (other Terragrunt units that reference these outputs)
  - Rollback path
```

### Pattern: least-privilege IAM

```
Write an IAM policy for <service> to <action> <resource>.
Must: resource-scoped (no `*` on Resource), specific actions (no `<svc>:*`).
Include: a justification comment for each Statement.
```

### Pattern: two-step apply

```
Plan first. Review. Only apply if I say "go".
Do not run terraform apply / kubectl apply. (The devops hooks block these anyway.)
```

### Anti-pattern (don't do this)

```
Deploy the new service to prod.   ← no change description, no blast radius, no rollback plan
```

---

## Pair-with

- `devops + nestjs` — platform repo (TypeScript API + infra)
- `devops + fastapi` — platform repo (Python API + infra)
- `devops + frontend` — deploy + static hosting (Vercel, CloudFront)
- `all` — mega-monorepo

---

## See also

- `common-README.md` — universal workflows
- `INTERNALS.md` — hook gating, session memory, safety guardrails

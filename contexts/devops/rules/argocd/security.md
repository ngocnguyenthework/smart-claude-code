---
paths:
  - "**/argocd/**/*.yaml"
  - "**/applications/**/*.yaml"
  - "**/applicationsets/**/*.yaml"
  - "**/projects/**/*.yaml"
---
# ArgoCD Security

> Extends [common/security.md](../common/security.md) with ArgoCD/GitOps-specific security rules.

## CRITICAL: Source Repo Allowlisting

- Every `AppProject` MUST set `sourceRepos` to an explicit allowlist
- **NEVER** use `- '*'` in production projects — any compromised repo can then deploy to the cluster
- Prefer org-scoped patterns: `https://github.com/my-org/*` over raw `*`

```yaml
# WRONG
spec:
  sourceRepos: ['*']

# CORRECT
spec:
  sourceRepos:
    - https://github.com/my-org/gitops
    - https://charts.example.com
```

## CRITICAL: Destination Restrictions

- `destinations` — every project MUST list allowed `{namespace, server}` pairs
- Never allow `namespace: '*'` on production clusters
- Use cluster-specific tokens (not `in-cluster` for multi-tenant)

```yaml
spec:
  destinations:
    - namespace: api-prod
      server: https://kubernetes.default.svc
    - namespace: web-prod
      server: https://kubernetes.default.svc
```

## CRITICAL: RBAC (ArgoCD Server)

- `policy.csv` must use deny-by-default
- Assign roles via OIDC groups — never per-user entries
- `admin` role scoped to break-glass group only
- `p, role:readonly, applications, get, */*, allow` for most users

## HIGH: Auto-Sync in Production

- **Do not** enable `syncPolicy.automated` globally
- If auto-sync is enabled on prod, MUST also set:
  - `selfHeal: true` — so drift is reverted
  - `prune: false` — never auto-delete resources
  - `syncOptions: [CreateNamespace=false]` — require explicit namespace
- Prefer manual sync + `automated` only in dev/staging

## HIGH: Secret Handling

- **NEVER** store plain `Secret` manifests in Git
- Use one of:
  - External Secrets Operator + `ExternalSecret` CRDs (recommended)
  - Sealed Secrets (`bitnami-labs/sealed-secrets`)
  - SOPS + age/KMS with kustomize-sops plugin
- ArgoCD Vault Plugin (AVP) is fine but requires plugin allowlisting

```yaml
# CORRECT: ExternalSecret references AWS Secrets Manager
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
spec:
  secretStoreRef: {name: aws-secrets, kind: ClusterSecretStore}
  target: {name: api-secrets}
  dataFrom:
    - extract: {key: prod/api/env}
```

## HIGH: Finalizer Hygiene

- Always include `resources-finalizer.argocd.argoproj.io` on Applications
- Without it, deleting an Application orphans its resources in the cluster
- Pair with `syncPolicy.syncOptions: [ApplyOutOfSyncOnly=true]` to minimize churn

## MEDIUM: Resource Whitelisting

- `clusterResourceWhitelist` — list allowed cluster-scoped kinds explicitly
- Empty list = no cluster-scoped resources (safest default for app teams)
- Only platform projects should allow `ClusterRole`, `ClusterRoleBinding`, `CustomResourceDefinition`

```yaml
spec:
  clusterResourceWhitelist: []   # app teams
  # or
  clusterResourceWhitelist:      # platform team
    - group: ""
      kind: Namespace
```

## MEDIUM: Git Signature Verification

- Enable `signatureKeys` on projects for production
- Pair with repo-side `gpg: true` commit signing enforcement

```yaml
spec:
  signatureKeys:
    - keyID: 4AEE18F83AFDEB23
```

## Scanning

```bash
# Lint all manifests
yamllint -c .yamllint gitops/

# Validate against Kubernetes API schema
kubeconform -strict -ignore-missing-schemas gitops/

# ArgoCD-specific linting
argocd app diff <name> --exit-code  # pre-sync drift detection

# Policy as code (optional)
conftest test gitops/ --policy policies/
```

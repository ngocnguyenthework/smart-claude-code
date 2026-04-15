---
paths:
  - "**/argocd/**/*.yaml"
  - "**/argocd/**/*.yml"
  - "**/applications/**/*.yaml"
  - "**/applicationsets/**/*.yaml"
---
# ArgoCD Coding Style

> Extends [common/coding-style.md](../common/coding-style.md) with ArgoCD manifest conventions.

## File Organization

```
gitops/
  apps/                          # Application manifests (the "app-of-apps" root)
    root-app.yaml
  applications/                  # Individual Application manifests
    <env>/<team>/<app>.yaml
  applicationsets/               # ApplicationSet for multi-env/multi-cluster fanout
    <team>/<app>.yaml
  projects/                      # AppProject definitions (RBAC, destinations, sources)
    <team>.yaml
  manifests/                     # Raw K8s manifests (referenced by Applications)
    <app>/base/
    <app>/overlays/{dev,staging,prod}/
```

## Naming

- **Application name**: `<env>-<app>` (e.g. `prod-api`, `staging-web`). Must match label on target resources for traceability.
- **AppProject name**: team or domain (e.g. `platform`, `payments`).
- **Destination namespace**: matches Application name root (e.g. Application `prod-api` → namespace `api`).
- **Label keys**: `argocd.argoproj.io/instance` is owned by ArgoCD — never set manually.

## Manifest Conventions

- One resource per file. No multi-doc YAML (`---`) except for AppProject that includes multiple policies.
- `apiVersion: argoproj.io/v1alpha1` — pin explicitly. Do not rely on kubectl conversion.
- `metadata.finalizers` — always include `resources-finalizer.argocd.argoproj.io` on Applications so cascade deletion works.
- `spec.source.targetRevision` — use tags or commit SHAs. Never `HEAD` or `master`/`main` for production.
- `spec.syncPolicy.automated` — opt in per environment, not globally. Dev/staging yes; prod requires explicit review.

## Sync Waves & Hooks

- Use `argocd.argoproj.io/sync-wave: "N"` (string) annotations on dependencies. Lower numbers sync first.
- Standard wave convention:
  - `-10` — CRDs
  - `-5` — Namespaces, ServiceAccounts, RBAC
  - `0` — Core resources (default)
  - `5` — Jobs, migrations (pre-sync hooks)
  - `10` — Post-sync validation

## Project Structure (AppProject)

- `sourceRepos` — explicit allowlist, no wildcards
- `destinations` — explicit `{namespace, server}` pairs
- `clusterResourceWhitelist` — explicit allowlist (or empty if app doesn't need cluster-scoped resources)
- `namespaceResourceBlacklist` — deny dangerous kinds like `ResourceQuota`, `LimitRange` if managed centrally
- `roles` — named roles with explicit `policies` and `groups` (OIDC)

## Formatting

- 2-space indentation (YAML standard)
- Quote string values when they could be ambiguous (`"true"`, `"1.0.0"`, `"0"`)
- Keys in consistent order: `apiVersion`, `kind`, `metadata`, `spec`
- Run `yamllint` and `kubeconform` on every manifest before commit

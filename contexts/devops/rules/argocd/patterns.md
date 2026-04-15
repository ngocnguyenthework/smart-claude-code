---
paths:
  - "**/argocd/**/*.yaml"
  - "**/applications/**/*.yaml"
  - "**/applicationsets/**/*.yaml"
---
# ArgoCD Patterns

> Extends [common/patterns.md](../common/patterns.md) with GitOps-specific architectural patterns.

## App-of-Apps

Root `Application` manifests a directory of child `Application`s — single entry point for bootstrapping a cluster.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: platform
  source:
    repoURL: https://github.com/org/gitops.git
    targetRevision: main
    path: apps/
    directory:
      recurse: true
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

## ApplicationSet (Matrix Generator)

Fanout an Application template across clusters × environments:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: web
  namespace: argocd
spec:
  generators:
    - matrix:
        generators:
          - clusters: {selector: {matchLabels: {env: prod}}}
          - list:
              elements:
                - region: apac
                - region: emea
  template:
    metadata:
      name: '{{name}}-web-{{region}}'
    spec:
      project: web
      source:
        repoURL: https://github.com/org/gitops.git
        targetRevision: '{{metadata.labels.version}}'
        path: 'manifests/web/overlays/{{name}}-{{region}}'
      destination:
        server: '{{server}}'
        namespace: web
```

## Sync Waves for Ordered Deployment

```yaml
# CRDs first
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "-10"

# Then namespaces + RBAC
# wave: -5

# Then core workloads (default wave 0)

# Then post-sync validation Job
metadata:
  annotations:
    argocd.argoproj.io/hook: PostSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
```

## Progressive Delivery

- Use `rollouts.argoproj.io/Rollout` + `AnalysisTemplate` (Argo Rollouts) instead of plain Deployments for canary/blue-green
- Pair with Prometheus-based success criteria
- Use sync waves to ensure CRDs (Rollout, AnalysisTemplate) install before workloads

## Helm Integration

```yaml
spec:
  source:
    repoURL: https://github.com/org/gitops.git
    targetRevision: main
    path: charts/api
    helm:
      releaseName: api
      valueFiles:
        - values.yaml
        - values-prod.yaml
      parameters:
        - name: image.tag
          value: v1.2.3
```

## Kustomize Integration

```yaml
spec:
  source:
    repoURL: https://github.com/org/gitops.git
    targetRevision: main
    path: manifests/api/overlays/prod
    kustomize:
      images:
        - registry.example.com/api:v1.2.3
      commonAnnotations:
        managed-by: argocd
```

## Multi-Source Applications (v2.6+)

Combine Helm chart from one repo with values from another:

```yaml
spec:
  sources:
    - repoURL: https://charts.example.com
      chart: api
      targetRevision: 1.2.3
      helm:
        valueFiles:
          - $values/charts/api/values-prod.yaml
    - repoURL: https://github.com/org/gitops.git
      targetRevision: main
      ref: values
```

## Rollback Pattern

- Sync history retained via `spec.revisionHistoryLimit` (default 10)
- Rollback: `argocd app rollback <name> <history-id>` — reverts to prior synced revision
- For automated rollback, pair with Argo Rollouts analysis that auto-aborts on error rate spike

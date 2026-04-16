---
paths:
  - "**/kustomization.yaml"
  - "**/kustomization.yml"
---
# Kustomize Patterns

> Common Kustomize patterns. Extends [kubernetes/patterns.md](../kubernetes/patterns.md).

## Base / Overlays

Single source of truth for shared config; overlays inject env-specific deltas.

```yaml
# base/kustomization.yaml
resources:
  - deployment.yaml
  - service.yaml

# overlays/prod/kustomization.yaml
resources:
  - ../../base
patches:
  - path: scale.yaml
images:
  - name: registry.example.com/api
    newTag: v1.4.2
```

## Image Tag Substitution

Always override image tags in overlays, never in base:

```yaml
images:
  - name: registry.example.com/api
    newTag: v1.4.2
  - name: registry.example.com/worker
    newName: registry.example.com/worker-v2   # optional rename
    newTag: v1.4.2
```

- Makes tag bumps a one-line change per env
- Works without touching the Deployment spec

## ConfigMap / Secret Generators

```yaml
# base/kustomization.yaml
configMapGenerator:
  - name: api-config
    files:
      - config.yaml=config.yaml
```

```yaml
# overlays/prod/kustomization.yaml
configMapGenerator:
  - name: api-config
    behavior: replace     # or merge
    files:
      - config.yaml=config-prod.yaml
```

- Generators append a content-hash suffix → changes trigger a rolling restart
- Use `behavior: merge` to add env-specific keys without replacing the whole ConfigMap
- Use `behavior: replace` when the file content differs substantially

## `replacements` (v4+)

Propagate values across resources without patching each by hand:

```yaml
replacements:
  - source:
      kind: ConfigMap
      name: api-config
      fieldPath: data.version
    targets:
      - select:
          kind: Deployment
          name: api
        fieldPaths:
          - spec.template.metadata.annotations.version
```

## Components for Cross-Cutting

Unlike overlays, Components can be layered onto multiple overlays — perfect for optional features:

```yaml
# components/mtls/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
resources:
  - peer-authentication.yaml
commonAnnotations:
  security.istio.io/tlsMode: istio
```

```yaml
# overlays/prod/kustomization.yaml
components:
  - ../../components/mtls
  - ../../components/monitoring
```

## Multi-Tenant via `namePrefix`

```yaml
# overlays/tenant-a/kustomization.yaml
namePrefix: tenant-a-
namespace: tenant-a
resources:
  - ../../base
```

Result: every resource renamed `tenant-a-<original-name>` in namespace `tenant-a`.

## Resource Transformers

- `commonLabels` → applied to all resources + selectors (immutable after apply!)
- `commonAnnotations` → applied to all resources (safe to change)
- `namespace` → sets metadata.namespace on all resources
- `namePrefix` / `nameSuffix` → renames resources; selectors stay consistent automatically

## Override Hierarchy

```
base/                  # immutable; shared config
  ↓
components/            # optional cross-cutting
  ↓
overlays/<env>/        # env-specific deltas
  ↓
kubectl kustomize → | kubectl apply
```

Don't skip levels. Don't put env-specific data in base. Don't have overlays inherit from other overlays.

## Helm → Kustomize Migration

```yaml
# overlays/prod/kustomization.yaml
helmCharts:
  - name: postgresql
    repo: https://charts.bitnami.com/bitnami
    version: 12.5.8
    releaseName: db
    namespace: data
    valuesFile: values.yaml
```

Useful when your org standardizes on Kustomize but you want to consume a third-party chart without maintaining a wrapper.

## Common Pitfalls

- **Don't** use `patches:` with `target:` that matches multiple resources when you meant one — adds a label selector requirement
- **Don't** change `commonLabels` after initial deployment — Deployment selectors are immutable; it will break upgrades
- **Don't** reference a base from outside its directory tree with a relative path that escapes the overlay — breaks portability
- **Don't** mix `configMapGenerator` with hand-written ConfigMaps of the same name

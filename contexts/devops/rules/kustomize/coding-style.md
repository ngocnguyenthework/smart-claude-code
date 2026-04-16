---
paths:
  - "**/kustomization.yaml"
  - "**/kustomization.yml"
---
# Kustomize Coding Style

> Extends [kubernetes/coding-style.md](../kubernetes/coding-style.md) with Kustomize-specific conventions.

## Layout

```
manifests/
  <app>/
    base/
      kustomization.yaml
      deployment.yaml
      service.yaml
      configmap.yaml
    components/             # Optional cross-cutting features
      istio/
        kustomization.yaml
      monitoring/
        kustomization.yaml
    overlays/
      dev/
        kustomization.yaml
        patch-replicas.yaml
        patch-resources.yaml
      staging/
        kustomization.yaml
        ...
      prod/
        kustomization.yaml
        ...
```

## `base/kustomization.yaml`

- Lists only raw resources (no patches, no prefixes, no overrides)
- `resources:` alphabetized for diff-friendliness
- `commonLabels` for K8s standard labels (`app.kubernetes.io/name`, `app.kubernetes.io/part-of`)
- No environment-specific values in base

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - configmap.yaml
  - deployment.yaml
  - service.yaml
  - serviceaccount.yaml
commonLabels:
  app.kubernetes.io/name: api
  app.kubernetes.io/part-of: platform
```

## `overlays/<env>/kustomization.yaml`

- `resources:` includes the base path and env-specific resources
- `namespace:` sets the target namespace
- `namePrefix` or `nameSuffix` to avoid naming collisions across envs
- `images:` overrides image tags without patching the Deployment
- `patches:` for surgical changes (replica count, resource limits, env vars)
- `configMapGenerator` / `secretGenerator` for env-specific ConfigMaps

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: api-prod
namePrefix: prod-
resources:
  - ../../base
  - ingress.yaml
components:
  - ../../components/monitoring
images:
  - name: registry.example.com/api
    newTag: 1.4.2
patches:
  - path: patch-replicas.yaml
    target:
      kind: Deployment
      name: api
commonAnnotations:
  example.com/environment: production
```

## Patches

- Prefer **strategic merge** (SMP) for structured edits (replicas, envFrom)
- Use **JSON patches** (RFC 6902) for list operations or when SMP is ambiguous
- One patch file per logical concern — don't bundle unrelated changes
- Patch files should be minimal — only include fields being changed

```yaml
# patch-replicas.yaml (strategic merge)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 10
```

```yaml
# patch-env.yaml (JSON patch)
- op: add
  path: /spec/template/spec/containers/0/env/-
  value:
    name: DEPLOYMENT_ENV
    value: prod
```

## Generators

- `configMapGenerator` auto-appends a hash suffix → triggers Deployment restart on change
- `secretGenerator` for env-specific credentials (source from files, not literals)
- Use `behavior: merge` when extending a base-defined generator

```yaml
configMapGenerator:
  - name: api-config
    behavior: merge
    literals:
      - LOG_LEVEL=debug
      - FEATURE_X_ENABLED=true
```

## Components

Cross-cutting concerns (service mesh sidecar injection, monitoring annotations, mTLS) live in `components/`:

```yaml
# components/monitoring/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
commonAnnotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "9090"
patches:
  - path: add-metrics-port.yaml
    target:
      kind: Deployment
```

Consumers reference via `components:` (not `resources:`):

```yaml
components:
  - ../../components/monitoring
  - ../../components/istio
```

## Formatting

- 2-space indentation
- Keep `kustomization.yaml` under 50 lines — extract patches to sibling files
- Alphabetize `resources:` and `images:` lists
- Run `kustomize build` before commit — catches syntax errors
- Run `kustomize build | kubeconform -strict` in CI

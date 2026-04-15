---
paths:
  - "**/k8s/**/*.yaml"
  - "**/k8s/**/*.yml"
  - "**/manifests/**/*.yaml"
  - "**/manifests/**/*.yml"
  - "**/helm/**/*.yaml"
  - "**/charts/**/*.yaml"
  - "**/kustomize/**/*.yaml"
---
# Kubernetes Coding Style

> Extends [common/coding-style.md](../common/coding-style.md) with Kubernetes manifest conventions.

## Resource Structure

Standard field ordering for readability:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: production
  labels:
    app.kubernetes.io/name: api-server
    app.kubernetes.io/version: "1.2.3"
    app.kubernetes.io/component: backend
    app.kubernetes.io/managed-by: helm
  annotations:
    description: "API server deployment"
spec:
  replicas: 3
  selector:
    matchLabels:
      app.kubernetes.io/name: api-server
  template:
    metadata:
      labels:
        app.kubernetes.io/name: api-server
    spec:
      # ...
```

## Label Conventions

Use the standard Kubernetes recommended labels:

| Label | Purpose | Example |
|-------|---------|---------|
| `app.kubernetes.io/name` | Application name | `api-server` |
| `app.kubernetes.io/version` | App version | `1.2.3` |
| `app.kubernetes.io/component` | Role in architecture | `backend`, `frontend`, `database` |
| `app.kubernetes.io/part-of` | Parent application | `myproject` |
| `app.kubernetes.io/managed-by` | Tool managing this | `helm`, `kustomize` |
| `environment` | Deployment target | `dev`, `staging`, `prod` |

## Namespace Isolation

- One namespace per environment per application
- Never deploy application workloads to `default` namespace
- Use ResourceQuotas and LimitRanges per namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: myapp-production
  labels:
    environment: production
    app.kubernetes.io/part-of: myapp
```

## Kustomize Structure

```
k8s/
  base/
    deployment.yaml
    service.yaml
    configmap.yaml
    kustomization.yaml
  overlays/
    dev/
      kustomization.yaml      # patches for dev
      replicas-patch.yaml
    staging/
      kustomization.yaml
    prod/
      kustomization.yaml
      replicas-patch.yaml
      hpa.yaml
```

## Helm Chart Structure

```
charts/myapp/
  Chart.yaml
  values.yaml
  values-dev.yaml
  values-prod.yaml
  templates/
    deployment.yaml
    service.yaml
    ingress.yaml
    hpa.yaml
    _helpers.tpl
    NOTES.txt
```

## Formatting

- YAML only (no JSON manifests)
- 2-space indentation
- No trailing whitespace
- Use `---` separator between multiple resources in one file
- One resource per file preferred (except tightly coupled pairs)

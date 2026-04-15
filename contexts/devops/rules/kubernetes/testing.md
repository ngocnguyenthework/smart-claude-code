---
paths:
  - "**/k8s/**/*.yaml"
  - "**/k8s/**/*.yml"
  - "**/manifests/**/*.yaml"
  - "**/helm/**/*.yaml"
  - "**/charts/**/*.yaml"
---
# Kubernetes Testing

> Extends [common/testing.md](../common/testing.md) with Kubernetes manifest validation and testing.

## Validation Pipeline

Run before any apply or merge:

```bash
# 1. Schema validation
kubeval --strict manifests/

# 2. Best practices scoring
kube-score score manifests/*.yaml

# 3. Security policy testing
conftest test manifests/ --policy policy/

# 4. Helm template validation
helm template mychart ./charts/myapp | kubeval --strict

# 5. Diff against live cluster (non-destructive)
kubectl diff -f manifests/
```

## kubeval — Schema Validation

Validates manifests against Kubernetes JSON schemas:

```bash
# Install
brew install kubeval

# Validate all manifests
kubeval --strict -d manifests/

# With specific K8s version
kubeval --strict --kubernetes-version 1.28.0 -d manifests/
```

## kube-score — Best Practices

Checks for common mistakes and best practices:

```bash
# Install
brew install kube-score

# Score manifests
kube-score score manifests/*.yaml

# Critical checks:
# - Container resources set
# - Pod probes configured
# - Security context set
# - Image tag is not :latest
```

## Policy Testing with Conftest/OPA

Write custom policies in Rego:

```rego
# policy/kubernetes.rego
package main

deny[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  not container.resources.limits
  msg := sprintf("Container %s must have resource limits", [container.name])
}

deny[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  container.securityContext.privileged == true
  msg := sprintf("Container %s must not be privileged", [container.name])
}

deny[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  endswith(container.image, ":latest")
  msg := sprintf("Container %s must not use :latest tag", [container.name])
}
```

```bash
conftest test manifests/ --policy policy/
```

## Helm Chart Testing

```bash
# Lint chart
helm lint ./charts/myapp

# Template rendering (check for errors)
helm template test ./charts/myapp -f values-prod.yaml

# Test with helm-unittest
helm unittest ./charts/myapp
```

## kubectl diff

Non-destructive check of what would change:

```bash
# See what would change without applying
kubectl diff -f manifests/deployment.yaml

# Dry-run apply (server-side validation)
kubectl apply -f manifests/ --dry-run=server
```

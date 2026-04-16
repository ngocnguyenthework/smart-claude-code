---
paths:
  - "**/kustomization.yaml"
  - "**/kustomization.yml"
---
# Kustomize Testing

> Render, diff, and cluster-dry-run validation for Kustomize overlays.

## Pre-Commit

```bash
# Build every overlay
for overlay in manifests/*/overlays/*/; do
  echo "=== Building $overlay ==="
  kustomize build "$overlay" > /dev/null || { echo "FAIL: $overlay"; exit 1; }
done

# Validate against K8s schemas
for overlay in manifests/*/overlays/*/; do
  kustomize build "$overlay" | kubeconform -strict \
    -schema-location default \
    -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'
done
```

## Diff Old vs New

The single most valuable check for Kustomize PRs:

```bash
# Build from base branch
git worktree add /tmp/base main
for overlay in manifests/*/overlays/*/; do
  kustomize build "/tmp/base/$overlay" > "/tmp/old-$(echo $overlay | tr / -).yaml"
done
git worktree remove /tmp/base

# Build from HEAD
for overlay in manifests/*/overlays/*/; do
  kustomize build "$overlay" > "/tmp/new-$(echo $overlay | tr / -).yaml"
done

# Side-by-side diff
for f in /tmp/old-*.yaml; do
  newf="${f/old/new}"
  echo "=== $(basename $f) ==="
  diff -u "$f" "$newf" | head -200
done
```

## Immutable Field Detection

```bash
# Selectors are the usual culprit
for overlay in manifests/*/overlays/*/; do
  kustomize build "$overlay" | yq 'select(.kind == "Deployment") | .spec.selector.matchLabels'
done
```

If a PR changes any `spec.selector.matchLabels`, it's a breaking change — flag explicitly.

## Cluster Dry-Run

```bash
# Server-side dry-run catches admission errors (PSA, OPA, ValidatingAdmissionPolicy)
kubectl apply -k manifests/api/overlays/staging --dry-run=server

# Client-side dry-run catches schema errors only
kubectl apply -k manifests/api/overlays/staging --dry-run=client
```

## Policy-as-Code

```bash
for overlay in manifests/*/overlays/prod/; do
  kustomize build "$overlay" | conftest test - --policy policies/ --combine
done
```

Example policies:
- `no-privileged`: block `securityContext.privileged: true`
- `no-host-network`: block `hostNetwork: true`
- `require-resource-limits`: require `resources.limits`
- `no-latest-image`: fail on `:latest` image tag

## Smoke Test in Kind

```bash
# Fresh cluster per PR
kind create cluster --name smart-claude-test

# Apply overlay
kubectl apply -k manifests/api/overlays/dev

# Wait for readiness
kubectl wait --for=condition=Available deployment/api --timeout=120s

# Run any in-cluster tests
kubectl apply -f manifests/api/tests/smoke.yaml
kubectl wait --for=condition=Complete job/api-smoke --timeout=60s

# Cleanup
kind delete cluster --name smart-claude-test
```

## Replacement / Substitution Integrity

```bash
# Verify replacements resolved correctly
kustomize build overlays/prod | grep -E '(PLACEHOLDER|TODO|FIXME|\$\{)' || echo "No unresolved placeholders"
```

## `kustomize edit` Drift

If a PR modifies kustomization files by hand, compare with what `kustomize edit` would produce:

```bash
kustomize edit fix --vars    # normalizes the file
git diff --exit-code -- 'manifests/**/kustomization.yaml' || echo "kustomize edit would reformat"
```

## CI Checklist

- [ ] Every overlay builds cleanly (`kustomize build`)
- [ ] `kubeconform -strict` passes on rendered output
- [ ] `kubectl apply --dry-run=server` passes for each env overlay
- [ ] `conftest` policy tests pass
- [ ] No `Deployment.spec.selector` changes (or migration plan documented)
- [ ] No plaintext secrets in rendered output
- [ ] Image tags pinned (no `:latest`)
- [ ] Rendered diff vs main reviewed line-by-line

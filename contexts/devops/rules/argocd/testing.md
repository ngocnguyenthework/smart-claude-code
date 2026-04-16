---
paths:
  - "**/argocd/**/*.yaml"
  - "**/applications/**/*.yaml"
  - "**/applicationsets/**/*.yaml"
---
# ArgoCD Testing

> How to validate ArgoCD manifests and sync behavior before they reach the cluster.

## Pre-Commit Validation

```bash
# YAML syntax
yamllint -c .yamllint gitops/

# K8s API schema validation (knows ArgoCD CRDs if --schema-location is set)
kubeconform -strict \
  -schema-location default \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
  gitops/

# Render each Application's source (Helm/Kustomize) and validate output
for app in gitops/applications/*.yaml; do
  argocd app manifests $(yq '.metadata.name' $app) --revision main | kubeconform -strict
done
```

## Diff Before Sync

```bash
# Show what will change in the cluster without applying
argocd app diff <app-name>

# Exit non-zero if there is drift — use in CI to block merges with unintended drift
argocd app diff <app-name> --exit-code
```

## Dry-Run Sync

```bash
# Render all manifests that would be applied
argocd app sync <app-name> --dry-run

# ApplicationSet: render generated Applications without creating them
argocd appset get <appset-name> --output yaml | yq '.status.resources'
```

## Sync Wave Order Verification

```bash
# List resources by sync wave
argocd app resources <app-name> --output json | jq '
  .resources | map({
    wave: (.annotations["argocd.argoproj.io/sync-wave"] // "0"),
    kind: .kind,
    name: .name
  }) | sort_by(.wave | tonumber)
'
```

## Project RBAC Smoke Test

```bash
# Validate that a user's role permits expected operations
argocd account can-i sync applications <project>/<app> --auth-token $USER_TOKEN
argocd account can-i create projects '*' --auth-token $USER_TOKEN  # should be false for non-admins
```

## Rollback Rehearsal

- Every production change should have a tested rollback path
- In staging: sync Application at tag X → sync at tag Y → rollback to X → verify cluster state matches
- Confirm `revisionHistoryLimit` is ≥ 5 so rollback target is still available

```bash
argocd app history <app-name>
argocd app rollback <app-name> <history-id>
```

## Automated Health Checks

- Every Application's target resources should have `readinessProbe` and `livenessProbe` defined
- ArgoCD uses these to compute health status — missing probes → always `Progressing`
- Custom health checks: `configMap/argocd-cm.data.resource.customizations.health.<Group>_<Kind>`

## CI Checklist

Before merging a GitOps PR:
- [ ] `yamllint` passes
- [ ] `kubeconform -strict` passes
- [ ] Rendered output (`helm template` / `kustomize build`) matches expected schema
- [ ] `argocd app diff --exit-code` shows only intended changes
- [ ] No new `Secret` resources in plain text
- [ ] Sync waves annotated on dependency chains
- [ ] `finalizers` present on every new Application
- [ ] `targetRevision` is a tag or SHA, not a branch (for prod)

---
description: Audit ArgoCD Applications, ApplicationSets, and AppProjects for sync safety, RBAC scope, and secret handling
---

# ArgoCD Audit

## Steps

1. **Discover manifests**:
   ```bash
   git diff --name-only | grep -E '(argocd|applications|applicationsets|projects)/.*\.ya?ml$'
   # If no diff target, scan all:
   find . -path '*/argocd/*' -name '*.yaml' -o -path '*/applications/*' -name '*.yaml'
   ```

2. **YAML + schema validation**:
   ```bash
   yamllint -c .yamllint <files>
   kubeconform -strict \
     -schema-location default \
     -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
     <files>
   ```

3. **Render each Application's source**:
   - If `spec.source.helm` present → `helm template` with matching values
   - If `spec.source.kustomize` present → `kustomize build` the referenced path
   - Pipe rendered YAML through `kubeconform -strict`

4. **Diff live state** (if cluster reachable):
   ```bash
   argocd app diff <app-name>
   # or in bulk:
   for app in $(argocd app list -o name); do
     echo "=== $app ==="
     argocd app diff "$app" 2>&1 | head -40
   done
   ```

5. **Invoke argocd-reviewer agent** with focus on:
   - CRITICAL: source allowlist, destination scope, targetRevision on prod, plaintext Secrets, missing finalizers
   - HIGH: sync policy safety (automated/prune/selfHeal), RBAC scope changes, sync-wave ordering on CRDs
   - MEDIUM: revisionHistoryLimit, probes, progressive-delivery annotations

6. **Sync-wave order report**:
   ```bash
   for app in <changed-apps>; do
     argocd app resources "$app" --output json | \
       jq -r '.resources | map({wave: (.annotations["argocd.argoproj.io/sync-wave"] // "0"), kind, name}) | sort_by(.wave | tonumber) | .[] | "\(.wave)  \(.kind)/\(.name)"'
   done
   ```

7. **Project RBAC audit**:
   ```bash
   argocd proj list -o json | jq '.[] | {name: .metadata.name, sources: .spec.sourceRepos, dests: .spec.destinations, roles: [.spec.roles[]? | .name]}'
   ```

8. **Report** APPROVE / WARNING / BLOCK

## BLOCKING Conditions
- `targetRevision` is a branch (not tag/SHA) on any production Application
- Any plaintext `Secret` manifest under GitOps paths
- `AppProject.sourceRepos: ['*']` on a production project
- Auto-sync newly enabled on production without rollback evidence

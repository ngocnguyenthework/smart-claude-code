---
description: Lint Helm charts, validate schema, render all env values, and scan for policy violations
---

# Helm Lint & Validate

## Steps

1. **Identify changed charts**:
   ```bash
   git diff --name-only | grep -E '(charts/.*/(Chart|values)\.yaml|charts/.*/templates/)' | \
     awk -F'/templates/' '{print $1}' | \
     awk -F'/Chart.yaml' '{print $1}' | \
     awk -F'/values.yaml' '{print $1}' | sort -u
   ```

2. **Lint each chart**:
   ```bash
   for chart in <changed-charts>; do
     echo "=== Linting $chart ==="
     helm lint "$chart" --strict
   done
   ```

3. **Dependency lock integrity**:
   ```bash
   for chart in <changed-charts>; do
     (cd "$chart" && helm dep update)
   done
   # Fail if Chart.lock drifted unexpectedly:
   git diff --exit-code -- '**/Chart.lock' || echo "WARNING: Chart.lock drift"
   ```

4. **Render every env values file and validate**:
   ```bash
   for chart in <changed-charts>; do
     env_files=$(ls "$chart"/values-*.yaml 2>/dev/null || true)
     for envf in $env_files; do
       env=$(basename "$envf" .yaml | sed 's/values-//')
       echo "=== $chart × $env ==="
       helm template test "$chart" \
         --values "$chart/values.yaml" \
         --values "$envf" \
         --debug > "/tmp/rendered-${chart//\//-}-${env}.yaml"
       kubeconform -strict "/tmp/rendered-${chart//\//-}-${env}.yaml" || exit 1
     done
   done
   ```

5. **Values-schema validation**:
   ```bash
   for chart in <changed-charts>; do
     if [ -f "$chart/values.schema.json" ]; then
       helm lint "$chart" --values "$chart/values.yaml"
     else
       echo "WARNING: $chart missing values.schema.json"
     fi
   done
   ```

6. **Rendered diff vs main** (show what changes in the cluster):
   ```bash
   for chart in <changed-charts>; do
     git show "main:$chart/Chart.yaml" > /dev/null 2>&1 || continue
     # Checkout old version to tmp dir
     git worktree add "/tmp/old-$$" main -- "$chart"
     helm template x "/tmp/old-$$/$chart" --values "/tmp/old-$$/$chart/values.yaml" > /tmp/old.yaml
     helm template x "$chart" --values "$chart/values.yaml" > /tmp/new.yaml
     git worktree remove "/tmp/old-$$"
     diff -u /tmp/old.yaml /tmp/new.yaml | head -200
   done
   ```

7. **Unit tests** (if present):
   ```bash
   for chart in <changed-charts>; do
     if [ -d "$chart/tests" ]; then
       helm unittest "$chart"
     fi
   done
   ```

8. **Policy-as-code** (if `policies/` dir exists):
   ```bash
   for f in /tmp/rendered-*.yaml; do
     conftest test "$f" --policy policies/ --combine
   done
   ```

9. **Scan for accidental secrets in rendered output**:
   ```bash
   grep -rEn '(password|apikey|secret|token)\s*:\s*[^"]*[a-zA-Z0-9]' /tmp/rendered-*.yaml | \
     grep -v 'existingSecret\|secretKeyRef\|valueFrom' || echo "No plaintext secrets detected"
   ```

10. **Invoke helm-reviewer agent** with focus on:
    - CRITICAL: plaintext secrets, version-bump omissions, `:latest` tags
    - HIGH: RBAC scope, pod security, template injection, cross-env value drift
    - MEDIUM: schema coverage, docs regen, upgrade-safety annotations

11. **Report** APPROVE / WARNING / BLOCK

## BLOCKING Conditions
- `helm lint --strict` fails
- `Chart.lock` drifted without explanation
- Any plaintext secret found in rendered output
- `Chart.yaml` version did not bump despite template/values changes
- `image.tag: latest` default in any values file

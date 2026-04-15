---
description: Render Kustomize overlays, diff old vs new, validate schema, and scan for selector/secret regressions
---

# Kustomize Diff & Validate

## Steps

1. **Identify changed overlays**:
   ```bash
   CHANGED_DIRS=$(git diff --name-only main...HEAD -- 'manifests/' | \
     awk -F/ '/overlays/ {for(i=1;i<=NF;i++) if($i=="overlays"){print $1"/"$2"/"$3"/"$4; next}}' | sort -u)
   echo "$CHANGED_DIRS"
   ```

2. **Build every overlay (HEAD)**:
   ```bash
   for overlay in $CHANGED_DIRS; do
     echo "=== Building $overlay ==="
     kustomize build "$overlay" > "/tmp/new-$(echo $overlay | tr / -).yaml" || exit 1
   done
   ```

3. **Build every overlay (main)** via `git worktree`:
   ```bash
   git worktree add /tmp/kustomize-base main 2>/dev/null || true
   for overlay in $CHANGED_DIRS; do
     if [ -d "/tmp/kustomize-base/$overlay" ]; then
       kustomize build "/tmp/kustomize-base/$overlay" > "/tmp/old-$(echo $overlay | tr / -).yaml"
     else
       echo "" > "/tmp/old-$(echo $overlay | tr / -).yaml"  # new overlay
     fi
   done
   git worktree remove /tmp/kustomize-base
   ```

4. **Diff rendered output**:
   ```bash
   for new in /tmp/new-*.yaml; do
     old="${new/new/old}"
     echo "=== $(basename $new .yaml | sed 's/new-//') ==="
     diff -u "$old" "$new" | head -300
   done
   ```

5. **Schema validation**:
   ```bash
   for f in /tmp/new-*.yaml; do
     kubeconform -strict \
       -schema-location default \
       -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
       "$f" || exit 1
   done
   ```

6. **Selector regression check** (CRITICAL — breaks rolling upgrades):
   ```bash
   for new in /tmp/new-*.yaml; do
     old="${new/new/old}"
     diff \
       <(yq 'select(.kind == "Deployment" or .kind == "StatefulSet") | .metadata.name + " " + (.spec.selector.matchLabels | tojson)' "$old" 2>/dev/null | sort) \
       <(yq 'select(.kind == "Deployment" or .kind == "StatefulSet") | .metadata.name + " " + (.spec.selector.matchLabels | tojson)' "$new" 2>/dev/null | sort) \
       && echo "OK: selectors stable" || echo "!! SELECTOR CHANGE DETECTED !!"
   done
   ```

7. **Secret scan on rendered output**:
   ```bash
   for f in /tmp/new-*.yaml; do
     grep -En '(password|apikey|secret|token)\s*:\s*[^"]*[a-zA-Z0-9]{8,}' "$f" | \
       grep -v 'valueFrom\|secretKeyRef\|ExternalSecret\|SealedSecret' && \
       echo "!! Possible plaintext secret in $f !!"
   done
   ```

8. **Image tag pinning check**:
   ```bash
   for f in /tmp/new-*.yaml; do
     yq '.. | select(has("image")) | .image' "$f" | \
       grep -E ':(latest|main|master|stable)$' && echo "!! Unpinned image in $f !!"
   done
   ```

9. **Server-side dry-run** (if cluster reachable):
   ```bash
   for overlay in $CHANGED_DIRS; do
     kubectl apply -k "$overlay" --dry-run=server 2>&1 | tail -20
   done
   ```

10. **Policy-as-code** (if `policies/` exists):
    ```bash
    for f in /tmp/new-*.yaml; do
      conftest test "$f" --policy policies/ --combine
    done
    ```

11. **Invoke kustomize-reviewer agent** focusing on:
    - CRITICAL: selector changes, plaintext secrets, unscoped patch targets
    - HIGH: image tag pinning, component version bumps, cross-overlay boundaries
    - MEDIUM: structure, generator hygiene, standard labels

12. **Report** APPROVE / WARNING / BLOCK

## BLOCKING Conditions
- Any change to `spec.selector.matchLabels` on an existing Deployment/StatefulSet
- `secretGenerator.literals:` with production-looking values
- `newTag:` using `latest`/`main`/`master`/`stable`
- Plaintext secret matches in rendered output (non-`valueFrom`)
- `kubectl apply --dry-run=server` fails

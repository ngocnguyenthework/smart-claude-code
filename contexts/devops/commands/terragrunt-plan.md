---
description: Run `terragrunt plan` (or `run-all plan`) with dependency-graph and blast-radius review gating
---

# Terragrunt Plan Review

## Steps

1. **Format check**:
   ```bash
   terragrunt hclfmt --terragrunt-check
   ```

2. **Validate on a clean cache** (tests that `mock_outputs` are correct):
   ```bash
   rm -rf .terragrunt-cache/ */.terragrunt-cache/
   terragrunt run-all validate --terragrunt-non-interactive
   ```

3. **Render dependency graph**:
   ```bash
   terragrunt graph-dependencies > /tmp/tg-graph.dot
   dot -Tsvg /tmp/tg-graph.dot > /tmp/tg-graph.svg || true
   # Show apply order:
   terragrunt run-all plan --terragrunt-non-interactive 2>&1 | grep -E "^--> .*Module"
   ```

4. **Plan everything below the target dir**:
   ```bash
   TARGET_DIR="${1:-.}"
   cd "$TARGET_DIR"
   terragrunt run-all plan \
     --terragrunt-non-interactive \
     --terragrunt-parallelism 4 \
     -out=tfplan \
     2>&1 | tee /tmp/tg-plan.log
   ```

5. **Count changes per module**:
   ```bash
   find "$TARGET_DIR" -name tfplan -exec sh -c '
     CHANGES=$(terragrunt show -json "$1" 2>/dev/null | jq "{
       create: [.resource_changes[] | select(.change.actions[] == \"create\") | .address] | length,
       update: [.resource_changes[] | select(.change.actions[] == \"update\") | .address] | length,
       delete: [.resource_changes[] | select(.change.actions[] == \"delete\") | .address] | length
     }")
     MODULE=$(dirname "$1")
     echo "$MODULE: $CHANGES"
   ' _ {} \;
   ```

6. **Flag destroys loudly**:
   ```bash
   find "$TARGET_DIR" -name tfplan -exec sh -c '
     DESTROYS=$(terragrunt show -json "$1" 2>/dev/null | jq "[.resource_changes[] | select(.change.actions[] == \"delete\")] | length")
     if [ "$DESTROYS" -gt 0 ]; then
       echo "!! $(dirname "$1"): $DESTROYS DESTROY operation(s) !!"
     fi
   ' _ {} \;
   ```

7. **Check for cross-environment dependencies** (should be zero in normal cases):
   ```bash
   grep -rE 'config_path\s*=\s*"\.\./\.\./.*/(prod|staging|dev)' "$TARGET_DIR" || echo "No cross-env deps found"
   ```

8. **Invoke terragrunt-reviewer agent** with the plan output. Focus on:
   - CRITICAL: branch-pinned `source`, missing `prevent_destroy`, unscoped state bucket
   - HIGH: missing mocks, mocks allowing apply, unexpected destroys
   - MEDIUM: run-all parallelism, hook safety, generated files in git

9. **Security scan on rendered Terraform** (optional):
   ```bash
   find "$TARGET_DIR" -path '*/.terragrunt-cache/*/*' -name '*.tf' -exec dirname {} \; | sort -u | \
     xargs -I {} checkov -d {} --quiet --compact
   ```

10. **Report** APPROVE / WARNING / BLOCK

## BLOCKING Conditions
- Any production module source pinned to a branch (not tag/SHA)
- Any `run-all plan` that proposes DESTROY on a resource with `prevent_destroy = true`
- Any module without `mock_outputs` on its `dependency` blocks
- Any plan that references an unauthorized AWS account ID

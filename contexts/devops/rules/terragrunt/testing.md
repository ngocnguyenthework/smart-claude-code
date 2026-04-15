---
paths:
  - "**/terragrunt.hcl"
  - "**/*.hcl"
---
# Terragrunt Testing

> Validation and dependency-graph verification for Terragrunt configurations.

## Pre-Commit

```bash
# Format check
terragrunt hclfmt --terragrunt-check

# Terraform fmt inside each module
terraform fmt -check -recursive modules/

# HCL validation (parses all terragrunt.hcl without initializing providers)
terragrunt run-all validate-inputs --terragrunt-strict-validate
```

## Dependency Graph Verification

```bash
# Render graph
terragrunt graph-dependencies > graph.dot
dot -Tsvg graph.dot > graph.svg

# List in apply order
terragrunt run-all plan --terragrunt-non-interactive 2>&1 | grep "Module"
```

Use the graph to verify:
- No circular dependencies (terragrunt will error, but graph makes it obvious)
- Cross-env references are intentional (prod depending on dev is usually a mistake)
- Bootstrap modules (`iam`, `tfstate`) are root-of-graph

## Per-Module Plan

```bash
# Plan one module
cd live/staging/ap-southeast-1/api
terragrunt plan -out=tfplan
terragrunt show -json tfplan | jq '.resource_changes | length'

# Plan everything below a directory
cd live/staging
terragrunt run-all plan --terragrunt-non-interactive
```

## Mock Outputs Smoke Test

```bash
# Verify that a fresh clone can `validate` without real state
rm -rf .terragrunt-cache/ */.terragrunt-cache/
terragrunt run-all validate --terragrunt-non-interactive
# Expected: passes using mock_outputs
```

## Drift Detection

```bash
# Run in CI on a schedule
terragrunt run-all plan \
  --terragrunt-non-interactive \
  --terragrunt-detect-drift \
  2>&1 | tee drift-report.log

# Fail CI if any resources drift
grep -q "Your infrastructure matches the configuration" drift-report.log || exit 1
```

## `_envcommon` Regression Test

When editing a `_envcommon/*.hcl` file:

```bash
# Re-run validate on every consumer
grep -rl "_envcommon/rds.hcl" live/ | while read f; do
  cd "$(dirname $f)"
  terragrunt validate --terragrunt-non-interactive || echo "FAIL: $f"
  cd -
done
```

## Apply Dry-Run

```bash
# Plan every module, capture outputs, simulate apply
terragrunt run-all plan -out=tfplan --terragrunt-non-interactive

# For each module, ensure destroy count is expected
find . -name tfplan -exec sh -c '
  terragrunt show -json "$1" | jq -r "
    .resource_changes | map(select(.change.actions[] == \"delete\")) | length
  " | awk -v f="$1" "{ if (\$1 > 0) print f\": \"\$1\" DESTROYS\" }"
' _ {} \;
```

## CI Checklist

Before merging a Terragrunt PR:
- [ ] `terragrunt hclfmt --terragrunt-check` passes
- [ ] `terragrunt run-all validate` passes on a clean clone
- [ ] Dependency graph does not regress (no new cross-env edges)
- [ ] `terragrunt run-all plan` completes without errors
- [ ] No unexpected DESTROY operations in plan output
- [ ] Module source pinned to tag or SHA
- [ ] `_envcommon` edits re-validated against all consumers
- [ ] No secrets or real credentials in any `.hcl` file

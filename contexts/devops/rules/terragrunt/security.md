---
paths:
  - "**/terragrunt.hcl"
  - "**/*.hcl"
---
# Terragrunt Security

> Extends [terraform/security.md](../terraform/security.md) with wrapper-specific security rules.

## CRITICAL: Cross-Account State Access

- Each AWS account gets its own state bucket — never share across accounts
- State bucket encryption key MUST be a customer-managed KMS key, not `aws/s3` default
- DynamoDB lock table scoped per account
- Bucket policy denies all public access (`block_public_access` + explicit deny on `Principal: '*'`)

```hcl
# In root terragrunt.hcl, parameterize by account:
remote_state {
  config = {
    bucket         = "myorg-tfstate-${local.account_vars.locals.account_id}"
    dynamodb_table = "tfstate-lock-${local.account_vars.locals.account_id}"
    kms_key_id     = "alias/tfstate-${local.account_vars.locals.account_id}"
    # ...
  }
}
```

## CRITICAL: Assume-Role Isolation

- Every account has its own `TerraformExecutor` IAM role
- Provider generator uses `assume_role` — never rely on ambient credentials
- Executor role trust policy restricts to CI/CD OIDC issuer only
- **Never** hardcode `access_key` / `secret_key` in HCL

```hcl
generate "provider" {
  contents = <<EOF
provider "aws" {
  assume_role {
    role_arn     = "arn:aws:iam::${local.account_id}:role/TerraformExecutor"
    session_name = "terragrunt-${get_env("GITHUB_RUN_ID", "local")}"
  }
}
EOF
}
```

## CRITICAL: `prevent_destroy` on Critical State Infra

- The state bucket itself and DynamoDB lock table must be in a bootstrap module with `lifecycle { prevent_destroy = true }`
- Include those resources with `skip = true` on the corresponding `terragrunt.hcl` once bootstrapped

## HIGH: Secrets Never in HCL

- `TF_VAR_*` environment variables for secrets (e.g. `TF_VAR_db_password`)
- For cross-module secret passing, use `dependency.outputs` where the upstream module fetches from Secrets Manager / Parameter Store
- **Never** `read_terragrunt_config` on a file containing secrets — it gets baked into state plans
- `.envrc` and any file containing `TF_VAR_*` secrets must be in `.gitignore`

## HIGH: Mock Outputs Don't Leak Real Values

- `mock_outputs` should be clearly fake: `"vpc-mock"`, `"subnet-mock"` — not real-looking values
- `mock_outputs_allowed_terraform_commands` must NOT include `apply`
- Mocks exist for `validate` and `plan`, nothing more

```hcl
# CORRECT
dependency "rds" {
  config_path = "../rds"
  mock_outputs = { endpoint = "mock.rds.local" }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

# WRONG — allows apply to use fake data
dependency "rds" {
  config_path = "../rds"
  mock_outputs = { endpoint = "mock.rds.local" }
  mock_outputs_allowed_terraform_commands = ["validate", "plan", "apply"]
}
```

## HIGH: `run-all` Blast Radius

- `terragrunt run-all apply` in production MUST be gated behind CI approval
- Prefer `--terragrunt-include-dir=<path>` or run per-module locally
- Never run `run-all destroy` without a pre-approved destroy plan
- Consider `--terragrunt-parallelism=1` in prod to surface errors before they cascade

## MEDIUM: Hook Execution Paths

- Hook `execute` lists must use fully-resolved paths — `${get_terragrunt_dir()}/...` or `${get_path_to_repo_root()}/...`
- **Never** `execute = ["sh", "-c", "curl ..."]` that fetches remote scripts at plan/apply time
- Hook failures on `apply` should still block; set `run_on_error = false` unless you know why

## MEDIUM: Generated Files in `.gitignore`

- `provider.tf` and `backend.tf` are generated — add to `.gitignore`
- Don't commit `.terragrunt-cache/` — add to `.gitignore`
- Don't commit `terraform.tfplan` or `.tfstate` files

```gitignore
# .gitignore
.terragrunt-cache/
*.tfplan
*.tfstate
*.tfstate.*
provider.tf
backend.tf
.envrc
```

## Scanning Commands

```bash
# HCL formatting
terragrunt hclfmt --terragrunt-check

# Terraform validation via terragrunt (per-module)
terragrunt run-all validate --terragrunt-non-interactive

# Security scan on underlying Terraform
terragrunt run-all plan --terragrunt-non-interactive -out=tfplan
find . -name tfplan -exec checkov -f {} --quiet \;

# Detect drift across all modules
terragrunt run-all plan --terragrunt-detect-drift
```

---
paths:
  - "**/*.tf"
  - "**/*.tfvars"
---
# Terraform Coding Style

> Extends [common/coding-style.md](../common/coding-style.md) with Terraform/HCL-specific conventions.

## File Structure

Every Terraform root module must contain:

```
infra/
  main.tf           # Resource definitions
  variables.tf      # Input variable declarations
  outputs.tf        # Output value declarations
  providers.tf      # Provider configuration
  versions.tf       # Required providers and Terraform version
  backend.tf        # State backend configuration
  locals.tf         # Local values (optional)
  data.tf           # Data sources (optional)
  modules/
    vpc/
      main.tf
      variables.tf
      outputs.tf
      README.md
```

## Naming Conventions

- Resources: `snake_case`, descriptive (`aws_s3_bucket.app_assets`, not `aws_s3_bucket.bucket1`)
- Variables: `snake_case` with `description` and `type` always specified
- Outputs: `snake_case`, prefixed by resource type if ambiguous
- Modules: `snake_case` directory names
- Tags: Consistent tagging strategy across all resources

```hcl
# CORRECT: Descriptive naming
resource "aws_security_group" "api_server" {
  name        = "${var.project}-${var.environment}-api-sg"
  description = "Security group for API servers"
  vpc_id      = module.vpc.vpc_id

  tags = local.common_tags
}

# WRONG: Vague naming
resource "aws_security_group" "sg1" {
  name = "sg1"
}
```

## Variable Definitions

- Always include `description`, `type`, and `default` (if applicable)
- Use `validation` blocks for constraints
- Mark sensitive variables with `sensitive = true`

```hcl
variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}
```

## Resource Organization

- Group related resources in the same file or use descriptive filenames (`networking.tf`, `compute.tf`, `database.tf`)
- Use `locals` for computed values and DRY tag maps
- Prefer `for_each` over `count` for named resources
- Use `dynamic` blocks sparingly — only when the block count truly varies

```hcl
locals {
  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Team        = var.team
  }
}
```

## Module Composition

- Reusable modules in `modules/` with README.md
- Pin module versions (registry or git tags)
- Pass only necessary variables — don't forward everything
- Outputs should expose IDs, ARNs, and endpoints needed by consumers

```hcl
module "vpc" {
  source = "./modules/vpc"

  cidr_block  = var.vpc_cidr
  environment = var.environment
  az_count    = var.az_count
}
```

## Formatting

- Run `terraform fmt` before every commit
- Use `terraform validate` in CI
- One blank line between resource blocks
- Align `=` signs within a block for readability

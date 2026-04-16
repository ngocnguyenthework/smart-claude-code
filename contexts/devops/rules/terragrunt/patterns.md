---
paths:
  - "**/terragrunt.hcl"
  - "**/*.hcl"
---
# Terragrunt Patterns

> Extends [terraform/patterns.md](../terraform/patterns.md) with Terragrunt DRY/composition patterns.

## Shared Backend Config (Root)

```hcl
# infra/terragrunt.hcl
remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket         = "myorg-tfstate-${get_env("ACCOUNT_ID")}"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = "ap-southeast-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
provider "aws" {
  region = "${local.region}"
  default_tags {
    tags = ${jsonencode(local.common_tags)}
  }
  assume_role {
    role_arn = "arn:aws:iam::${local.account_id}:role/TerraformExecutor"
  }
}
EOF
}

locals {
  account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl"))
  region_vars  = read_terragrunt_config(find_in_parent_folders("region.hcl"))
  env_vars     = read_terragrunt_config(find_in_parent_folders("env.hcl"))

  account_id = local.account_vars.locals.account_id
  region     = local.region_vars.locals.region
  env        = local.env_vars.locals.env

  common_tags = {
    Environment = local.env
    ManagedBy   = "terragrunt"
    Account     = local.account_vars.locals.account_name
  }
}

inputs = merge(
  local.account_vars.locals,
  local.region_vars.locals,
  local.env_vars.locals,
  { common_tags = local.common_tags }
)
```

## Layer Hierarchy

- `account.hcl` — one per AWS account: account_id, account_name, OIDC issuer
- `region.hcl` — one per region: region, availability zones
- `env.hcl` — one per environment: env, vpc_cidr, default_instance_class
- Each child inherits all three via `read_terragrunt_config`

```
live/
  account.hcl              # account-level scope
  dev/
    env.hcl                # env-level scope
    ap-southeast-1/
      region.hcl           # region-level scope
      vpc/terragrunt.hcl   # inherits all three
```

## `_envcommon` Shared Service Config

```hcl
# _envcommon/ecs-service.hcl
terraform {
  source = "git::git@github.com:org/terraform-aws-modules.git//ecs-service?ref=v3.1.0"
}

inputs = {
  cpu              = 256
  memory           = 512
  desired_count    = 2
  enable_autoscale = true
}
```

```hcl
# live/prod/ap-southeast-1/api/terragrunt.hcl
include "root" {
  path = find_in_parent_folders()
}

include "envcommon" {
  path           = find_in_parent_folders("_envcommon/ecs-service.hcl")
  expose         = true
  merge_strategy = "deep"
}

inputs = {
  service_name  = "api"
  cpu           = 1024    # override envcommon default
  desired_count = 6
}
```

## Dependency Graph

Terragrunt resolves `dependency` blocks to compute apply order for `run-all`:

```bash
terragrunt run-all plan   # plans every module bottom-up
terragrunt run-all apply  # applies in dependency order
terragrunt graph-dependencies | dot -Tpng > graph.png
```

```hcl
# rds/terragrunt.hcl depends on vpc
dependency "vpc" {
  config_path = "../vpc"
}

inputs = {
  vpc_id     = dependency.vpc.outputs.vpc_id
  subnet_ids = dependency.vpc.outputs.private_subnet_ids
}
```

## Conditional Inputs

Use `try` and `coalesce` rather than deeply-nested ternaries:

```hcl
inputs = {
  enable_monitoring = try(local.env_vars.locals.enable_monitoring, true)
  instance_class    = coalesce(
    try(local.env_vars.locals.rds_instance_class, null),
    "db.t4g.medium"
  )
}
```

## Hooks

- `before_hook` — generate dynamic tfvars before plan/apply
- `after_hook` — slack notification on apply success/failure
- Keep hooks idempotent; guard with `commands = ["apply"]` to limit scope

```hcl
terraform {
  after_hook "notify" {
    commands = ["apply"]
    execute  = ["bash", "-c", "${get_terragrunt_dir()}/../scripts/notify.sh"]
    run_on_error = true
  }
}
```

## Common Pitfalls

- **Don't** nest `terragrunt.hcl` inside `modules/` — modules must stay pure Terraform
- **Don't** use `include` without `expose = true` if you want to reference included values in `locals`
- **Don't** mix `terragrunt run-all` with partial `--terragrunt-include-dir` without understanding dependency graph — can apply out of order
- **Do** run `terragrunt hclfmt` and commit formatted files

---
paths:
  - "**/terragrunt.hcl"
  - "**/*.hcl"
---
# Terragrunt Coding Style

> Extends [terraform/coding-style.md](../terraform/coding-style.md) with Terragrunt-wrapper conventions.

## Repo Layout

```
infra/
  terragrunt.hcl                 # Root config: backend, provider generator, global inputs
  _envcommon/                    # Shared per-service configs, re-used across envs
    vpc.hcl
    rds.hcl
    ecs-service.hcl
  live/
    dev/
      ap-southeast-1/
        vpc/terragrunt.hcl
        rds/terragrunt.hcl
    staging/
      ap-southeast-1/
        ...
    prod/
      ap-southeast-1/
        ...
  modules/                       # Pure Terraform modules (NO terragrunt.hcl)
    vpc/
    rds/
    ecs-service/
```

## Root `terragrunt.hcl`

- Single source of truth for `remote_state`, `generate "provider"`, and globally-shared `inputs`
- Use `read_terragrunt_config(find_in_parent_folders())` in children to inherit
- Keep root file under 100 lines — push service-specific config to `_envcommon/`

## Child `terragrunt.hcl`

Each leaf (dev/vpc, prod/rds, etc.) follows this order:

```hcl
include "root" {
  path = find_in_parent_folders()
}

include "envcommon" {
  path           = find_in_parent_folders("_envcommon/rds.hcl")
  expose         = true
  merge_strategy = "deep"
}

terraform {
  source = "${get_path_to_repo_root()}//modules/rds?ref=v1.4.0"
}

dependency "vpc" {
  config_path = "../vpc"
  mock_outputs = {
    vpc_id             = "vpc-mock"
    private_subnet_ids = ["subnet-mock"]
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

inputs = {
  environment       = "prod"
  vpc_id            = dependency.vpc.outputs.vpc_id
  subnet_ids        = dependency.vpc.outputs.private_subnet_ids
  instance_class    = "db.r6g.large"
  multi_az          = true
}
```

Order: `include` → `terraform { source }` → `dependency` → `inputs`.

## Source Pinning

- Always pin module source to a **tag or SHA**, never a branch
- Use `tfr://` or git-ref syntax with `?ref=vX.Y.Z`
- Reference local modules only when rapidly iterating in dev; pin before merging to prod

```hcl
# CORRECT
source = "git::git@github.com:org/terraform-modules.git//vpc?ref=v2.3.1"

# WRONG: no ref pin
source = "git::git@github.com:org/terraform-modules.git//vpc"
```

## `find_in_parent_folders` Usage

- `find_in_parent_folders()` (no args) finds the nearest `terragrunt.hcl` up the tree — use for root include
- `find_in_parent_folders("_envcommon/X.hcl")` finds a specific file — use for shared service configs
- **Never** hardcode absolute paths — breaks portability between machines

## `dependency` Blocks

- Every `dependency` MUST include `mock_outputs` AND `mock_outputs_allowed_terraform_commands`
- Without mocks, `terragrunt plan` fails on clean clone before `apply` order resolves
- Allowed commands typically: `["validate", "plan", "init"]` — never include `apply`

## Inputs Composition

- Prefer `merge(local.common, local.env_specific)` over deeply-nested ternaries
- Use `local` blocks for derived values; `inputs` should be mostly declarative
- Run `terragrunt hclfmt --terragrunt-check` before commit

## Naming

- Directories mirror resource hierarchy: `live/<env>/<region>/<service>`
- File always named `terragrunt.hcl` — no other names (except `_envcommon/*.hcl`)
- State keys auto-derived from path — don't set `key` manually in child configs

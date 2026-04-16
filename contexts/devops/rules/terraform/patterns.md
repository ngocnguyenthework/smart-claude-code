---
paths:
  - "**/*.tf"
---
# Terraform Patterns

> Extends [common/patterns.md](../common/patterns.md) with Terraform-specific architectural patterns.

## Module Composition

Reusable modules encapsulate infrastructure components:

```hcl
# Root module composes child modules
module "vpc" {
  source      = "./modules/vpc"
  cidr_block  = var.vpc_cidr
  environment = var.environment
}

module "rds" {
  source          = "./modules/rds"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids
  environment     = var.environment
  instance_class  = var.db_instance_class
}

module "ecs" {
  source          = "./modules/ecs"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids
  db_endpoint     = module.rds.endpoint
  environment     = var.environment
}
```

## Remote State Data Sources

Reference outputs from other Terraform configurations:

```hcl
data "terraform_remote_state" "networking" {
  backend = "s3"
  config = {
    bucket = "myproject-terraform-state"
    key    = "networking/terraform.tfstate"
    region = "ap-southeast-1"
  }
}

# Use outputs
resource "aws_instance" "app" {
  subnet_id = data.terraform_remote_state.networking.outputs.private_subnet_id
}
```

## Environment Separation

Prefer directory-based separation over workspaces for clarity:

```
infra/
  environments/
    dev/
      main.tf          # Module calls with dev values
      terraform.tfvars
      backend.tf       # Dev state bucket
    staging/
      main.tf
      terraform.tfvars
      backend.tf
    prod/
      main.tf
      terraform.tfvars
      backend.tf
  modules/
    vpc/
    ecs/
    rds/
```

## Dynamic Resources

Use `for_each` for named resources (prefer over `count`):

```hcl
variable "services" {
  type = map(object({
    cpu    = number
    memory = number
    port   = number
  }))
}

resource "aws_ecs_service" "service" {
  for_each = var.services

  name            = each.key
  task_definition = aws_ecs_task_definition.task[each.key].arn
  desired_count   = 2
}
```

## Conditional Resources

```hcl
variable "enable_monitoring" {
  type    = bool
  default = true
}

resource "aws_cloudwatch_dashboard" "main" {
  count = var.enable_monitoring ? 1 : 0
  # ...
}
```

## Refactoring with Moved Blocks

Rename resources without destroy/recreate:

```hcl
moved {
  from = aws_instance.web_server
  to   = aws_instance.api_server
}
```

## Common Tag Pattern

```hcl
locals {
  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Team        = var.team
    CostCenter  = var.cost_center
  }
}

# Apply to all resources
resource "aws_instance" "app" {
  tags = merge(local.common_tags, {
    Name = "${var.project}-${var.environment}-app"
    Role = "application"
  })
}
```

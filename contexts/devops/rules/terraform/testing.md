---
paths:
  - "**/*.tf"
---
# Terraform Testing

> Extends [common/testing.md](../common/testing.md) with Terraform/IaC-specific validation and testing.

## Validation Pipeline

Run in this order before any merge or apply:

```bash
# 1. Format check
terraform fmt -check -recursive

# 2. Syntax validation
terraform validate

# 3. Linting (with AWS plugin)
tflint --init
tflint --recursive

# 4. Security/compliance scanning
checkov -d . --quiet --compact

# 5. Cost estimation
infracost breakdown --path . --format table
```

## Plan Review

- Always generate a plan before apply: `terraform plan -out=tfplan`
- Review plan output for unexpected destroys or replacements
- Check blast radius (number of resources changed)
- In CI: `terraform plan` on every PR, apply only on merge to main

```bash
# Generate plan
terraform plan -out=tfplan

# Show plan in readable format
terraform show tfplan

# Show plan as JSON for automated analysis
terraform show -json tfplan | jq '.resource_changes[] | {action: .change.actions, address: .address}'
```

## Integration Testing with Terratest

For critical modules, write Go-based tests:

```go
func TestVpcModule(t *testing.T) {
    terraformOptions := &terraform.Options{
        TerraformDir: "../modules/vpc",
        Vars: map[string]interface{}{
            "cidr_block":  "10.0.0.0/16",
            "environment": "test",
        },
    }
    defer terraform.Destroy(t, terraformOptions)
    terraform.InitAndApply(t, terraformOptions)

    vpcId := terraform.Output(t, terraformOptions, "vpc_id")
    assert.NotEmpty(t, vpcId)
}
```

## Policy as Code

Use OPA/Conftest for custom policy enforcement:

```bash
# conftest for Terraform plan JSON
conftest test tfplan.json --policy policy/
```

Example policy (Rego):

```rego
# policy/terraform.rego
deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_s3_bucket"
  not resource.change.after.server_side_encryption_configuration
  msg := sprintf("S3 bucket %s must have encryption enabled", [resource.address])
}
```

## Drift Detection

- Schedule `terraform plan` in CI (daily or weekly)
- Alert on any planned changes (indicates drift from desired state)
- Investigate manual console changes before applying

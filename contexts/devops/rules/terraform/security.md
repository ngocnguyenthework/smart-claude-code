---
paths:
  - "**/*.tf"
  - "**/*.tfvars"
---
# Terraform Security

> Extends [common/security.md](../common/security.md) with Terraform/IaC-specific security rules. Enforces patterns from the-security-guide.md.

## CRITICAL: Secrets Management

- **NEVER** hardcode secrets in `.tf` or `.tfvars` files
- Use `sensitive = true` on all secret variables and outputs
- Use AWS Secrets Manager, SSM Parameter Store, or HashiCorp Vault
- Use `TF_VAR_` environment variables for CI/CD secrets
- Add `*.tfvars` to `.gitignore` if it contains any values

```hcl
# WRONG: Hardcoded secret
resource "aws_db_instance" "main" {
  password = "my-secret-password"
}

# CORRECT: From variable marked sensitive
resource "aws_db_instance" "main" {
  password = var.db_password
}

# CORRECT: From Secrets Manager
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "prod/rds/master-password"
}
```

## State File Security

- Remote backend with encryption (S3 + KMS)
- State locking with DynamoDB
- Restrict state bucket access to CI/CD and admin roles only
- Never commit `*.tfstate` files
- Enable S3 bucket versioning for state recovery

```hcl
terraform {
  backend "s3" {
    bucket         = "myproject-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "ap-southeast-1"
    encrypt        = true
    kms_key_id     = "alias/terraform-state"
    dynamodb_table = "terraform-state-lock"
  }
}
```

## IAM — Least Privilege

- **NEVER** use `Action: "*"` or `Resource: "*"` in IAM policies
- Scope actions to specific services and operations
- Scope resources to specific ARNs
- Use IAM conditions where possible (source IP, MFA, tags)
- Use permission boundaries for delegated roles

```hcl
# WRONG: Overly permissive
resource "aws_iam_policy" "app" {
  policy = jsonencode({
    Statement = [{
      Effect   = "Allow"
      Action   = "*"
      Resource = "*"
    }]
  })
}

# CORRECT: Scoped permissions
resource "aws_iam_policy" "app" {
  policy = jsonencode({
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject"]
      Resource = "${aws_s3_bucket.app_assets.arn}/*"
    }]
  })
}
```

## Encryption

- Enable encryption at rest for ALL storage resources (RDS, S3, EBS, EFS, DynamoDB)
- Enforce HTTPS/TLS in transit
- Use KMS customer-managed keys for production workloads

```hcl
resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.app_assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.app.arn
    }
  }
}
```

## Network Security

- No `0.0.0.0/0` ingress except ports 80/443 on public ALB
- Use VPC endpoints for AWS service access (S3, DynamoDB, etc.)
- Enable VPC Flow Logs
- Private subnets for all compute and database resources
- Security group rules: explicit, minimal, documented

## Lifecycle Protection

- Use `prevent_destroy` on critical resources (databases, state buckets)
- Use `create_before_destroy` for zero-downtime updates

```hcl
resource "aws_db_instance" "main" {
  lifecycle {
    prevent_destroy = true
  }
}
```

## Security Scanning

```bash
# Must pass before merge
terraform fmt -check -recursive
terraform validate
tflint --init && tflint
checkov -d . --quiet
# Cost impact
infracost breakdown --path .
```

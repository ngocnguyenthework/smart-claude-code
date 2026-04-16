---
paths:
  - "**/*.tf"
---
# AWS Security

> Extends [common/security.md](../common/security.md) with AWS-specific security best practices. Enforces patterns from the-security-guide.md.

## IAM Best Practices

- Least privilege: scope actions AND resources to minimum needed
- Use IAM conditions (source IP, MFA, tag-based)
- Use permission boundaries for delegated roles
- Separate roles per service/workload
- Review with `aws iam get-account-authorization-details`

```hcl
# Permission boundary
resource "aws_iam_role" "app" {
  permissions_boundary = aws_iam_policy.boundary.arn
}

# Condition-based access
resource "aws_iam_policy" "deploy" {
  policy = jsonencode({
    Statement = [{
      Effect    = "Allow"
      Action    = ["ecs:UpdateService"]
      Resource  = aws_ecs_service.app.id
      Condition = {
        StringEquals = {
          "aws:RequestedRegion" = "ap-southeast-1"
        }
      }
    }]
  })
}
```

## VPC Design

- Three-tier subnets: public (ALB), private (compute), isolated (database)
- NAT Gateway for private subnet outbound
- VPC Endpoints for AWS services (S3, DynamoDB, ECR, etc.)
- VPC Flow Logs to CloudWatch or S3

```hcl
# VPC Endpoints reduce NAT costs and improve security
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id
}
```

## Encryption Everywhere

| Service | Encryption Method |
|---------|-------------------|
| RDS | `storage_encrypted = true` + KMS |
| S3 | SSE-KMS or SSE-S3 |
| EBS | `encrypted = true` + KMS |
| EFS | `encrypted = true` |
| DynamoDB | AWS-owned or customer-managed KMS |
| Secrets Manager | Automatic KMS encryption |
| ALB | ACM certificate for HTTPS |

## Logging and Monitoring

- **CloudTrail**: Enabled in all regions, S3 + CloudWatch
- **VPC Flow Logs**: All VPCs, reject and accept logs
- **Config**: Track resource configuration changes
- **GuardDuty**: Threat detection (enable in all accounts)
- **Security Hub**: Centralized security findings

```hcl
resource "aws_cloudtrail" "main" {
  name                       = "main-trail"
  s3_bucket_name             = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail      = true
  enable_log_file_validation = true
}
```

## S3 Security

- Block all public access by default
- Enable versioning for critical buckets
- Use lifecycle policies for cost management
- Enable server access logging

```hcl
resource "aws_s3_bucket_public_access_block" "all" {
  bucket = aws_s3_bucket.app.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

## Security Groups

- Default deny: no rules = no traffic
- Minimal ingress: only required ports from required sources
- Reference security groups instead of CIDRs where possible
- Document every rule with `description`

```hcl
resource "aws_security_group_rule" "api_from_alb" {
  type                     = "ingress"
  from_port                = 8080
  to_port                  = 8080
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  security_group_id        = aws_security_group.api.id
  description              = "Allow API traffic from ALB"
}
```

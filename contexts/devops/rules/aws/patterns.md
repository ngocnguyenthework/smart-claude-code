---
paths:
  - "**/*.tf"
---
# AWS Architecture Patterns

> Extends [common/patterns.md](../common/patterns.md) with AWS Well-Architected patterns.

## Three-Tier Web Application

Standard pattern for NestJS/FastAPI deployments:

```
Internet → CloudFront → ALB (public subnet)
                          ↓
                   ECS Fargate / EKS (private subnet)
                          ↓
                   RDS PostgreSQL (isolated subnet)
```

```hcl
# ALB → ECS → RDS
module "alb"  { source = "./modules/alb"  }
module "ecs"  { source = "./modules/ecs"  }
module "rds"  { source = "./modules/rds"  }
```

## ECS Fargate vs EKS Decision

| Factor | ECS Fargate | EKS |
|--------|-------------|-----|
| Complexity | Low | High |
| Cost (small) | Lower | Higher (control plane fee) |
| Cost (large) | Higher per task | Lower per pod |
| Portability | AWS-locked | Multi-cloud ready |
| Scaling | Simple, fast | Flexible, powerful |
| Best for | < 20 services | > 20 services, K8s expertise |

## RDS vs Aurora

| Factor | RDS PostgreSQL | Aurora PostgreSQL |
|--------|---------------|-------------------|
| Cost | Lower base | Higher base, better at scale |
| Storage | Manual provisioning | Auto-scaling (10GB-128TB) |
| Read replicas | Up to 5 | Up to 15, faster replication |
| Failover | 60-120s | < 30s |
| Best for | Dev/staging, small prod | Large production workloads |

## Event-Driven Architecture

```
Producer → SQS/SNS/EventBridge → Consumer
```

- **SQS**: Point-to-point, guaranteed delivery, dead-letter queues
- **SNS**: Fan-out to multiple subscribers
- **EventBridge**: Event routing with rules, schema registry

```hcl
# SQS with DLQ for reliable processing
resource "aws_sqs_queue" "orders" {
  name                      = "${var.project}-orders"
  visibility_timeout_seconds = 300
  message_retention_seconds  = 1209600  # 14 days
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn
    maxReceiveCount     = 3
  })
}
```

## Cost Optimization Patterns

- **Spot Instances**: Up to 90% savings for fault-tolerant workloads
- **Savings Plans**: 1-3 year commit for predictable workloads
- **S3 Intelligent Tiering**: Auto-optimize storage costs
- **RDS Reserved**: 1-3 year commit for production databases
- **NAT Gateway alternatives**: VPC endpoints reduce NAT traffic costs
- **Right-sizing**: Use Compute Optimizer recommendations

## Caching Strategy

```
Client → CloudFront (edge cache)
           ↓
         ALB → App → ElastiCache Redis (data cache)
                        ↓
                      RDS (database)
```

- CloudFront: Static assets, API responses with appropriate cache headers
- ElastiCache Redis: Session store, frequently accessed queries, rate limiting
- Application-level: Response caching with TTL

## Disaster Recovery Patterns

| Strategy | RTO | RPO | Cost |
|----------|-----|-----|------|
| Backup & Restore | Hours | Hours | $ |
| Pilot Light | Minutes | Minutes | $$ |
| Warm Standby | Minutes | Seconds | $$$ |
| Multi-Active | Near-zero | Near-zero | $$$$ |

For most applications: **Pilot Light** (automated backups + minimal standby infra in DR region).

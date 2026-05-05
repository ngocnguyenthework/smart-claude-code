---
name: aws-cost-optimization
description: AWS FinOps workflow — right-sizing EKS / Karpenter nodes, RDS instance class + Multi-AZ + cross-region replicas, ElastiCache, NAT gateway data charges, ECR lifecycle, CloudWatch log retention, S3 lifecycle, Reserved Instances vs Savings Plans. Use when reviewing the monthly bill, planning a new module, or running infracost on a Terraform / Terragrunt plan.

---

# AWS Cost Optimization

## When to Use

- Monthly bill spike — find the culprit
- New module or service planned — predict delta before merge
- Right-sizing existing RDS / EKS / ElastiCache / EC2
- ECR / S3 / CloudWatch retention review
- Reserved Instance / Savings Plan decision
- Reviewing a Terraform / Terragrunt PR with `/aws-cost-check`

## Core Cost Drivers (typical EKS-on-AWS workload)

| Resource | Notes |
|---|---|
| EKS control plane | flat ~$73/mo per cluster |
| EC2 / Karpenter nodes | biggest variable; right-size + Spot for stateless |
| RDS | Multi-AZ + read replica + cross-region replica multiplies base $ |
| ElastiCache | small instances are cheap individually but multi-replica HA adds up |
| **NAT Gateway** | $32/mo each + $0.045/GB processed — **biggest hidden cost** |
| ALB / NLB | per-LB hourly + LCU |
| CloudWatch Logs | retention policy is the lever; "Never expire" balloons |
| CloudTrail | base trail free; extra trails + S3 retention cost |
| GuardDuty | per-event; low usually but spikes during noise |
| ECR | only matters without lifecycle policy |
| S3 | datasets + log archives — Glacier lifecycle for cold |

## Right-Sizing Workflow (monthly)

1. **Inventory + actuals (Compute Optimizer)**:

```bash
aws compute-optimizer get-ec2-instance-recommendations --region <region> --profile <profile>
aws compute-optimizer get-rds-database-recommendations --region <region> --profile <profile>
```

2. **Karpenter consolidation check** (if using Karpenter):

```bash
kubectl get nodepool -o wide
kubectl describe nodepool <pool> | grep -A3 Disruption
```

Verify stateless pools actually scale down at idle (check `kubectl get nodes` over a 24h window).

3. **Pod request vs actual**:

```bash
kubectl top pods -A --containers --sort-by=cpu | head -30
kubectl top pods -A --containers --sort-by=memory | head -30
```

If 80% of services request ≥2x what they use, lower requests → autoscaler packs more pods per node → fewer nodes.

4. **NAT Gateway data transfer**:

```bash
aws cloudwatch get-metric-statistics --namespace AWS/NATGateway --metric-name BytesOutToDestination \
  --dimensions Name=NatGatewayId,Value=<id> --start-time $(date -u -d '7 days ago' +%FT%T) \
  --end-time $(date -u +%FT%T) --period 86400 --statistics Sum \
  --region <region> --profile <profile>
```

If a workload is talking to S3 / ECR / Secrets Manager via NAT instead of VPC endpoints — biggest single win. See "VPC Endpoints" below.

## Top Wins (in order of payback)

### 1. VPC Endpoints for S3 / ECR / Secrets Manager

Pods pulling from ECR + reading S3 + fetching secrets via NAT pay NAT data charges every time. Add a Gateway endpoint for S3 (free) and Interface endpoints for ECR (api + dkr), Secrets Manager, STS, KMS. Interface endpoints cost ~$7/mo each but typically pay back within a week.

```hcl
# terraform module shape
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = var.vpc_id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = var.private_route_table_ids
}
```

### 2. Graviton (t4g / c7g / m7g / r7g) Where Possible

ARM-based instances are typically 15–25% cheaper at equivalent perf. Migrate RDS classes (`db.t3.*` → `db.t4g.*`), EC2 nodes, and Lambda runtimes that have ARM builds. RDS migration: snapshot → restore as t4g → cutover.

### 3. Spot for Stateless Karpenter Pools

Stateless workloads tolerate 2-min Karpenter drain. Spot gives 70%+ EC2 savings.

```yaml
spec:
  template:
    spec:
      requirements:
        - key: karpenter.sh/capacity-type
          operator: In
          values: [spot, on-demand]    # spot preferred when available
```

Keep stateful pools (databases-in-cluster, vector DBs, anything with persistent disk) on-demand.

### 4. RDS Cross-Region Replica Audit

Cross-region replicas cost source-instance + cross-region transfer (~$0.02/GB). Verify the replica is actually used — DR-only with RPO ≥ 1h doesn't justify Aurora Global Database; a single async read replica is enough.

### 5. CloudWatch Log Retention

Default "Never expire" is the silent killer. Set retention per log group: 7 days for app logs, 30 days for VPC Flow / WAF, 90 days for audit if compliance allows. Use a Terraform module to set it on every new log group.

### 6. ECR Lifecycle (always-on)

Without lifecycle policy, ECR repos accumulate forever. Default policy: keep N most recent semver tags + N most recent untagged images, expire the rest.

```bash
aws ecr get-lifecycle-policy --repository-name <repo> --region <region>
```

Verify every ECR repo has one.

### 7. Reserved Instances / Savings Plans

Compute Savings Plan covers EC2 + Fargate + Lambda. Commit only to *steady-state* (system services + monitoring), let Spot/on-demand handle peaks. Avoid 3-year commitments on a stack still evolving — 1-year no-upfront is the safe default.

## Cost Anomaly — Quick Triage

```bash
# Last 30 days by service
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d '30 days ago' +%F),End=$(date -u +%F) \
  --granularity DAILY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region us-east-1 --profile <profile>

# By tag
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d '7 days ago' +%F),End=$(date -u +%F) \
  --granularity DAILY --metrics UnblendedCost \
  --group-by Type=TAG,Key=<tag-key> --region us-east-1 --profile <profile>
```

`ce` API only available in `us-east-1` regardless of resource region. Tag every resource with `project`, `env`, `owner` so this report is meaningful.

## Pre-Merge Cost Check

For any Terraform / Terragrunt PR adding/changing AWS resources:

```bash
cd <module-dir>
terragrunt run-all plan -out plan.out
terragrunt show -json plan.out > plan.json
infracost breakdown --path plan.json
```

Set a per-PR threshold (e.g. > $50/mo to prod) — any PR over should surface trade-offs (right-sizing, spot, endpoint reuse) in the PR description before merge.

## Anti-Patterns

- New NAT Gateway added without VPC endpoints for S3 / ECR / Secrets Manager
- RDS instance class bumped without checking Compute Optimizer
- New ElastiCache cluster without snapshot retention bound (defaults can balloon)
- Log retention left at "Never expire"
- Spot rejected for stateless pools without measurement
- ECR repo created without lifecycle policy
- 3-year RI / SP committed for a workload still evolving

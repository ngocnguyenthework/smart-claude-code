---
description: Estimate AWS cost impact of Terraform changes using infracost
---

# AWS Cost Check

## Steps

1. **Check infracost installation**:
   ```bash
   infracost --version 2>/dev/null || echo "Install: brew install infracost && infracost auth login"
   ```

2. **Generate cost breakdown**:
   ```bash
   infracost breakdown --path . --format table
   ```

3. **Compare with baseline** (if previous state exists):
   ```bash
   # Generate baseline from current state
   infracost breakdown --path . --format json --out-file /tmp/infracost-base.json

   # After changes, generate diff
   infracost diff --path . --compare-to /tmp/infracost-base.json --format table
   ```

4. **Analyze the cost report**:
   - Total monthly estimate
   - Cost per resource type
   - Resources with highest cost
   - Cost changes from modifications

5. **Flag cost concerns**:
   - Monthly cost increase > 10% — **WARNING**
   - Monthly cost increase > 50% — **CRITICAL**, suggest review
   - New NAT Gateway ($32+/mo) — suggest VPC endpoints alternative
   - Large instance types — suggest Savings Plans or Reserved Instances
   - Multiple idle resources — suggest cleanup

6. **Suggest optimizations**:
   - Right-sizing (Compute Optimizer recommendations)
   - VPC Endpoints to reduce NAT costs
   - S3 lifecycle policies
   - Reserved/Spot instances where applicable
   - Graviton instances (20% cost savings)

## Output Format
```
## AWS Cost Analysis

### Monthly Estimate: $X,XXX
### Change from Baseline: +$XXX (+XX%)

### Top Cost Resources
| Resource | Monthly Cost | Notes |
|----------|-------------|-------|

### Optimization Opportunities
1. [Suggestion] — Estimated savings: $XX/mo

### Verdict: [OK / WARNING / REVIEW NEEDED]
```

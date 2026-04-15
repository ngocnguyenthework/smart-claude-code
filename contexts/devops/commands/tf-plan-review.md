---
description: Run terraform plan and review changes for safety, security, and blast radius
---

# Terraform Plan Review

## Steps

1. **Validate first**:
   ```bash
   terraform fmt -check -recursive
   terraform validate
   ```

2. **Generate plan**:
   ```bash
   terraform plan -out=tfplan
   ```

3. **Parse plan output** and count changes:
   ```bash
   terraform show -json tfplan | jq '{
     create: [.resource_changes[] | select(.change.actions[] == "create") | .address],
     update: [.resource_changes[] | select(.change.actions[] == "update") | .address],
     delete: [.resource_changes[] | select(.change.actions[] == "delete") | .address],
     replace: [.resource_changes[] | select(.change.actions | contains(["delete","create"])) | .address]
   }'
   ```

4. **Invoke terraform-reviewer agent** on the plan output with focus on:
   - Blast radius (count of affected resources)
   - Any DESTROY or REPLACE operations (flag prominently)
   - Security violations (IAM wildcards, public access, missing encryption)
   - Shared infrastructure impact (VPC, IAM, DNS changes)

5. **Run security scan**:
   ```bash
   checkov -d . --quiet --compact
   ```

6. **Check cost impact** (if infracost available):
   ```bash
   infracost breakdown --path . --format table
   ```

7. **Report** with clear APPROVE / WARNING / BLOCK verdict

## BLOCKING Conditions
- Any resource DESTROY in production without explicit confirmation
- IAM policy with wildcard Action or Resource
- Secrets found in .tf or .tfvars files
- Security group with 0.0.0.0/0 on non-80/443 ports

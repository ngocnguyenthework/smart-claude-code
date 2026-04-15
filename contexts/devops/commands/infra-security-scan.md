---
description: Run security scanning across all IaC — Terraform, K8s, Docker
---

# Infrastructure Security Scan

## Steps

1. **Terraform security** (if `.tf` files exist):
   ```bash
   checkov -d . --quiet --compact 2>/dev/null || echo "Install: pip install checkov"
   tfsec . 2>/dev/null || echo "Install: brew install tfsec"
   ```

2. **Kubernetes security** (if manifests exist):
   ```bash
   kubeval --strict -d manifests/ 2>/dev/null
   kube-score score manifests/*.yaml 2>/dev/null
   trivy config . 2>/dev/null || echo "Install: brew install trivy"
   ```

3. **Container image scanning** (if Dockerfiles exist):
   ```bash
   # Find referenced images
   grep -r 'image:' manifests/ 2>/dev/null | grep -oP '(?<=image:\s).+' | sort -u
   # Scan each image
   trivy image <image_name> --severity HIGH,CRITICAL
   ```

4. **Secrets detection**:
   ```bash
   # AWS access keys
   rg -n 'AKIA[0-9A-Z]{16}' . --glob '!node_modules' --glob '!.git'
   # Hardcoded passwords
   rg -n 'password\s*[=:]\s*["\x27][^"\x27]*["\x27]' . --glob '!node_modules' --glob '!.git' -i
   # Private keys
   rg -n 'BEGIN.*PRIVATE KEY' . --glob '!node_modules' --glob '!.git'
   # Generic secrets patterns
   rg -n '(api_key|apikey|secret_key|auth_token)\s*[=:]\s*["\x27]' . --glob '!node_modules' --glob '!.git' -i
   ```

5. **Hidden payload scan** (from security guide):
   ```bash
   # Zero-width and bidi control characters
   rg -nP '[\x{200B}\x{200C}\x{200D}\x{2060}\x{FEFF}\x{202A}-\x{202E}]' . --glob '!node_modules' --glob '!.git'
   # Suspicious patterns
   rg -n 'curl.*|.*bash' . --glob '*.sh' --glob '*.yaml' --glob '*.tf'
   ```

6. **Invoke infra-security-reviewer agent** for manual review of findings

7. **Consolidated report** with:
   - Tool results summary (PASSED/FAILED per tool)
   - Findings by severity (CRITICAL → MEDIUM)
   - Remediation steps for each finding
   - Overall verdict: PASS / FAIL

## Required Before
- Merging any IaC PR
- Running `terraform apply` on production
- Deploying K8s manifests to production

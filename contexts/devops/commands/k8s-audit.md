---
description: Audit Kubernetes manifests for security, best practices, and compliance
---

# Kubernetes Manifest Audit

## Steps

1. **Find all manifest files**:
   ```bash
   find . -path ./node_modules -prune -o \( -name '*.yaml' -o -name '*.yml' \) -print | grep -E '(k8s|manifests|helm|charts|kustomize)' | head -50
   ```

2. **Schema validation**:
   ```bash
   kubeval --strict -d manifests/ 2>&1 || echo "kubeval not installed — install with: brew install kubeval"
   ```

3. **Best practices check**:
   ```bash
   kube-score score manifests/*.yaml 2>&1 || echo "kube-score not installed — install with: brew install kube-score"
   ```

4. **Helm chart validation** (if applicable):
   ```bash
   helm lint ./charts/* 2>/dev/null
   helm template test ./charts/* 2>/dev/null | kubeval --strict
   ```

5. **Invoke k8s-reviewer agent** with focus on:
   - Pod security (runAsNonRoot, capabilities, privileged)
   - RBAC (no cluster-admin for apps, no wildcard verbs)
   - Resource limits (requests and limits on all containers)
   - Health probes (readiness, liveness, startup)
   - Network policies (default deny exists)
   - Image tags (no :latest, use digest or version)
   - Secrets management (no plain YAML secrets)

6. **Report** findings by severity with APPROVE / WARNING / BLOCK verdict

## BLOCKING Conditions
- Containers running as root or privileged
- cluster-admin bound to application service accounts
- Missing resource limits on production workloads
- Secrets in plain YAML manifests

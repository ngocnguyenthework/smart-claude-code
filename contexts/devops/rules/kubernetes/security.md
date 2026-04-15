---
paths:
  - "**/k8s/**/*.yaml"
  - "**/k8s/**/*.yml"
  - "**/manifests/**/*.yaml"
  - "**/helm/**/*.yaml"
  - "**/charts/**/*.yaml"
---
# Kubernetes Security

> Extends [common/security.md](../common/security.md) with Kubernetes-specific security. Enforces patterns from the-security-guide.md.

## Pod Security Standards (Restricted Profile)

Every pod MUST have a security context:

```yaml
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: app
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
```

## CRITICAL: Never Allow

- `privileged: true` — container has host root access
- `hostNetwork: true` — container shares host network stack
- `hostPID: true` / `hostIPC: true` — process isolation broken
- `runAsNonRoot: false` or missing — container runs as root
- `allowPrivilegeEscalation: true` — container can gain more privileges

## RBAC — Least Privilege

- Never bind `cluster-admin` to application service accounts
- Scope Roles to specific namespaces (use `Role`, not `ClusterRole` when possible)
- No wildcard verbs or resources (`*`)
- One ServiceAccount per workload

```yaml
# WRONG: Overly permissive
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]

# CORRECT: Scoped permissions
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list"]
```

## Network Policies

Default deny all traffic, then allowlist:

```yaml
# Default deny all ingress
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: myapp-production
spec:
  podSelector: {}
  policyTypes:
    - Ingress

# Allow specific traffic
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-from-ingress
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: api-server
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - port: 8080
```

## Secrets Management

- Never store secrets in plain YAML manifests
- Use `external-secrets-operator` with AWS Secrets Manager or Vault
- Or use `SealedSecrets` for GitOps-compatible encrypted secrets
- Enable encryption at rest for etcd (`EncryptionConfiguration`)

```yaml
# Use external-secrets-operator
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: db-credentials
  data:
    - secretKey: password
      remoteRef:
        key: prod/rds/master-password
```

## Image Security

- Never use `:latest` tag — use specific versions or digests
- Pull from trusted registries only (ECR, GCR, private registry)
- Scan images with Trivy in CI

```yaml
# WRONG
image: myapp:latest

# CORRECT
image: 123456789.dkr.ecr.ap-southeast-1.amazonaws.com/myapp:1.2.3@sha256:abc123...
```

## Resource Limits

Every container MUST have resource requests and limits:

```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

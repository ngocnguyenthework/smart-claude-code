---
paths:
  - "**/k8s/**/*.yaml"
  - "**/k8s/**/*.yml"
  - "**/manifests/**/*.yaml"
  - "**/helm/**/*.yaml"
  - "**/charts/**/*.yaml"
  - "**/kustomize/**/*.yaml"
---
# Kubernetes Patterns

> Extends [common/patterns.md](../common/patterns.md) with Kubernetes deployment and operational patterns.

## Health Probes

Every production container needs all three probes:

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 15
  periodSeconds: 20
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3

startupProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 30  # 5 min max startup
```

## Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## Pod Disruption Budget

Protect availability during voluntary disruptions:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-server-pdb
spec:
  minAvailable: 1    # or maxUnavailable: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: api-server
```

## Init Containers for Migrations

Run database migrations before app starts:

```yaml
initContainers:
  - name: migrate
    image: myapp:1.2.3
    command: ["python", "-m", "alembic", "upgrade", "head"]
    env:
      - name: DATABASE_URL
        valueFrom:
          secretKeyRef:
            name: db-credentials
            key: url
```

## ConfigMap and Secret Mounting

```yaml
volumes:
  - name: app-config
    configMap:
      name: api-config
  - name: app-secrets
    secret:
      secretName: api-secrets
containers:
  - name: app
    volumeMounts:
      - name: app-config
        mountPath: /app/config
        readOnly: true
      - name: app-secrets
        mountPath: /app/secrets
        readOnly: true
```

## Rolling Update Strategy

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0  # Zero-downtime
```

## GitOps with ArgoCD

```yaml
# argocd/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/org/infra.git
    targetRevision: main
    path: k8s/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: myapp-production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

## Sidecar Patterns

```yaml
# Logging sidecar
containers:
  - name: app
    # ...
  - name: fluentbit
    image: fluent/fluent-bit:latest
    volumeMounts:
      - name: app-logs
        mountPath: /var/log/app
        readOnly: true
```

## Pod Anti-Affinity for HA

Spread replicas across nodes:

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
              - key: app.kubernetes.io/name
                operator: In
                values: ["api-server"]
          topologyKey: kubernetes.io/hostname
```

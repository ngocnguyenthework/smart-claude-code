---
name: deployment-patterns
description: Progressive delivery for Kubernetes — rolling, blue-green, canary mapped onto ArgoCD, Argo Rollouts, Helm, Kustomize. Probes, PDB, HPA, rollback playbook, infra-only production-readiness checklist. Excludes Docker authoring + CI/CD pipelines (those live in app-dev contexts).

---

# Deployment Patterns (Infra)

## When to Use

- Choosing a rollout strategy for a K8s workload
- Wiring liveness/readiness/startup probes
- Adding PodDisruptionBudget or HorizontalPodAutoscaler to a workload
- Drafting a rollback playbook before a release
- Reviewing an ArgoCD `Application` or Argo Rollouts `Rollout` manifest

## Strategy → Stack Mapping

| Strategy | Zero Downtime | Instant Rollback | Stack |
|---|---|---|---|
| Rolling | Yes | No | K8s `Deployment.strategy.RollingUpdate` (default) |
| Blue-Green | Yes | Yes (swap back) | Argo Rollouts `BlueGreen`, or two ArgoCD `Application`s + Service selector swap |
| Canary | Yes | Yes (pull weight) | Argo Rollouts `Canary` with analysis templates, or Flagger |

- **Rolling** — old + new run simultaneously → schema/API changes must be backward-compatible. `maxSurge` + `maxUnavailable` control pace.
- **Blue-Green** — full duplicate env. Cuts traffic atomically. 2x cost during cutover. Best for stateful or high-blast-radius services.
- **Canary** — `setWeight: 5 → 25 → 50 → 100` gated on metric analysis. Catches issues at low blast radius. Needs traffic split (Istio / Gateway API / NGINX) + metric source (Prometheus / Datadog).

## Argo Rollouts — Canary Pattern

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: api
spec:
  replicas: 6
  strategy:
    canary:
      canaryService: api-canary
      stableService: api-stable
      trafficRouting:
        istio:
          virtualService: { name: api-vs, routes: [primary] }
      steps:
        - setWeight: 5
        - pause: { duration: 5m }
        - analysis:
            templates:
              - templateName: success-rate
            args:
              - name: service-name
                value: api-canary
        - setWeight: 25
        - pause: { duration: 10m }
        - setWeight: 50
        - pause: { duration: 10m }
        - setWeight: 100
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels: { app: api }
    spec:
      containers:
        - name: api
          image: ghcr.io/org/api@sha256:<digest>   # always digest in prod
---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  args:
    - name: service-name
  metrics:
    - name: success-rate
      interval: 1m
      successCondition: result[0] >= 0.99
      failureLimit: 3
      provider:
        prometheus:
          address: http://prometheus.monitoring:9090
          query: |
            sum(rate(http_requests_total{service="{{args.service-name}}",code!~"5.."}[2m]))
            / sum(rate(http_requests_total{service="{{args.service-name}}"}[2m]))
```

## Blue-Green — Argo Rollouts Pattern

```yaml
strategy:
  blueGreen:
    activeService: api-active
    previewService: api-preview
    autoPromotionEnabled: false        # require manual promotion
    scaleDownDelaySeconds: 600         # keep old around for fast rollback
```

Promote with `kubectl argo rollouts promote api`. Roll back with `kubectl argo rollouts undo api` or, if already promoted, point `activeService.selector` back at the previous ReplicaSet.

## Probes

```yaml
livenessProbe:
  httpGet: { path: /health, port: 8080 }
  periodSeconds: 30
  failureThreshold: 3
readinessProbe:
  httpGet: { path: /ready, port: 8080 }
  periodSeconds: 10
  failureThreshold: 3
startupProbe:
  httpGet: { path: /health, port: 8080 }
  failureThreshold: 30
  periodSeconds: 10
```

Rules:
- `/health` 200 if process alive (no downstream calls) — restart on fail.
- `/ready` 200 only when downstream deps reachable — pull from LB on fail.
- `startupProbe` mandatory for any app slower than `livenessProbe.failureThreshold * periodSeconds` boot. Liveness is gated until startup succeeds.
- Never share an endpoint between liveness and readiness.

## PDB + HPA

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: api }
spec:
  minAvailable: 2
  selector: { matchLabels: { app: api } }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: api }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: api }
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300   # avoid flapping
```

Rules:
- HA workloads always ship with PDB; `minAvailable` should not equal replica count (would block voluntary disruption forever).
- HPA `minReplicas >= 3` for prod; otherwise PDB cannot be satisfied.

## Rollback Playbook

```bash
# K8s native
kubectl rollout history deployment/api
kubectl rollout undo deployment/api                  # to previous revision
kubectl rollout undo deployment/api --to-revision=N  # to specific revision

# Argo Rollouts
kubectl argo rollouts undo api
kubectl argo rollouts get rollout api --watch

# ArgoCD
argocd app history <app>
argocd app rollback <app> <revision-id>

# Helm
helm history <release> -n <ns>
helm rollback <release> <revision> -n <ns>
```

Rules:
- Roll back image, not config drift — fix config via PR, never via `kubectl edit`.
- Destructive DB migrations are not reversible. Plan: expand → backfill → contract; roll forward with compensating migration on failure.
- Rehearse rollback in staging on every release; treat the command as part of the runbook, not improvised.

## Production-Readiness Checklist (Infra)

- [ ] Image pinned by digest (`@sha256:...`), never `:latest` or floating tags
- [ ] `resources.requests` AND `resources.limits` set on every container
- [ ] `livenessProbe`, `readinessProbe` (and `startupProbe` if slow start) defined
- [ ] PodDisruptionBudget for replicas ≥ 2
- [ ] HorizontalPodAutoscaler for variable load (or explicit "fixed-size" justification)
- [ ] NetworkPolicy restricting ingress + egress (default-deny baseline)
- [ ] `securityContext`: `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, no privileged, capabilities dropped
- [ ] ServiceAccount per workload; cluster-admin never used
- [ ] RED alerts wired (rate, errors, duration) per service
- [ ] Structured JSON logs shipped; no PII
- [ ] ArgoCD Application has `finalizers: [resources-finalizer.argocd.argoproj.io]` and pinned `targetRevision` (tag/sha, never branch)
- [ ] AppProject `sourceRepos` + `destinations` explicit (no wildcards in prod)
- [ ] Rollback command documented + rehearsed in staging

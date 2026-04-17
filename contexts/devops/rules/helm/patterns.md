---
paths:
  - "**/Chart.yaml"
  - "**/charts/**/*.yaml"
  - "**/charts/**/*.tpl"
---
# Helm Patterns

> Common Helm authoring patterns. Extends [kubernetes/patterns.md](../kubernetes/patterns.md) and [common/patterns.md → Shared Base First](../common/patterns.md#shared-base-first-critical).

## Shared Base First (CRITICAL)

- **Library chart `common/`** for Deployment/Service/Ingress/HPA shapes reused across services. Never copy full templates per chart.
- **Named templates in `_helpers.tpl`** — `common.labels`, `common.selectorLabels`, `common.resourceName`. Reuse via `{{ include "..." . }}`.
- **`values.schema.json`** — one schema per chart; validate before install.
- **Umbrella chart** for grouped-release apps; per-service values in `values-<env>.yaml`.
- **Rule of 2**: second chart needing same template → move to library chart.

## Library Charts for Shared Primitives

When many services need the same Deployment/Service/Ingress shape, extract a library chart:

```yaml
# common/Chart.yaml
apiVersion: v2
name: common
type: library
version: 1.0.0
```

```yaml
# common/templates/_deployment.tpl
{{- define "common.deployment" -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "common.fullname" . }}
  labels: {{- include "common.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  # ... common deployment spec
{{- end }}
```

Consumer charts depend on `common` and call the template.

## Values Hierarchy (Precedence)

From lowest to highest:
1. `values.yaml` (chart defaults)
2. `-f values-staging.yaml` (env-specific files, in order)
3. `--set key=value` (inline overrides)

```bash
helm install api ./api \
  --values values.yaml \
  --values values-prod.yaml \
  --values values-prod-apac.yaml \
  --set image.tag=$GIT_SHA
```

Keep `values-<env>.yaml` files minimal — only override what differs from defaults.

## Conditional Sub-Charts

```yaml
# Chart.yaml
dependencies:
  - name: postgresql
    version: 12.5.8
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
  - name: redis
    version: 17.11.3
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
```

```yaml
# values.yaml
postgresql:
  enabled: false  # enable per-env in values-dev.yaml

redis:
  enabled: true
```

## Named Template Pipelines

```yaml
# _helpers.tpl
{{- define "api.image" -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion -}}
{{- printf "%s:%s" .Values.image.repository $tag -}}
{{- end }}
```

```yaml
# deployment.yaml
containers:
  - name: api
    image: {{ include "api.image" . | quote }}
```

## Hooks

- `helm.sh/hook: pre-install,pre-upgrade` — runs before the release
- `helm.sh/hook: post-install,post-upgrade` — runs after
- `helm.sh/hook-weight: "N"` — order multiple hooks (low first)
- `helm.sh/hook-delete-policy: before-hook-creation,hook-succeeded` — cleanup policy

Use hooks for:
- Database migrations (pre-upgrade Job)
- Secret generation (pre-install Job)
- Smoke tests (post-install Job with `hook: test`)

```yaml
# templates/pre-upgrade-migrate.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "api.fullname" . }}-migrate
  annotations:
    "helm.sh/hook": pre-upgrade
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: {{ include "api.image" . }}
          command: ["./migrate.sh"]
```

## Rollback-Friendly Releases

- Keep `revisionHistoryLimit` ≥ 5 on Deployments
- `helm rollback <release> <revision>` works only if release history is retained (`--history-max 10` on tiller-less helm 3)
- Immutable image tags — tagged with `:1.4.2` + SHA suffix, never `:latest`

## Multi-Environment Values

Pattern A (single chart, env values files):
```
api/
  values.yaml              # defaults
  values-dev.yaml
  values-staging.yaml
  values-prod.yaml
```

Pattern B (umbrella chart per env):
```
deployments/
  dev/
    Chart.yaml             # depends on api-chart
    values.yaml
  prod/
    Chart.yaml
    values.yaml
```

Pattern A is simpler; Pattern B is better when env deployments need multiple charts composed together.

## Dependency Pinning

- Always pin sub-chart versions exactly: `version: 12.5.8`
- Run `helm dep update` and commit `Chart.lock`
- In CI, fail if `Chart.lock` drifts from `Chart.yaml`

## Notes / Post-Install Output

`templates/NOTES.txt`:
```
{{- if .Values.ingress.enabled }}
API available at: https://{{ .Values.ingress.host }}
{{- else }}
Port-forward: kubectl port-forward svc/{{ include "api.fullname" . }} 8080:80
{{- end }}

Check status: kubectl get pods -l app.kubernetes.io/instance={{ .Release.Name }}
```

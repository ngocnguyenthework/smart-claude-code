---
paths:
  - "**/Chart.yaml"
  - "**/charts/**/*.yaml"
  - "**/charts/**/*.tpl"
---
# Helm Coding Style

> Extends [kubernetes/coding-style.md](../kubernetes/coding-style.md) with Helm chart conventions.

## Chart Layout

```
mychart/
├── Chart.yaml                # Chart metadata
├── values.yaml               # Default values (lowest-precedence)
├── values.schema.json        # JSON Schema for values validation
├── README.md                 # Auto-generated via helm-docs
├── LICENSE
├── templates/
│   ├── _helpers.tpl          # Named templates (functions)
│   ├── NOTES.txt             # Displayed after install
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── serviceaccount.yaml
│   ├── hpa.yaml
│   └── tests/
│       └── test-connection.yaml
├── charts/                   # Sub-chart dependencies (populated by `helm dep update`)
└── crds/                     # Custom Resource Definitions (installed before templates)
```

## `Chart.yaml`

- `apiVersion: v2` only (v1 is deprecated)
- `name` — lowercase, hyphen-separated, matches directory name
- `version` — chart version (SemVer), bumped on every release
- `appVersion` — application version (can be anything; usually a tag)
- `type: application` (unless it's a library chart, then `library`)
- `dependencies` — pinned with `version:`, never `>= X.Y.Z`
- `annotations.artifacthub.io/*` if publishing to ArtifactHub

```yaml
apiVersion: v2
name: api
description: REST API service
type: application
version: 1.4.2
appVersion: "1.4.2"
dependencies:
  - name: postgresql
    version: 12.5.8
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
```

## `values.yaml`

- One logical group per top-level key: `image`, `ingress`, `resources`, `autoscaling`, `postgresql`, etc.
- **Every** tunable has a default in `values.yaml` — never rely on "undefined" as a meaning
- Use `null` for "disabled" rather than omitting keys
- Inline comments for non-obvious fields; keep long docs in README
- Wrap secrets references with a clear convention (e.g. `existingSecret: ""` vs `password: ""`)

```yaml
image:
  repository: registry.example.com/api
  tag: ""               # Defaults to .Chart.AppVersion if empty
  pullPolicy: IfNotPresent
  pullSecrets: []

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

## `values.schema.json`

- Every chart MUST ship a `values.schema.json`
- `helm install` validates values against the schema — catches typos before render
- Use `required`, `enum`, `pattern`, `minimum`, `maximum`
- Generate initial draft from `values.yaml` then tighten

## `_helpers.tpl` Naming

- Named templates use `<chart>.<function>` pattern: `{{- define "api.fullname" -}}`
- Standard helpers every chart should have:
  - `<chart>.name` — base name
  - `<chart>.fullname` — qualified name with release prefix
  - `<chart>.chart` — chart + version
  - `<chart>.labels` — common labels (standard K8s labels)
  - `<chart>.selectorLabels` — subset for selectors (must be immutable)
  - `<chart>.serviceAccountName` — SA name with create/use logic

```yaml
{{- define "api.labels" -}}
helm.sh/chart: {{ include "api.chart" . }}
app.kubernetes.io/name: {{ include "api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
```

## Template Conventions

- `{{- ... -}}` trim whitespace aggressively to keep rendered YAML clean
- Use `{{ include "X" . }}` not `{{ template "X" . }}` (include supports piping)
- `{{ toYaml .Values.X | nindent 4 }}` for complex values
- Guard optional blocks with `{{- if .Values.X }}` rather than conditional templates
- Quote values that could be interpreted as numbers/bools when K8s expects strings

## Secret Handling

- **Never** render plaintext secrets in templates you commit
- Use one of:
  - `existingSecret: my-secret` — reference a secret created elsewhere
  - `.Values.X` pulled from a values file injected by CI/CD
  - External Secrets Operator CRDs

## Linting

- Run `helm lint .` locally before commit
- `helm template . --debug | kubeconform -strict` in CI
- `helm-docs` to regenerate README from `values.yaml` comments
- Version bump check in CI: `Chart.yaml` version must change if `templates/` or `values.yaml` changes

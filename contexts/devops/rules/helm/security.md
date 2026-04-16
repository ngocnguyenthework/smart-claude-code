---
paths:
  - "**/Chart.yaml"
  - "**/charts/**/*.yaml"
  - "**/charts/**/*.tpl"
---
# Helm Security

> Extends [kubernetes/security.md](../kubernetes/security.md) with Helm-specific risks.

## CRITICAL: Plaintext Secrets in Templates

- **NEVER** commit `Secret` templates with `.data.*` hardcoded or interpolated from `.Values.password`
- **NEVER** accept plain `password: ""` in values — always `existingSecret: ""` or external reference
- Use `ExternalSecret` CRD, SealedSecrets, or SOPS + helm-secrets plugin

```yaml
# WRONG
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "api.fullname" . }}-db
stringData:
  password: {{ .Values.db.password }}

# CORRECT
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: {{ include "api.fullname" . }}-db
spec:
  secretStoreRef: {name: aws-secrets, kind: ClusterSecretStore}
  target:
    name: {{ include "api.fullname" . }}-db
  dataFrom:
    - extract:
        key: {{ .Values.db.secretKey | quote }}
```

## CRITICAL: Dependency Integrity

- Pin sub-chart `version:` exactly — never `^X.Y.Z` or `>= X.Y.Z`
- Commit `Chart.lock`
- In CI, run `helm dep update` and fail if `Chart.lock` diff is non-empty
- Verify dependency repos over HTTPS with signed provenance where possible (`helm install --verify`)

## CRITICAL: Image Tags

- Never default `image.tag: latest` in `values.yaml`
- Default `image.tag: ""` and resolve to `.Chart.AppVersion` via named template
- Pinning to `:latest` breaks rollback (Helm revision stays the same but pod pulls new image silently)

## HIGH: RBAC in Templates

- `ServiceAccount` created per release, not shared
- `Role` / `RoleBinding` scoped to the release namespace
- `ClusterRole` only for chart types that genuinely need cluster-scope (operators) — document why
- No `verbs: ["*"]` or `resources: ["*"]` without a specific justification in comments

## HIGH: Pod Security

- `securityContext.runAsNonRoot: true` default
- `securityContext.readOnlyRootFilesystem: true` default (provide emptyDir for writable paths)
- `securityContext.allowPrivilegeEscalation: false`
- `capabilities.drop: ["ALL"]`
- PodSecurityPolicy / PSA-restricted compatibility out of the box

```yaml
# values.yaml
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000

securityContext:
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
```

## HIGH: Template Injection

- Never interpolate untrusted values into shell commands or `command:`/`args:`
- `{{ .Values.userInput }}` should be `{{ .Values.userInput | quote }}` in scalar contexts
- `toYaml` + `nindent` for map/list contexts

```yaml
# WRONG — injection if .Values.extraArg contains shell metachars
args: ["--flag", {{ .Values.extraArg }}]

# CORRECT
args:
  - "--flag"
  - {{ .Values.extraArg | quote }}
```

## HIGH: Hook Permissions

- `pre-install` / `pre-upgrade` Jobs that perform migrations need database credentials — load from existing Secret, not `.Values.db.password`
- Hook Jobs should use a scoped ServiceAccount, not the chart's main SA
- Set `backoffLimit: 1` on hook Jobs — don't let failures accumulate

## MEDIUM: Linting & Schema

- `values.schema.json` enforces structure — reject unknown keys with `additionalProperties: false` at top-level
- `helm lint --strict` in CI
- `helm template | kubeconform -strict` in CI
- Policy-as-code: `conftest test <rendered>` against org policies (e.g. no hostNetwork, no privileged)

## MEDIUM: Provenance & Signing

- For published charts: sign with `helm package --sign --key ...`
- Verify on install: `helm install --verify`
- Reject unsigned charts in production pipelines

## Scanning Commands

```bash
# Lint chart
helm lint . --strict

# Validate schema
helm template . --debug > /tmp/rendered.yaml
kubeconform -strict /tmp/rendered.yaml

# Policy-as-code
conftest test /tmp/rendered.yaml --policy policies/

# Scan for secrets in rendered output
grep -E '(password|apikey|secret|token).*:' /tmp/rendered.yaml | grep -v 'existingSecret\|secretKeyRef'
```

---
paths:
  - "**/Chart.yaml"
  - "**/charts/**/*.yaml"
  - "**/charts/**/*.tpl"
---
# Helm Testing

> Validation, rendering, and in-cluster chart tests.

## Pre-Commit

```bash
# Lint
helm lint . --strict

# Schema validation (requires values.schema.json)
helm lint . --values values.yaml --values values-prod.yaml

# Render + validate with every env's values
for env in dev staging prod; do
  helm template test-release . \
    --values values.yaml \
    --values "values-${env}.yaml" \
    --debug > "/tmp/rendered-${env}.yaml"
  kubeconform -strict "/tmp/rendered-${env}.yaml"
done

# Dependency lock integrity
helm dep update
git diff --exit-code Chart.lock || { echo "Chart.lock drifted"; exit 1; }
```

## Unit Tests via `helm-unittest`

```bash
helm plugin install https://github.com/helm-unittest/helm-unittest
helm unittest .
```

```yaml
# tests/deployment_test.yaml
suite: deployment
templates:
  - deployment.yaml
tests:
  - it: sets replicas from values
    set:
      replicaCount: 3
    asserts:
      - equal:
          path: spec.replicas
          value: 3

  - it: mounts existingSecret when provided
    set:
      db.existingSecret: my-db-secret
    asserts:
      - contains:
          path: spec.template.spec.containers[0].envFrom
          content:
            secretRef:
              name: my-db-secret

  - it: fails if replicaCount < 1
    set:
      replicaCount: 0
    asserts:
      - failedTemplate: {}
```

## Integration Tests via `helm test`

In the chart, add `templates/tests/`:

```yaml
# templates/tests/test-connection.yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "api.fullname" . }}-test-connection"
  annotations:
    "helm.sh/hook": test
spec:
  restartPolicy: Never
  containers:
    - name: wget
      image: busybox:1.36
      command: ['wget']
      args: ['{{ include "api.fullname" . }}:{{ .Values.service.port }}/health']
```

```bash
# After install
helm test my-release
```

## Rendered-Diff Review

Before releasing a chart version bump, compare rendered output:

```bash
helm template old-release OLD_VERSION --values values-prod.yaml > /tmp/old.yaml
helm template old-release ./ --values values-prod.yaml > /tmp/new.yaml
diff -u /tmp/old.yaml /tmp/new.yaml | less
```

## Install Simulation

```bash
# Simulate install (renders + server-side schema check)
helm install --dry-run --debug test-release . \
  --values values.yaml \
  --values values-prod.yaml

# Simulate upgrade
helm upgrade --dry-run --install test-release . \
  --values values.yaml --values values-prod.yaml
```

## Rollback Rehearsal

```bash
# Install v1
helm install api ./api --version 1.0.0 --values values-prod.yaml

# Upgrade to v2
helm upgrade api ./api --version 2.0.0 --values values-prod.yaml

# List revisions
helm history api

# Rollback
helm rollback api 1
# Verify:
kubectl get pods -l app.kubernetes.io/instance=api -o yaml | grep image:
```

## Documentation Sync

```bash
# Regenerate README from values.yaml comments
helm-docs

# Fail CI if README drifted
git diff --exit-code README.md
```

## CI Checklist

- [ ] `helm lint --strict` passes
- [ ] `helm dep update` → `Chart.lock` unchanged
- [ ] `helm template` + `kubeconform -strict` passes for every env values file
- [ ] `helm unittest` passes
- [ ] `values.schema.json` validates all env values files
- [ ] Rendered diff reviewed (no unintended changes outside the PR scope)
- [ ] `helm-docs` regenerated README — no diff
- [ ] `Chart.yaml` version bumped when `templates/` or `values.yaml` changed
- [ ] Policy-as-code (`conftest`) passes on rendered output

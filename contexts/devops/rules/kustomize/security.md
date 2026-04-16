---
paths:
  - "**/kustomization.yaml"
  - "**/kustomization.yml"
---
# Kustomize Security

> Extends [kubernetes/security.md](../kubernetes/security.md) with Kustomize-specific risks.

## CRITICAL: `secretGenerator` vs External Secrets

- `secretGenerator` creates `Secret` resources at build time from literals or files
- Literals in `kustomization.yaml` are **visible in git** — this is plaintext storage
- **NEVER** use `secretGenerator` with `literals:` for real production secrets
- For env-local development only; for production use ExternalSecret/SealedSecret instead

```yaml
# WRONG — commits plaintext
secretGenerator:
  - name: db-credentials
    literals:
      - password=prod-password-here

# OK for local dev only (files in .gitignore)
secretGenerator:
  - name: db-credentials
    envs:
      - .env.local    # must be gitignored

# CORRECT for production
resources:
  - external-secret-db.yaml     # references vault/SM/SSM
```

## CRITICAL: `commonLabels` Immutability

- `commonLabels` is applied to both resource metadata AND selectors (Deployment.spec.selector)
- K8s selectors are **immutable** — once deployed, you cannot change them
- Adding a `commonLabel` after first deploy breaks rolling upgrade
- Decision required: set `commonLabels` at initial deploy OR migrate via recreate

## CRITICAL: Patch Target Scope

- `patches:` with `target:` that uses a regex (`name: .*`) can match more resources than intended
- Always specify `kind` + `name` explicitly; avoid `labelSelector:` unless you're sure of the match set
- Validate with `kustomize build | yq 'select(.metadata.name | test("pattern"))' | wc -l`

```yaml
# WRONG — matches any Deployment
patches:
  - path: patch-resources.yaml
    target:
      kind: Deployment

# CORRECT — specific target
patches:
  - path: patch-resources.yaml
    target:
      kind: Deployment
      name: api
```

## HIGH: `namespace:` Leakage

- Overlays that set `namespace:` override namespaces on every resource — including namespace-scoped RBAC
- A `Role` in base pointing to `namespace: default` gets rewritten to your overlay's namespace
- `ClusterRole` is not affected (cluster-scoped) — but `ClusterRoleBinding.subjects[].namespace` IS affected
- Review RBAC explicitly when adding overlays

## HIGH: Image Tag Mutability

- Overlay `images:` with `newTag: latest` — breaks rollback and reproducibility
- Prefer immutable tags (version + SHA) — `newTag: v1.4.2-sha-abc123`
- Never use floating tags (`:stable`, `:latest`, `:main`) in overlay `images:`

## HIGH: Component Trust

- `components:` can include `patches:` and `resources:` — a compromised component repo deploys malicious resources
- Vendor-provided components should be reviewed on every version bump
- Use `configurations:` to scope what transformers the component can apply

## MEDIUM: `helmCharts` Source

- `helmCharts` downloads remote charts at build time — don't trust arbitrary repos
- Pin `version:` exactly (no `^` or `>=`)
- Prefer pulling charts into `charts/` and committing them (vendored) for production

## MEDIUM: ConfigMap Hash Rotation

- `configMapGenerator` appends a hash — but only rotates when the input changes
- If a config is injected via `envFrom.configMapKeyRef` and the ConfigMap content doesn't change, pod doesn't restart
- For forced rotation, use `annotations.rotation-timestamp` pattern on the Deployment

## MEDIUM: Generator Options

```yaml
generatorOptions:
  disableNameSuffixHash: true   # WARNING: pods won't restart on config change
  immutable: true               # for ConfigMaps/Secrets that are safe to make immutable
```

- `disableNameSuffixHash: true` breaks the auto-rotation benefit — only use if you manage rotation externally
- `immutable: true` is good practice for stable configs (K8s 1.21+)

## Scanning Commands

```bash
# Render + schema validate
kustomize build overlays/prod | kubeconform -strict

# Scan rendered output for plaintext secrets
kustomize build overlays/prod | grep -E '(password|apikey|secret|token)\s*:' | \
  grep -v 'valueFrom\|secretKeyRef\|ExternalSecret'

# Policy-as-code
kustomize build overlays/prod | conftest test - --policy policies/

# Diff old vs new rendering
git stash
kustomize build overlays/prod > /tmp/old.yaml
git stash pop
kustomize build overlays/prod > /tmp/new.yaml
diff -u /tmp/old.yaml /tmp/new.yaml

# Detect immutable-field changes (Deployment selectors, etc.)
kubectl diff -k overlays/prod   # when cluster is reachable
```

---
name: gitops-workflows
description: GitOps with ArgoCD (or Flux) — app-of-apps / ApplicationSet patterns, ArgoCD Image Updater (semver write-back), ExternalSecrets via cloud secret manager, sync policy choices (manual vs automated, prune, selfHeal), Slack notifications, onboarding a new service. Use when adding ArgoCD applications, debugging sync, or changing image-update strategies.

---

# GitOps Workflows

## When to Use

- Onboarding a new service to ArgoCD (or Flux)
- App stuck `OutOfSync` / `Degraded` / sync failure
- Changing ArgoCD Image Updater strategy (semver, regex, write-back method)
- Wiring a cloud secret manager → ExternalSecrets → pod env
- Switching between manual and automated sync; understanding `prune` / `selfHeal` blast radius
- Routing Slack / PagerDuty notifications for sync + health events

## Repo Layout (canonical app-of-apps)

```
argocd/
  <env>/
    root.yml                 # App-of-Apps — watches argocd/<env>/apps/ recursively
    apps/<service>/<svc>.yml # one Application per service
.argocd-source-<svc>-<env>.yaml   # written-back by Image Updater
```

The root app for each env points at a directory in this repo. Anything dropped into `apps/<svc>/` becomes a managed Application on next sync. ApplicationSet is a structurally similar option when services share a template — pick app-of-apps for hand-curated apps, ApplicationSet for templated fan-out (per-cluster, per-tenant).

## Onboard New Service (canonical pattern)

1. Create Helm values (or Kustomize overlay) for the service.
2. Create the secret entry in your cloud secret manager (Secrets Manager / GSM / Key Vault / Vault).
3. Annotate the workload's ServiceAccount with the IRSA / Workload Identity role for cloud access.
4. Create `argocd/<env>/apps/<svc>/<svc>.yml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: <svc>-<env>
  namespace: argocd
  annotations:
    argocd-image-updater.argoproj.io/image-list: <svc>=<registry>/<repo>
    argocd-image-updater.argoproj.io/<svc>.update-strategy: semver
    argocd-image-updater.argoproj.io/<svc>.allow-tags: regexp:^v?\d+\.\d+\.\d+
    argocd-image-updater.argoproj.io/<svc>.ignore-tags: latest
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/git-branch: main
spec:
  project: <project>
  source:
    repoURL: <repo-url>
    targetRevision: main
    path: <chart-path>
    helm:
      valueFiles:
        - <values-path>
  destination:
    server: https://kubernetes.default.svc
    namespace: <ns>
  syncPolicy:
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
      - ApplyOutOfSyncOnly=true     # prod recommendation
    # automated:                    # keep commented for prod — manual sync default
    #   prune: true
    #   selfHeal: true
```

5. PR → merge → root app picks up automatically.

## Sync-Policy Decision Matrix

| Env | Recommended | Why |
|---|---|---|
| dev | `automated.prune=true, selfHeal=true` | iteration speed; blast radius low |
| staging | `automated.prune=true, selfHeal=false` | catch drift, keep prune semantics |
| prod | manual sync, `prune=false, selfHeal=false` | rollback control + change-window discipline |

**Never** enable `selfHeal` on prod without rollback evidence — it re-applies stale manifests after a hot-fix `kubectl rollout undo`, masking the rollback.

## Image Updater — Hard Rules

- `ignore-tags: latest` — always.
- `update-strategy: semver` + `allow-tags: regexp:^v?\d+\.\d+\.\d+` — release `v1.2.3` style only.
- Write-back via `git`; never `argocd` annotation method on prod (loses audit trail in git).
- For extra prod gating: write-back to a `staging` branch, promote tags via PR.

Detect drift: `git log --oneline -- '.argocd-source-*.yaml'` shows automatic image bumps.

## ExternalSecrets Wiring

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: <svc>
  namespace: <ns>
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: <store-name>             # ClusterSecretStore (IRSA / WI / token-backed)
    kind: ClusterSecretStore
  target:
    name: <svc>-env
    creationPolicy: Owner
  dataFrom:
    - extract:
        key: <secret-path>          # key=value pairs in upstream store
```

Don't bypass with `secretGenerator` (Kustomize) or sealed-secrets when ESO is the standard — pick one approach per cluster and stick to it.

## Sync Failure Triage

```bash
argocd app get <app>
argocd app diff <app>
argocd app history <app>
argocd app sync <app> --dry-run
kubectl describe application <app> -n argocd
```

Common causes:
- `ComparisonError`: Helm template fails — render locally with `helm template <chart> -f <values>`.
- `SyncFailed: webhook denied`: NetworkPolicy / OPA-Gatekeeper / Kyverno policy violation.
- `OutOfSync` after manual `kubectl edit`: drift; revert manually or sync (will overwrite).
- Image Updater wrote a tag that no longer exists in registry: lifecycle policy purge — push fresh tag and re-sync.

## Notifications

ArgoCD Notifications subscriptions worth wiring:
- `on-health-degraded` → ops channel
- `on-sync-failed` → ops channel
- `on-deployed` → release channel

```yaml
metadata:
  annotations:
    notifications.argoproj.io/subscribe.on-deployed.slack: <channel>
```

Webhook URLs always sourced from a secret manager — never hard-coded in manifests.

## Rollback

```bash
argocd app history <app>
argocd app rollback <app> <revision-id>
# OR roll forward by reverting the .argocd-source-<svc>-<env>.yaml in git
git revert <commit-that-bumped-image>
git push   # root app picks it up; manual sync on prod
```

Prefer "revert in git" on prod — preserves audit trail and works even if ArgoCD UI is down.

## Anti-Patterns (block on review)

- AppProject `default` for prod with wildcard `sourceRepos` / `destinations`.
- `targetRevision: main` for source-code repos that auto-rebuild image (use sha or tag pin).
- `selfHeal: true` on prod (see decision matrix).
- New service without ExternalSecret — chart should always set `externalSecrets.enabled: true`.
- Image tag `latest` anywhere in helm values.

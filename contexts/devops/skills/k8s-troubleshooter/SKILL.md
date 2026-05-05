---
name: k8s-troubleshooter
description: Systematic Kubernetes triage for EKS / GKE / AKS clusters. Covers CrashLoopBackOff, ImagePullBackOff, OOMKilled, Pending pods, Karpenter / Cluster Autoscaler node provisioning, ExternalSecrets sync failures, ALB / NGINX ingress issues, and IRSA / Workload Identity misconfig. Use when diagnosing pod, node, networking, or workload problems.

---

# Kubernetes Troubleshooter

## When to Use

- Pod stuck (`CrashLoopBackOff`, `ImagePullBackOff`, `OOMKilled`, `Pending`, `ContainerCreating`)
- Karpenter or Cluster Autoscaler not provisioning nodes
- `ExternalSecret` not syncing — secret missing in pod, status `SecretSyncedError`
- Ingress not routing — 502 / 503 from a public host
- Workload running but failing readiness — downstream dep unreachable
- IRSA / Workload Identity / Pod Identity not granting AWS / GCP access

## Cluster Context Quick-Switch

```bash
# AWS
aws eks update-kubeconfig --name <cluster> --region <region> --profile <profile>
# GCP
gcloud container clusters get-credentials <cluster> --region <region>
# Azure
az aks get-credentials --resource-group <rg> --name <cluster>

kubectl get nodes -L karpenter.sh/nodepool   # see Karpenter pool placement (if Karpenter)
kubectl get nodes -L kubernetes.io/instance-type
```

## Triage Tree

```
Pod broken? → kubectl describe pod / logs --previous
├─ ImagePullBackOff → registry auth (IRSA/WI), tag exists, lifecycle policy purged image?
├─ CrashLoopBackOff → app exit; logs --previous; readiness vs liveness; secret present?
├─ OOMKilled → resources.limits.memory; node size matches request
├─ Pending → no node fits → describe pod (Events) → autoscaler logs → NodePool taints/limits
├─ ContainerCreating → volume / secret / configmap not ready → describe pod, ESO status
└─ Running but failing readiness → /ready endpoint, downstream (DB, cache, third-party)
```

## Recipe: ImagePullBackOff

```bash
kubectl describe pod <pod> -n <ns> | grep -A2 "Failed"
# 1. Tag exists?
aws ecr describe-images --repository-name <repo> --image-ids imageTag=<tag> --region <region>
# (or: gcloud artifacts docker images list ..., az acr repository show-tags ...)
# 2. Lifecycle policy purged it?
aws ecr describe-images --repository-name <repo> --region <region> \
  --query 'imageDetails[*].[imageTags[0],imagePushedAt]' --output table
# 3. Node IRSA / Workload Identity can pull?
kubectl exec -n kube-system <node-agent-pod> -- aws sts get-caller-identity
# 4. CD tool (ArgoCD/Flux) wrote a tag that no longer exists? Check generated source files in git.
```

## Recipe: ExternalSecret Not Syncing

```bash
kubectl get externalsecret -A
kubectl describe externalsecret <name> -n <ns>
# Look for: SecretSyncedError, AccessDenied, secret not found
kubectl get clustersecretstore -o yaml | grep -A5 auth
# Verify the secret path in the upstream store (Secrets Manager / Vault / GSM / Key Vault)
aws secretsmanager describe-secret --secret-id <path> --region <region>
# IRSA role on ESO ServiceAccount has GetSecretValue on the path?
```

Common causes: secret renamed, IRSA / WI trust policy missing OIDC `sub`, ClusterSecretStore points at wrong region.

## Recipe: Karpenter / Autoscaler Not Scheduling

```bash
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter --tail=200
# (or: kubectl logs -n kube-system -l app=cluster-autoscaler)
kubectl get nodepool                        # Karpenter
kubectl describe nodepool <pool> | grep -A5 "Limits\|Disruption"
# Pod tolerations match NodePool taints?
kubectl get pod <pod> -n <ns> -o yaml | grep -A10 tolerations
```

Common causes: NodePool `limits` reached; pod requests larger than any allowed instance type; tolerations missing for tainted pool; PodDisruptionBudget blocks consolidation.

## Recipe: Ingress 502 / 503

```bash
kubectl get ingress -A
kubectl describe ingress <name> -n <ns> | grep -E "Hosts|Address|Events"
# Target group / upstream health (ALB)
aws elbv2 describe-target-health --target-group-arn <arn> --region <region>
# Pod readinessProbe failing? Healthy hosts == 0 → app-side, not LB
kubectl get pods -n <ns> -l app=<svc> -o wide
kubectl logs -n <ns> -l app=<svc> --tail=100
```

Common causes: `readinessProbe` mismatched path; NetworkPolicy blocks LB→pod; security group missing for node SG; healthcheck path annotation wrong.

## Recipe: IRSA / Workload Identity Permission Denied

```bash
SA_NAME=<sa>; NS=<ns>
kubectl get sa $SA_NAME -n $NS -o yaml | grep eks.amazonaws.com/role-arn
ROLE_ARN=$(kubectl get sa $SA_NAME -n $NS -o jsonpath='{.metadata.annotations.eks\.amazonaws\.com/role-arn}')
aws iam get-role --role-name "${ROLE_ARN##*/}" --query 'Role.AssumeRolePolicyDocument'
# Trust policy must include:
# oidc.eks.<region>.amazonaws.com/id/<oidc-id>:sub == system:serviceaccount:<ns>:<sa>
```

If trust policy correct, run `aws sts get-caller-identity` from inside the pod. If it returns the node role instead of the SA role, the projected token volume is missing — restart the pod or check the mutating webhook.

## Recipe: OOMKilled

```bash
kubectl get pod <pod> -n <ns> -o jsonpath='{.status.containerStatuses[*].lastState.terminated.reason}'
kubectl top pod <pod> -n <ns> --containers
kubectl get pod <pod> -n <ns> -o jsonpath='{.spec.containers[*].resources}'
```

If actual usage steady at limit: bump `resources.limits.memory` (and `requests` to match for QoS Guaranteed). If spikes only on cold start: increase `startupProbe.failureThreshold`; do not raise liveness limits to mask startup. JVM/.NET workloads often need 1.3–1.5x measured peak.

## Cluster Health Quick-Check

```bash
kubectl get nodes -o wide
kubectl top nodes
kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded
kubectl get events -A --sort-by='.lastTimestamp' | tail -30
```

## Escalation

After triage runbook exhausted: capture `kubectl describe`, last 100 log lines, and the specific autoscaler / ESO / ingress error before paging. Do not run destructive commands (delete pod, force-delete, scale to zero) on prod without confirmation — devops Bash hooks block `kubectl apply|delete` to prod context by default.

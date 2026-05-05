---
name: monitoring-observability
description: Observability stack design — Prometheus + Grafana + Loki + Alloy (open-source, self-hosted) or Datadog / New Relic alternatives. Covers metrics scraping, RED + USE methodology, SLOs + error budgets, alert routing by team label, log aggregation with LogQL, dashboard conventions, and high-cardinality / high-query-load triage. Use when adding alerts, dashboards, SLOs, or instrumenting a service.

---

# Monitoring & Observability

## When to Use

- Adding metrics / alerts / dashboards for a service
- Designing an SLO or error budget for a workload
- Slow Grafana queries / Prometheus query saturation alerts
- Routing alerts to the right channel
- Triaging "is this an app problem or an infra problem"

## Stack Choices

| Component | Open-source default | Managed alternatives |
|---|---|---|
| Metrics | Prometheus | Amazon Managed Prometheus, Grafana Cloud, Datadog Metrics |
| Visualization | Grafana | Grafana Cloud, Datadog, New Relic |
| Logs | Loki | CloudWatch Logs, Datadog Logs, ELK |
| Scrape agent | Grafana Alloy (replaces fluentbit/promtail) | Datadog Agent, OTel Collector |
| Tracing | Tempo + OTel | AWS X-Ray, Datadog APM, Honeycomb |

Pick one stack per cluster. Don't run Prometheus + Datadog Metrics in parallel — pay twice, alert twice, debug twice.

For Kubernetes self-hosted, dedicate a tainted node pool to monitoring components (e.g. `group=monitoring:NoSchedule`) so noisy workloads don't evict them.

## Metrics Strategy: RED + USE

**RED for request-driven services**:
- **R**ate — `sum by (service) (rate(http_requests_total[2m]))`
- **E**rrors — `sum by (service) (rate(http_requests_total{code=~"5.."}[2m]))`
- **D**uration — `histogram_quantile(0.99, sum by (le, service) (rate(http_request_duration_seconds_bucket[5m])))`

**USE for resources** (node pools, RDS, cache, queues):
- **U**tilization — CPU, memory, disk, connections (e.g. `pg_stat_activity_count`)
- **S**aturation — queue depth, waiting threads (`node_load1`, `pg_locks_count`)
- **E**rrors — restart count, OOM, evictions (`kube_pod_container_status_restarts_total`)

## SLO Skeleton (per service)

For request-driven services, two SLIs:
- **Availability**: success rate over 28d ≥ target (e.g. 99.5% for prod, 99.0% for staging)
- **Latency**: p99 < target (typically 500ms for sync APIs, 2s for ML / RAG)

Express via recording rules:

```yaml
groups:
  - name: slo-<service>-<env>
    interval: 30s
    rules:
      - record: slo:<service>:availability_30d
        expr: |
          sum(rate(http_requests_total{service="<service>",namespace="<ns>",code!~"5.."}[30d]))
          / sum(rate(http_requests_total{service="<service>",namespace="<ns>"}[30d]))
      - alert: <Service>ErrorBudgetBurn
        expr: |
          (1 - slo:<service>:availability_30d) > (1 - 0.995) * 14.4    # fast burn (1h window)
        for: 5m
        labels: { severity: critical, team: <team> }
        annotations:
          summary: "<service> error budget burning fast (<env>)"
```

Use multi-window / multi-burn-rate alerts (Google SRE workbook pattern) — fast burn alert pages on 1h window, slow burn on 6h window.

## Alert Routing

Use a `team` label on every alert and route via Grafana / Alertmanager notification policy. Typical taxonomy:
- App-level alerts (5xx rate, latency SLO burn, app crash loops) → app team channel
- Observability infra (Prometheus down, scrape failures, monitoring disk full) → observability team channel
- Cluster infra (node pressure, autoscaler scale failures, RDS CPU, ESO sync errors) → platform / devops channel
- Release / sync events → release channel

Hard rule: **don't page** app teams for infra problems — route to the platform team and let them fan out.

## Adding a New Service

1. Expose `/metrics` (Prometheus format) on the app port (or a sidecar exporter).
2. Annotate the pod template:

```yaml
podAnnotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "<port>"
  prometheus.io/path: "/metrics"
```

3. Verify after sync:

```bash
kubectl port-forward -n monitoring svc/prometheus-server 9090:80
# Browser → http://localhost:9090/targets — should list <svc>:<port> as UP
```

4. Add RED dashboard panel (clone an existing service dashboard, swap `service="<svc>"` label).
5. Add SLO + alert rule for the service.

## Loki / Log Queries (LogQL)

```bash
# All errors from a service in a namespace, last 30m
{namespace="<ns>",app="<svc>"} |~ "ERROR|FATAL" | json
# Correlate with trace ids
{namespace="<ns>",app="<svc>"} | json | line_format "{{.timestamp}} {{.level}} {{.msg}}" | regexp "trace_id=(?P<trace>[^\s]+)"
```

Recipes worth saving:
- 5xx spike correlation: `sum by (service) (count_over_time({namespace="<ns>"} |= "ERROR" [5m]))`
- ExternalSecrets sync failures: `{namespace="external-secrets"} |= "SecretSyncedError"`

## Dashboard Conventions

- One dashboard per service.
- Panels in fixed order: Rate / Errors / Duration / Saturation (CPU+mem) / SLO burn / Recent deploys.
- Variables: `$env`, `$namespace`, `$pod`.
- Annotations: deploy events (Loki query against CD-tool logs).

Don't dashboard-bomb. If a metric isn't tied to an SLO or a known failure mode, it's noise.

## High Query Load Triage

When Prometheus / Grafana saturates:

1. **High-cardinality `by` clause** — find via `{namespace="monitoring",app="prometheus"} |= "high cardinality"`; rewrite to bound cardinality (group by `service` not `pod`).
2. **Recording rule expansion** — rules computing huge histograms each interval. Lower frequency or pre-aggregate.
3. **Scrape target explosion** — autoscaler scaled out and a faulty exporter joined; check `up == 0` targets.

Mitigation: drop unused recording rules; add `metric_relabel_configs` to drop high-cardinality labels (UUIDs, user IDs, full URL paths).

## Tracing

For distributed tracing: OTel Collector as DaemonSet, exporters to Tempo (Grafana-native) or Jaeger / Datadog APM / X-Ray. Instrument with OpenTelemetry SDKs in the app — avoid vendor-specific SDKs that lock in.

## Observability Cost Hygiene

- Loki: per-tenant retention; 7d for app logs, 30d for security/audit if compliance allows.
- Prometheus: 15d local retention; remote-write to managed (AMP / Grafana Cloud) only if longer history matters.
- Don't add Datadog/New Relic alongside an existing stack without removing the duplicated component.
- Cardinality budget: set `--storage.tsdb.max-block-chunk-size`, monitor `prometheus_tsdb_head_series`, alert when growing >10%/week.

## Anti-Patterns

- Alerts without `team` label — routes to default catchall, ignored
- High-cardinality labels (user_id, request_id, full URL path) on metrics
- Logging the same data via both `console.log` and a structured logger — Loki double-counts
- Dashboards with > 30 panels — split by service or by RED layer
- Adding a second observability vendor alongside the first without removing the duplicate

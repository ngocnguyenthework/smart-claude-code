# Agent Orchestration

## Reviewer routing (auto-trigger on file change)

| Change | Agent |
|---|---|
| NestJS | nestjs-reviewer |
| FastAPI | fastapi-reviewer |
| Terraform | terraform-reviewer |
| K8s manifest | k8s-reviewer |
| DB / migration | database-reviewer |
| Frontend (React/Next) | frontend-reviewer |
| IaC pre-deploy | infra-security-reviewer |
| Architecture decision | aws-architect |

## Parallel execution
Independent agent tasks → launch in one message (parallel tool calls). Never serialize independent reviews.

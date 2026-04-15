# Agent Orchestration

## Available Agents

Located in `smartclaude/agents/`:

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| nestjs-reviewer | NestJS code review | NestJS code changes |
| fastapi-reviewer | FastAPI code review | FastAPI code changes |
| terraform-reviewer | Terraform plan review | Before terraform apply |
| k8s-reviewer | K8s manifest review | K8s manifest changes |
| aws-architect | AWS architecture design | Infrastructure decisions |
| database-reviewer | PostgreSQL + ORM review | Database/migration changes |
| infra-security-reviewer | IaC security scan | Before infrastructure deployment |
| frontend-reviewer | React/Next.js/Tailwind review | Frontend code changes |

## Immediate Agent Usage

No user prompt needed:
1. NestJS code changed → Use **nestjs-reviewer**
2. FastAPI code changed → Use **fastapi-reviewer**
3. Terraform files changed → Use **terraform-reviewer**
4. K8s manifests changed → Use **k8s-reviewer**
5. Database/migration changed → Use **database-reviewer**
6. Frontend code changed → Use **frontend-reviewer**
7. Before any infra deploy → Use **infra-security-reviewer**
8. Architecture decisions → Use **aws-architect**

## Parallel Task Execution

ALWAYS use parallel execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of Terraform changes
2. Agent 2: K8s manifest review
3. Agent 3: Database migration review

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

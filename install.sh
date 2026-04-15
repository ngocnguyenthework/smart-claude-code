#!/usr/bin/env bash
# smart-claude install wrapper.
#
# Usage:
#   ./install.sh --context <name>[,<name>...] [flags]
#
# Contexts:
#   common     baseline (always included)
#   backend    NestJS + FastAPI + PostgreSQL
#   devops     Terraform + Terragrunt + K8s + ArgoCD + Helm + Kustomize + AWS
#   frontend   React + Next.js + Tailwind + shadcn/ui + E2E
#   all        every context
#
# Flags (pass-through to scripts/install.js):
#   --context <names>  Required. Comma-separated contexts.
#   --target <harness> Optional. claude | cursor | codex (default: claude)
#   --dir <path>       Optional. Target project root (default: cwd).
#   --dry-run          Print planned operations, don't copy.
#   --force            Overwrite existing files.
#   --skip-scripts     Skip copying scripts/hooks and scripts/lib.
#   --help             Show full help.
#
# Examples:
#   ./install.sh --context frontend                 # install into current dir
#   ./install.sh --context backend,devops --force   # full-stack + IaC
#   ./install.sh --context all --dir ~/code/app
#   ./install.sh --context devops --target cursor --dry-run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "[install.sh] Node.js is required but was not found on PATH." >&2
  exit 1
fi

exec node "$SCRIPT_DIR/scripts/install.js" "$@"

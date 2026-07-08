# Mosaic Life - Local Development & Cluster Operations
#
# Production and staging deployments are handled by CI (.github/workflows/build-push.yml,
# cdk-deploy.yml) and reconciled by ArgoCD from the GitOps repository. This justfile
# covers what CI doesn't: local development, validation, and cluster inspection/debugging.
#
# GitOps Repository: https://github.com/mosaic-stories/gitops
# Helm charts live in this repo (infra/helm/mosaic-life); values in the GitOps repo.

AWS_REGION := env_var_or_default("AWS_REGION", "us-east-1")
AWS_ACCOUNT := "033691785857"
CLUSTER_NAME := "mosaiclife-eks"
NAMESPACE := "mosaiclife"
COMPOSE := "docker compose -f infra/compose/docker-compose.yml"

# Default recipe - show available commands
default:
    @echo "Mosaic Life"
    @echo ""
    @echo "Local dev:    just start | stop | dev | dev-backend | dev-logs [service]"
    @echo "Validation:   just validate-backend | validate-frontend | validate-all"
    @echo "ArgoCD:       just argocd-ui | argocd-status [app] | argocd-sync [app]"
    @echo "Cluster:      just pods | logs [service] | port-forward [service]"
    @echo ""
    @just --list

# ============================================================
# Local Development (Docker Compose)
# ============================================================

# Start the full local stack
start:
    {{COMPOSE}} up -d
    @echo ""
    @echo "✓ Docker Compose stack started"
    @echo "  - Web App:     http://localhost:5173"
    @echo "  - API:         http://localhost:8080 (docs at /docs)"
    @echo "  - PostgreSQL:  localhost:25432"
    @echo "  - Neptune:     http://localhost:18182"
    @echo ""
    @echo "Logs: just dev-logs [service]   Stop: just stop"

# Stop the local stack (containers preserved)
stop:
    {{COMPOSE}} stop
    @echo "✓ Docker Compose stack stopped"

# Tear down the local stack (removes containers)
down:
    {{COMPOSE}} down

# Restart the local stack
restart:
    {{COMPOSE}} restart
    @echo "✓ Docker Compose stack restarted"

# Rebuild local stack from scratch (no cache)
rebuild-docker:
    {{COMPOSE}} down
    docker volume rm compose_web-node-modules
    {{COMPOSE}} build --no-cache
    {{COMPOSE}} up -d

# Tail local service logs
dev-logs service="":
    {{COMPOSE}} logs -f {{service}}

# Start backend services only (for use with Vite dev server)
dev-backend:
    {{COMPOSE}} up -d core-api postgres neptune-local
    @echo ""
    @echo "✓ Backend services started"
    @echo "  - API:         http://localhost:8080 (docs at /docs)"
    @echo "  - PostgreSQL:  localhost:25432"
    @echo "  - Neptune:     http://localhost:18182"
    @echo ""
    @echo "Run the frontend with: just dev"

# Run Vite dev server for frontend development (with hot reload)
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Starting Vite dev server..."
    echo "Make sure backend is running: just dev-backend"
    cd apps/web
    npm install
    npm run dev

# ============================================================
# Code Quality & Validation
# ============================================================

# Run ruff linting on backend code (checks app/ and tests/ to match CI)
lint-backend:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Running ruff linting on services/core-api..."
    cd services/core-api
    uv run ruff check .
    echo "✓ Ruff linting passed"

# Check ruff formatting on backend code (checks app/ and tests/ to match CI)
format-backend:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Checking ruff formatting on services/core-api..."
    cd services/core-api
    uv run ruff format --check .
    echo "✓ Ruff formatting check passed"

# Run mypy type checking on backend code
typecheck-backend:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Running mypy type checking on services/core-api..."
    cd services/core-api
    uv run mypy app/
    echo "✓ MyPy type checking passed"

# Run all backend validation (ruff lint + format + mypy)
validate-backend: lint-backend format-backend typecheck-backend
    @echo ""
    @echo "✓ All backend validation checks passed!"

# Run ruff linting with auto-fix and formatting (fixes app/ and tests/ to match CI)
lint-fix-backend:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Running ruff with auto-fix and formatting on services/core-api..."
    cd services/core-api
    uv run ruff check --fix .
    uv run ruff format .
    echo "✓ Ruff auto-fix and formatting completed"

# Run frontend linting
lint-frontend:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Running ESLint on apps/web..."
    cd apps/web
    npm run lint
    echo "✓ ESLint passed"

# Run frontend type checking
typecheck-frontend:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Running TypeScript type checking on apps/web..."
    cd apps/web
    npx tsc --noEmit
    echo "✓ TypeScript type checking passed"

# Run all frontend validation (lint + typecheck)
validate-frontend: lint-frontend typecheck-frontend
    @echo ""
    @echo "✓ All frontend validation checks passed!"

# Run all validation checks (backend + frontend)
validate-all: validate-backend validate-frontend
    @echo ""
    @echo "✓ ALL validation checks passed!"

# ============================================================
# Documentation
# ============================================================

# Serve documentation locally with hot reload
docs-serve:
    cd apps/docs && uv run mkdocs serve

# Build documentation (includes OpenAPI and TypeDoc generation)
docs-build:
    cd apps/docs && bash scripts/build.sh

# Generate OpenAPI specification only
docs-generate-openapi:
    cd apps/docs && bash scripts/generate-openapi.sh

# Generate TypeScript documentation only
docs-generate-typedoc:
    cd apps/docs && bash scripts/generate-typedoc.sh

# Build docs Docker image
docs-docker-build:
    {{COMPOSE}} --profile docs build docs

# Start docs service in Docker
docs-docker-up:
    {{COMPOSE}} --profile docs up docs -d

# Stop docs service in Docker
docs-docker-down:
    {{COMPOSE}} --profile docs down

# ============================================================
# Cluster Access & Debugging
# ============================================================

# Update kubeconfig for the EKS cluster
kubeconfig:
    aws eks update-kubeconfig --name {{CLUSTER_NAME}} --region {{AWS_REGION}}

# Show cluster info
cluster-info:
    @echo "Cluster: {{CLUSTER_NAME}}"
    @echo "Region: {{AWS_REGION}}"
    @echo "Account: {{AWS_ACCOUNT}}"
    @echo ""
    kubectl cluster-info
    @echo ""
    kubectl get nodes

# Get all pods in namespace
pods:
    kubectl get pods -n {{NAMESPACE}}

# Tail application logs
logs service="core-api" follow="true":
    #!/usr/bin/env bash
    if [ "{{follow}}" = "true" ]; then
      kubectl logs -f -n {{NAMESPACE}} -l app={{service}} --tail=100
    else
      kubectl logs -n {{NAMESPACE}} -l app={{service}} --tail=100
    fi

# Execute command in pod
exec service="core-api" cmd="bash":
    kubectl exec -it -n {{NAMESPACE}} $(kubectl get pod -n {{NAMESPACE}} -l app={{service}} -o jsonpath='{.items[0].metadata.name}') -- {{cmd}}

# Port forward to service
port-forward service="core-api" local_port="8080" remote_port="8080":
    kubectl port-forward -n {{NAMESPACE}} svc/{{service}} {{local_port}}:{{remote_port}}

# Run database migrations in the deployed core-api pod
db-migrate:
    #!/usr/bin/env bash
    set -euo pipefail
    POD=$(kubectl get pods -n {{NAMESPACE}} -l app.kubernetes.io/name=core-api -o jsonpath='{.items[0].metadata.name}')
    if [ -z "$POD" ]; then
      echo "Error: No core-api pods found in namespace {{NAMESPACE}}"
      exit 1
    fi
    echo "Running migrations in pod: $POD"
    kubectl exec -n {{NAMESPACE}} "$POD" -- alembic upgrade head

# ============================================================
# ArgoCD Management
# ============================================================

# Port-forward to ArgoCD UI
argocd-ui port="8085":
    @echo "ArgoCD UI will be available at: http://localhost:{{port}}"
    @echo "Press Ctrl+C to stop"
    kubectl port-forward -n argocd svc/argocd-server {{port}}:443

# Get ArgoCD admin password
argocd-password:
    @echo "ArgoCD Admin Password:"
    @kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
    @echo ""

# Login to ArgoCD CLI (requires port-forward or ingress)
argocd-login server="localhost:8085":
    #!/usr/bin/env bash
    set -euo pipefail
    PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)
    argocd login {{server}} --username admin --password "$PASSWORD" --insecure
    echo "✓ Logged into ArgoCD"

# Get ArgoCD application status
argocd-status app="mosaic-life-prod":
    argocd app get {{app}}

# List all mosaic-life ArgoCD applications
argocd-list:
    @echo "Mosaic Life ArgoCD Applications:"
    argocd app list | grep mosaic-life || echo "No mosaic-life applications found"

# Sync an ArgoCD application (trigger deployment)
argocd-sync app="mosaic-life-prod":
    argocd app sync {{app}}
    @echo "✓ Syncing {{app}}"

# Watch ArgoCD application sync status
argocd-watch app="mosaic-life-prod":
    argocd app wait {{app}} --sync

# Show ArgoCD application diff
argocd-diff app="mosaic-life-prod":
    argocd app diff {{app}}

# Apply ArgoCD project and application manifests
argocd-apply:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Applying ArgoCD project and application manifests..."
    kubectl apply -f infra/argocd/projects/mosaic-life.yaml
    kubectl apply -f infra/argocd/applications/mosaic-life-prod.yaml
    kubectl apply -f infra/argocd/applications/mosaic-life-staging.yaml
    kubectl apply -f infra/argocd/applications/graph-explorer-prod.yaml
    echo "✓ ArgoCD project and applications configured"
    echo ""
    echo "Note: Preview applications are created dynamically by CI/CD"

# ============================================================
# Staging Environment
# ============================================================

# Show staging ArgoCD apps and live namespace resources
stage-status:
    #!/usr/bin/env bash
    set -euo pipefail
    APPS=(mosaic-life-staging docs-staging prerender-staging)
    echo "Staging ArgoCD applications:"
    kubectl get applications -n argocd "${APPS[@]}" -o wide --ignore-not-found=true
    echo ""
    echo "Staging namespace resources:"
    kubectl get pods,deploy,svc,ingress,hpa,pdb,externalsecret,secretstore -n mosaic-staging --ignore-not-found=true

# Spin down staging by deleting only staging ArgoCD applications
stage-down confirm="":
    #!/usr/bin/env bash
    set -euo pipefail
    APPS=(mosaic-life-staging docs-staging prerender-staging)
    if [ "{{confirm}}" != "mosaic-staging" ]; then
      echo "Refusing to spin down staging without explicit confirmation."
      echo "This deletes only these ArgoCD Applications in namespace argocd:"
      printf '  - %s\n' "${APPS[@]}"
      echo ""
      echo "Run: just stage-down mosaic-staging"
      exit 1
    fi

    echo "Spinning down staging ArgoCD applications:"
    printf '  - %s\n' "${APPS[@]}"
    echo ""
    for app in "${APPS[@]}"; do
      kubectl delete application -n argocd "$app" --ignore-not-found=true --wait=false
    done

    echo ""
    echo "Waiting for ArgoCD application deletion and resource pruning..."
    for app in "${APPS[@]}"; do
      if kubectl get application -n argocd "$app" >/dev/null 2>&1; then
        kubectl wait --for=delete "application/$app" -n argocd --timeout=10m
      fi
    done

    echo ""
    echo "Remaining resources in mosaic-staging:"
    kubectl get pods,deploy,svc,ingress,hpa,pdb,externalsecret,secretstore -n mosaic-staging --ignore-not-found=true
    echo ""
    echo "✓ Staging spin-down requested. Production applications were not touched."

# Restore staging ArgoCD applications
stage-up:
    #!/usr/bin/env bash
    set -euo pipefail
    APPS=(mosaic-life-staging docs-staging prerender-staging)
    echo "Restoring staging ArgoCD applications..."
    kubectl apply -f infra/argocd/applications/mosaic-life-staging.yaml
    kubectl apply -f infra/argocd/applications/docs-staging.yaml
    kubectl apply -f infra/argocd/applications/prerender-staging.yaml

    if command -v argocd >/dev/null 2>&1; then
      echo ""
      echo "Triggering ArgoCD sync for staging applications..."
      for app in "${APPS[@]}"; do
        if ! argocd app sync "$app" --async; then
          echo "Warning: argocd sync failed for $app; automated sync may still reconcile it."
        fi
      done
    else
      echo ""
      echo "argocd CLI not found; relying on automated sync."
    fi

    echo ""
    echo "✓ Staging restore requested."
    echo "Monitor with: just stage-wait-up"

# Wait for staging ArgoCD apps to be synced and healthy
stage-wait-up timeout="600":
    #!/usr/bin/env bash
    set -euo pipefail
    APPS=(mosaic-life-staging docs-staging prerender-staging)
    if command -v argocd >/dev/null 2>&1; then
      for app in "${APPS[@]}"; do
        argocd app wait "$app" --sync --health --timeout {{timeout}}
      done
    else
      echo "argocd CLI is required for sync/health waiting."
      exit 1
    fi
    echo "✓ Staging applications are synced and healthy."

# ============================================================
# Utilities
# ============================================================

# Count lines of code in the repository
count-lines:
    cloc --exclude-dir='.claude,.git,.github,.local,.worktrees,.mypy_cache,node_modules,.pytest_cache,.ruff_cache,.venv'  .

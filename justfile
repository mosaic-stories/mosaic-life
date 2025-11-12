# Mosaic Life - Build and Deployment Automation
# Uses existing infrastructure from https://github.com/mosaic-stories/infrastructure
#
# DEPLOYMENT STRATEGY:
# - Production & Staging: Managed by ArgoCD from GitOps repo (recommended)
# - Local Development: Docker Compose or manual Helm deployments
# - Emergency/Testing: Direct Helm deployments (bypasses GitOps)
#
# GitOps Repository: https://github.com/mosaic-stories/gitops (at /apps/mosaic-life-gitops)
# Helm charts are in this repo (infra/helm/mosaic-life)
# Values are in the GitOps repo (environments/prod, environments/staging)

# Configuration from existing infrastructure
AWS_REGION := env_var_or_default("AWS_REGION", "us-east-1")
AWS_ACCOUNT := "033691785857"
CLUSTER_NAME := "mosaiclife-eks"
NAMESPACE := "mosaiclife"

# Existing ECR repository URLs
ECR_REGISTRY := AWS_ACCOUNT + ".dkr.ecr." + AWS_REGION + ".amazonaws.com"
ECR_WEB := ECR_REGISTRY + "/mosaic-life/web"
ECR_CORE_API := ECR_REGISTRY + "/mosaic-life/core-api"

# Existing resources
COGNITO_USER_POOL_ID := "us-east-1_JLppKC09m"
S3_MEDIA_BUCKET := "mosaic-prod-media-" + AWS_ACCOUNT
S3_BACKUP_BUCKET := "mosaic-prod-backups-" + AWS_ACCOUNT

# Default recipe - show available commands
default:
    @echo "════════════════════════════════════════════════════════════════"
    @echo "Mosaic Life - Available Commands"
    @echo "════════════════════════════════════════════════════════════════"
    @echo ""
    @echo "🚀 RECOMMENDED WORKFLOWS:"
    @echo "  gitops-deploy [env]     - Deploy via GitOps (prod/staging)"
    @echo "  bootstrap [version]     - Initial setup (DNS, ECR, ArgoCD)"
    @echo "  dev                     - Start frontend dev server"
    @echo "  dev-backend             - Start backend services only"
    @echo ""
    @echo "📋 ALL COMMANDS:"
    @just --list
    @echo ""
    @echo "════════════════════════════════════════════════════════════════"
    @echo "💡 Quick Start:"
    @echo "  First time:  just bootstrap"
    @echo "  Deploy code: just gitops-deploy prod"
    @echo "  Local dev:   just dev-backend && just dev"
    @echo "════════════════════════════════════════════════════════════════"

# ============================================================
# DNS & Certificate (minimal CDK for DNS/ACM only)
# ============================================================

# Deploy only DNS and Certificate (all other infra exists)
dns-deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Deploying DNS and Certificate resources..."
    cd infra/cdk
    npm install
    npm run build
    npx cdk deploy MosaicDnsCertificateStack --require-approval never

# Destroy DNS and Certificate
dns-destroy:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "WARNING: This will destroy DNS and Certificate resources"
    read -p "Are you sure? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
      cd infra/cdk
      npx cdk destroy MosaicDnsCertificateStack
    else
      echo "Aborted"
    fi

# Show DNS/Certificate CDK diff
dns-diff:
    cd infra/cdk && npm run build && npx cdk diff MosaicDnsCertificateStack

# ============================================================
# Database (RDS PostgreSQL)
# ============================================================

# Deploy RDS Database Stack via CDK
db-deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Deploying RDS PostgreSQL database..."
    echo "Configuration: db.t3.micro, PostgreSQL 16, Single-AZ"
    echo "Estimated cost: ~$15-19/month"
    cd infra/cdk
    npm install
    npm run build
    npx cdk deploy MosaicDatabaseStack --require-approval never
    echo ""
    echo "✓ Database deployed successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Update IRSA role annotation in Helm values"
    echo "  2. Deploy application: just gitops-deploy prod"
    echo "  3. Check database connection: just db-info"

# Show database connection information
db-info:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "═══════════════════════════════════════════════════════════"
    echo "RDS PostgreSQL Connection Information"
    echo "═══════════════════════════════════════════════════════════"
    
    # Get outputs from CloudFormation
    DB_ENDPOINT=$(aws cloudformation describe-stacks \
      --stack-name MosaicDatabaseStack \
      --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
      --output text 2>/dev/null || echo "Not deployed")
    
    DB_PORT=$(aws cloudformation describe-stacks \
      --stack-name MosaicDatabaseStack \
      --query 'Stacks[0].Outputs[?OutputKey==`DatabasePort`].OutputValue' \
      --output text 2>/dev/null || echo "5432")
    
    DB_NAME=$(aws cloudformation describe-stacks \
      --stack-name MosaicDatabaseStack \
      --query 'Stacks[0].Outputs[?OutputKey==`DatabaseName`].OutputValue' \
      --output text 2>/dev/null || echo "mosaic")
    
    SECRET_ARN=$(aws cloudformation describe-stacks \
      --stack-name MosaicDatabaseStack \
      --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
      --output text 2>/dev/null || echo "Not available")
    
    IRSA_ROLE_ARN=$(aws cloudformation describe-stacks \
      --stack-name MosaicDatabaseStack \
      --query 'Stacks[0].Outputs[?OutputKey==`CoreApiSecretsRoleArn`].OutputValue' \
      --output text 2>/dev/null || echo "Not available")
    
    echo "Endpoint:    $DB_ENDPOINT"
    echo "Port:        $DB_PORT"
    echo "Database:    $DB_NAME"
    echo ""
    echo "Secret ARN:  $SECRET_ARN"
    echo "IRSA Role:   $IRSA_ROLE_ARN"
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "To get database credentials:"
    echo "  just db-get-credentials"
    echo ""
    echo "To connect from a pod:"
    echo "  kubectl run -it --rm psql --image=postgres:16 --restart=Never -- \\"
    echo "    psql postgresql://USER:PASS@$DB_ENDPOINT:$DB_PORT/$DB_NAME"
    echo "═══════════════════════════════════════════════════════════"

# Get database credentials from Secrets Manager
db-get-credentials:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Fetching database credentials from AWS Secrets Manager..."
    
    SECRET_ARN=$(aws cloudformation describe-stacks \
      --stack-name MosaicDatabaseStack \
      --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
      --output text 2>/dev/null)
    
    if [ -z "$SECRET_ARN" ] || [ "$SECRET_ARN" = "None" ]; then
      echo "Error: Database not deployed or secret not found"
      echo "Run: just db-deploy"
      exit 1
    fi
    
    aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text | jq .

# Show CDK diff for database stack
db-diff:
    cd infra/cdk && npm run build && npx cdk diff MosaicDatabaseStack

# Run database migrations manually
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

# Connect to database via psql (requires kubectl run)
db-shell:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Getting database credentials..."
    
    # Get credentials secret ARN
    SECRET_ARN=$(aws cloudformation describe-stacks \
      --stack-name MosaicDatabaseStack \
      --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
      --output text 2>/dev/null)
    
    # Get database endpoint
    DB_ENDPOINT=$(aws cloudformation describe-stacks \
      --stack-name MosaicDatabaseStack \
      --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
      --output text 2>/dev/null)
    
    if [ -z "$SECRET_ARN" ] || [ "$SECRET_ARN" = "None" ] || [ -z "$DB_ENDPOINT" ]; then
      echo "Error: Database not deployed"
      exit 1
    fi
    
    SECRET=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)
    DB_USER=$(echo "$SECRET" | jq -r .username)
    DB_PASS=$(echo "$SECRET" | jq -r .password)
    
    echo "Connecting to database..."
    kubectl run -it --rm psql-$(date +%s) --image=postgres:16 --restart=Never --namespace={{NAMESPACE}} -- \
      psql "postgresql://$DB_USER:$DB_PASS@$DB_ENDPOINT:5432/mosaic"

# Destroy database stack (with confirmation)
db-destroy:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "⚠️  WARNING: This will destroy the RDS database and all data!"
    echo "This action cannot be undone."
    echo ""
    read -p "Type 'DELETE DATABASE' to confirm: " confirm
    if [ "$confirm" = "DELETE DATABASE" ]; then
      cd infra/cdk
      npx cdk destroy MosaicDatabaseStack
      echo "✓ Database stack destroyed"
    else
      echo "Aborted"
    fi

# ============================================================
# Docker Image Build
# ============================================================

# Build all Docker images
build-all: build-web build-core-api

# Build frontend web image
build-web version="latest":
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Building web frontend image..."
    cd apps/web
    docker build \
      -t mosaic-life/web:{{version}} \
      -t mosaic-life/web:latest \
      -f Dockerfile \
      .
    echo "✓ Built mosaic-life/web:{{version}}"

# Build core-api image
build-core-api version="latest":
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Building core-api image..."
    cd services/core-api
    docker build \
      -t mosaic-life/core-api:{{version}} \
      -t mosaic-life/core-api:latest \
      -f Dockerfile \
      .
    echo "✓ Built mosaic-life/core-api:{{version}}"

# ============================================================
# ECR Operations (using existing repositories)
# ============================================================

# Login to AWS ECR
ecr-login:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Logging into ECR..."
    aws ecr get-login-password --region {{AWS_REGION}} | \
      docker login --username AWS --password-stdin {{ECR_REGISTRY}}
    echo "✓ Logged into ECR"

# Push all images to ECR
push-all version="latest": ecr-login (push-web version) (push-core-api version)

# Tag and push web image to ECR
push-web version="latest": ecr-login
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Pushing web image to ECR..."
    docker tag mosaic-life/web:{{version}} {{ECR_WEB}}:{{version}}
    docker tag mosaic-life/web:{{version}} {{ECR_WEB}}:latest
    docker push {{ECR_WEB}}:{{version}}
    docker push {{ECR_WEB}}:latest
    echo "✓ Pushed {{ECR_WEB}}:{{version}}"

# Tag and push core-api image to ECR
push-core-api version="latest": ecr-login
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Pushing core-api image to ECR..."
    docker tag mosaic-life/core-api:{{version}} {{ECR_CORE_API}}:{{version}}
    docker tag mosaic-life/core-api:{{version}} {{ECR_CORE_API}}:latest
    docker push {{ECR_CORE_API}}:{{version}}
    docker push {{ECR_CORE_API}}:latest
    echo "✓ Pushed {{ECR_CORE_API}}:{{version}}"

# ============================================================
# Complete Build and Push Pipeline
# ============================================================

# Build and push all images (versioned)
release version="latest": (build-web version) (build-core-api version) (push-all version)
    @echo "✓ Released version {{version}}"

# Build and push with git commit SHA
release-sha:
    #!/usr/bin/env bash
    set -euo pipefail
    GIT_SHA=$(git rev-parse --short HEAD)
    echo "Building and pushing with SHA: $GIT_SHA"
    just release $GIT_SHA
    echo "✓ Released version $GIT_SHA"

# ============================================================
# Kubernetes Deployment (to existing cluster)
# ============================================================

# Update kubeconfig for existing cluster
kubeconfig:
    aws eks update-kubeconfig --name {{CLUSTER_NAME}} --region {{AWS_REGION}}

# Install/Upgrade Helm chart (manual deployment, bypasses ArgoCD)
# NOTE: Only use this for local testing or emergency deployments
# Normal deployments are managed by ArgoCD from the GitOps repository
helm-deploy version="latest":
    #!/usr/bin/env bash
    set -euo pipefail

    echo "Deploying Mosaic Life to Kubernetes cluster: {{CLUSTER_NAME}}"
    echo "Namespace: {{NAMESPACE}}"
    echo "Registry: {{ECR_REGISTRY}}"
    echo "Version: {{version}}"

    # Ensure kubeconfig is set
    aws eks update-kubeconfig --name {{CLUSTER_NAME}} --region {{AWS_REGION}}

    # Get certificate ARN if available
    CERT_ARN=$(aws cloudformation describe-stacks \
      --stack-name MosaicDnsCertificateStack \
      --query 'Stacks[0].Outputs[?OutputKey==`CertificateArn`].OutputValue' \
      --output text 2>/dev/null || echo "")

    # Create namespace if it doesn't exist
    kubectl create namespace {{NAMESPACE}} --dry-run=client -o yaml | kubectl apply -f -

    # Deploy using Helm
    HELM_ARGS="--namespace {{NAMESPACE}} \
      --set global.registry={{ECR_REGISTRY}} \
      --set global.imageTag={{version}} \
      --set global.domain=mosaiclife.me \
      --set global.environment=prod \
      --set global.aws.region={{AWS_REGION}} \
      --set global.aws.accountId={{AWS_ACCOUNT}}"

    if [ -n "$CERT_ARN" ]; then
      HELM_ARGS="$HELM_ARGS --set global.aws.certificateArn=$CERT_ARN"
    fi

    helm upgrade --install mosaic-life infra/helm/mosaic-life \
      $HELM_ARGS \
      --wait \
      --timeout 5m

    echo "✓ Deployment complete"

# Uninstall Helm chart
helm-uninstall:
    helm uninstall mosaic-life --namespace {{NAMESPACE}}

# Show Helm values
helm-values:
    helm get values mosaic-life --namespace {{NAMESPACE}}

# ============================================================
# Complete Deployment Workflow
# ============================================================

# Note: Deployments are managed by ArgoCD. Use these recipes for local development
# or when you need to manually deploy outside of the GitOps workflow.

# Recommended: Deploy via GitOps (builds, pushes, updates gitops repo)
gitops-deploy environment="prod":
    #!/usr/bin/env bash
    set -euo pipefail
    
    echo "🚀 GitOps Deployment to {{environment}}"
    echo "════════════════════════════════════════════════"
    echo ""
    
    # Step 1: Build and push images with git SHA
    echo "📦 Step 1/3: Building and pushing images..."
    GIT_SHA=$(git rev-parse --short HEAD)
    just release $GIT_SHA
    echo "✓ Images pushed with tag: $GIT_SHA"
    echo ""
    
    # Step 2: Update GitOps repo
    echo "📝 Step 2/3: Updating GitOps repository..."
    just gitops-update-tag {{environment}} $GIT_SHA
    echo ""
    
    # Step 3: Watch deployment
    echo "👀 Step 3/3: Monitoring ArgoCD deployment..."
    echo "ArgoCD will automatically sync the changes."
    echo ""
    echo "Watch with: just argocd-watch mosaic-life-{{environment}}"

# Bootstrap entire application from scratch (one-time full setup)
bootstrap version="latest":
    #!/usr/bin/env bash
    set -euo pipefail
    
    echo "🚀 Bootstrapping Mosaic Life from scratch..."
    echo ""
    
    # Step 1: DNS and Certificates
    echo "📋 Step 1/5: Deploying DNS and Certificate resources..."
    just dns-deploy
    echo "✓ DNS and certificates deployed"
    echo ""
    
    # Step 2: Build images
    echo "🔨 Step 2/5: Building Docker images..."
    just build-all
    echo "✓ Images built"
    echo ""
    
    # Step 3: Push to ECR
    echo "📤 Step 3/5: Pushing images to ECR..."
    just push-all {{version}}
    echo "✓ Images pushed"
    echo ""
    
    # Step 4: Configure ArgoCD
    echo "⚙️  Step 4/5: Configuring ArgoCD applications..."
    just argocd-apply
    echo "✓ ArgoCD applications configured"
    echo ""
    
    # Step 5: Trigger ArgoCD sync
    echo "🔄 Step 5/5: Syncing ArgoCD applications..."
    echo "Note: ArgoCD will automatically deploy to prod and staging environments"
    echo "Monitor deployment status with: just argocd-watch mosaic-life-prod"
    echo ""
    
    echo "════════════════════════════════════════════════"
    echo "✨ Bootstrap Complete!"
    echo "════════════════════════════════════════════════"
    echo ""
    echo "ArgoCD is now managing deployments from the GitOps repository."
    echo ""
    echo "Next steps:"
    echo "  1. Watch prod deployment:    just argocd-watch mosaic-life-prod"
    echo "  2. Watch staging deployment: just argocd-watch mosaic-life-staging"
    echo "  3. View ArgoCD UI:           just argocd-ui"
    echo "  4. Check service URLs:       just urls"

# Teardown entire application (reverses bootstrap)
teardown keep-images="false":
    #!/usr/bin/env bash
    set -euo pipefail
    
    echo "🧹 Tearing down Mosaic Life..."
    echo ""
    echo "⚠️  WARNING: This will remove all deployed resources!"
    echo "   - ArgoCD applications (if present)"
    echo "   - Kubernetes deployments and services"
    echo "   - ECR container images"
    echo "   - DNS records and certificates"
    if [ "{{keep-images}}" = "false" ]; then
      echo "   - Local Docker images"
    fi
    echo ""
    read -p "Are you absolutely sure? Type 'teardown' to confirm: " confirm
    
    if [ "$confirm" != "teardown" ]; then
      echo "❌ Aborted - confirmation failed"
      exit 1
    fi
    
    echo ""
    echo "════════════════════════════════════════════════"
    echo "Starting teardown process..."
    echo "════════════════════════════════════════════════"
    echo ""
    
    # Step 0: Remove ArgoCD applications if they exist
    echo "🔧 Step 0/5: Removing ArgoCD applications..."
    if kubectl get application -n argocd mosaic-life-prod 2>/dev/null; then
      echo "   Deleting mosaic-life-prod application..."
      kubectl delete application -n argocd mosaic-life-prod || true
    fi
    if kubectl get application -n argocd mosaic-life-staging 2>/dev/null; then
      echo "   Deleting mosaic-life-staging application..."
      kubectl delete application -n argocd mosaic-life-staging || true
    fi
    # Delete any preview applications
    kubectl get applications -n argocd -l app.kubernetes.io/part-of=mosaic-life -o name 2>/dev/null | xargs -r kubectl delete -n argocd || true
    echo "✓ ArgoCD applications removed"
    echo ""
    
    # Wait for ArgoCD to clean up resources
    echo "   Waiting for ArgoCD to clean up resources..."
    sleep 15
    echo ""
    
    # Step 1: Uninstall Helm release (if any manual deployments exist)
    echo "☸️  Step 1/5: Removing any manual Kubernetes deployments..."
    if helm list -n {{NAMESPACE}} | grep -q mosaic-life; then
      just helm-uninstall
      echo "✓ Helm release uninstalled"
    else
      echo "ℹ️  No Helm release found (skipping)"
    fi
    
    # Wait for resources to clean up
    echo "   Waiting for resources to terminate..."
    sleep 10
    
    # Check if namespace has any remaining resources
    REMAINING=$(kubectl get all -n {{NAMESPACE}} 2>/dev/null | wc -l || echo "0")
    if [ "$REMAINING" -gt 1 ]; then
      echo "⚠️  Warning: Namespace still has resources, waiting longer..."
      sleep 20
    fi
    echo ""
    
    # Step 2: Delete ECR images
    echo "📦 Step 2/5: Deleting ECR images..."
    just ecr-login
    
    # Delete web images
    WEB_IMAGES=$(aws ecr list-images \
      --repository-name mosaic-life/web \
      --region {{AWS_REGION}} \
      --query 'imageIds[*]' \
      --output json 2>/dev/null || echo "[]")
    
    if [ "$WEB_IMAGES" != "[]" ] && [ "$WEB_IMAGES" != "" ]; then
      echo "   Deleting web images..."
      aws ecr batch-delete-image \
        --repository-name mosaic-life/web \
        --region {{AWS_REGION}} \
        --image-ids "$WEB_IMAGES" >/dev/null 2>&1 || true
      echo "   ✓ Web images deleted"
    else
      echo "   ℹ️  No web images found"
    fi
    
    # Delete core-api images
    API_IMAGES=$(aws ecr list-images \
      --repository-name mosaic-life/core-api \
      --region {{AWS_REGION}} \
      --query 'imageIds[*]' \
      --output json 2>/dev/null || echo "[]")
    
    if [ "$API_IMAGES" != "[]" ] && [ "$API_IMAGES" != "" ]; then
      echo "   Deleting core-api images..."
      aws ecr batch-delete-image \
        --repository-name mosaic-life/core-api \
        --region {{AWS_REGION}} \
        --image-ids "$API_IMAGES" >/dev/null 2>&1 || true
      echo "   ✓ Core-api images deleted"
    else
      echo "   ℹ️  No core-api images found"
    fi
    echo ""
    
    # Step 3: Destroy DNS and Certificates
    echo "🌐 Step 3/4: Removing DNS and Certificate resources..."
    if aws cloudformation describe-stacks \
      --stack-name MosaicDnsCertificateStack \
      --region {{AWS_REGION}} >/dev/null 2>&1; then
      cd infra/cdk
      npx cdk destroy MosaicDnsCertificateStack --force
      echo "✓ DNS and certificates destroyed"
    else
      echo "ℹ️  No DNS/Certificate stack found (skipping)"
    fi
    echo ""
    
    # Step 4: Clean local Docker images (optional)
    if [ "{{keep-images}}" = "false" ]; then
      echo "🐳 Step 4/5: Cleaning local Docker images..."
      docker rmi mosaic-life/web:latest 2>/dev/null || true
      docker rmi mosaic-life/core-api:latest 2>/dev/null || true
      docker rmi {{ECR_WEB}}:latest 2>/dev/null || true
      docker rmi {{ECR_CORE_API}}:latest 2>/dev/null || true
      echo "✓ Local images cleaned"
    else
      echo "🐳 Step 4/5: Keeping local Docker images (as requested)"
    fi
    echo ""
    
    # Step 5: Clean up ArgoCD project (optional)
    echo "🗑️  Step 5/5: ArgoCD project cleanup..."
    echo "Note: ArgoCD project 'mosaic-life' is preserved"
    echo "      Delete manually if needed: kubectl delete appproject -n argocd mosaic-life"
    echo ""
    
    echo "════════════════════════════════════════════════"
    echo "✨ Teardown Complete!"
    echo "════════════════════════════════════════════════"
    echo ""
    echo "Note: The following resources were NOT removed"
    echo "(managed by infrastructure repository):"
    echo "  - EKS Cluster: {{CLUSTER_NAME}}"
    echo "  - ECR Repositories (empty but still exist)"
    echo "  - Cognito User Pool: {{COGNITO_USER_POOL_ID}}"
    echo "  - S3 Buckets: {{S3_MEDIA_BUCKET}}, {{S3_BACKUP_BUCKET}}"
    echo "  - VPC and networking resources"
    echo ""
    echo "To remove these, use the infrastructure repository:"
    echo "https://github.com/mosaic-stories/infrastructure"

# Full deployment: build, push, and deploy via Helm (manual, bypasses GitOps)
# NOTE: Only use this for local testing or emergency deployments
# Normal deployments should go through ArgoCD via the gitops-deploy-sha recipe
deploy version="latest": (release version) (helm-deploy version)
    @echo "✓ Complete deployment finished"
    @echo ""
    @echo "⚠️  WARNING: This deployed directly via Helm, bypassing ArgoCD"
    @echo "   For production deployments, use: just gitops-deploy-sha"

# Deploy with git SHA via Helm (manual, bypasses GitOps)  
# NOTE: Only use this for local testing or emergency deployments
deploy-sha: release-sha
    #!/usr/bin/env bash
    GIT_SHA=$(git rev-parse --short HEAD)
    just helm-deploy $GIT_SHA
    echo ""
    echo "⚠️  WARNING: This deployed directly via Helm, bypassing ArgoCD"
    echo "   For production deployments, use: just gitops-deploy-sha"

# ============================================================
# Development
# ============================================================

# Run Vite dev server for frontend development (with hot reload)
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Starting Vite dev server..."
    echo "Make sure backend is running: just dev-backend"
    cd apps/web
    npm install
    npm run dev

# Start backend services only (for use with Vite dev server)
dev-backend:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Starting backend services (without web container)..."
    docker compose -f infra/compose/docker-compose.yml up -d core-api postgres opensearch localstack jaeger
    @echo ""
    @echo "✓ Backend services started"
    @echo ""
    @echo "Services:"
    @echo "  - API:           http://localhost:8080"
    @echo "  - API Docs:      http://localhost:8080/docs"
    @echo "  - Jaeger UI:     http://localhost:16686"
    @echo "  - OpenSearch:    http://localhost:9200"
    @echo "  - PostgreSQL:    localhost:15432"
    @echo ""
    @echo "Run frontend with: just dev"
    @echo "Or full stack:     just start"

# Start local development environment (full Docker Compose stack)
dev-up:
    docker-compose -f infra/compose/docker-compose.yml up -d
    @echo "✓ Development environment started"
    @echo "Frontend: http://localhost:5173"
    @echo "Backend: http://localhost:8080"

# Stop local development environment
dev-down:
    docker-compose -f infra/compose/docker-compose.yml down

# View local logs
dev-logs service="":
    docker-compose -f infra/compose/docker-compose.yml logs -f {{service}}

# Start docker-compose stack
start:
    docker compose -f infra/compose/docker-compose.yml up -d
    @echo "✓ Docker Compose stack started"
    @echo ""
    @echo "Services:"
    @echo "  - Web App:       http://localhost:3001"
    @echo "  - API:           http://localhost:8080"
    @echo "  - API Docs:      http://localhost:8080/docs"
    @echo "  - Jaeger UI:     http://localhost:16686"
    @echo "  - OpenSearch:    http://localhost:9200"
    @echo "  - PostgreSQL:    localhost:15432"
    @echo ""
    @echo "View logs with: just dev-logs [service]"
    @echo "Stop with:      just stop"

# Stop docker-compose stack
stop:
    docker compose -f infra/compose/docker-compose.yml stop
    @echo "✓ Docker Compose stack stopped"

# Restart docker-compose stack
restart:
    docker compose -f infra/compose/docker-compose.yml restart
    @echo "✓ Docker Compose stack restarted"

# ============================================================
# Cluster Information
# ============================================================

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

# Describe ingress
ingress:
    kubectl get ingress -n {{NAMESPACE}}
    @echo ""
    kubectl describe ingress -n {{NAMESPACE}}

# Get service URLs
urls:
    @echo "Fetching service URLs..."
    @kubectl get ingress -n {{NAMESPACE}} -o jsonpath='{.items[*].spec.rules[*].host}' | tr ' ' '\n'

# ============================================================
# Logs and Debugging
# ============================================================

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

# ============================================================
# ArgoCD Management
# ============================================================

# Apply ArgoCD project configuration
argocd-apply-project:
    kubectl apply -f infra/argocd/projects/mosaic-life.yaml
    @echo "✓ ArgoCD project configured"

# Apply all ArgoCD application manifests
argocd-apply:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Applying ArgoCD project and application manifests..."
    kubectl apply -f infra/argocd/projects/mosaic-life.yaml
    kubectl apply -f infra/argocd/applications/mosaic-life-prod.yaml
    kubectl apply -f infra/argocd/applications/mosaic-life-staging.yaml
    echo "✓ ArgoCD project and applications configured"
    echo ""
    echo "Note: Preview applications are created dynamically by CI/CD"

# Apply production ArgoCD application
argocd-apply-prod:
    kubectl apply -f infra/argocd/applications/mosaic-life-prod.yaml
    @echo "✓ Production application configured"

# Apply staging ArgoCD application
argocd-apply-staging:
    kubectl apply -f infra/argocd/applications/mosaic-life-staging.yaml
    @echo "✓ Staging application configured"

# Get ArgoCD application status
argocd-status app="mosaic-life-prod":
    argocd app get {{app}}

# List all mosaic-life ArgoCD applications
argocd-list:
    @echo "Mosaic Life ArgoCD Applications:"
    @echo "════════════════════════════════════════════════"
    argocd app list | grep mosaic-life || echo "No mosaic-life applications found"

# Sync an ArgoCD application (trigger deployment)
argocd-sync app="mosaic-life-prod":
    argocd app sync {{app}}
    @echo "✓ Syncing {{app}}"

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

# Watch ArgoCD application sync status
argocd-watch app="mosaic-life-prod":
    argocd app wait {{app}} --sync

# Show ArgoCD application diff
argocd-diff app="mosaic-life-prod":
    argocd app diff {{app}}

# Update GitOps repo with new image tag (manual deployment)
gitops-update-tag environment="prod" tag="":
    #!/usr/bin/env bash
    set -euo pipefail
    
    GITOPS_DIR="/apps/mosaic-life-gitops"
    
    # Get current git SHA if no tag provided
    if [ -z "{{tag}}" ]; then
      TAG=$(git rev-parse --short HEAD)
      echo "No tag provided, using current commit SHA: $TAG"
    else
      TAG="{{tag}}"
    fi
    
    echo "Updating {{environment}} environment to use image tag: $TAG"
    echo ""
    
    # Check if gitops repo exists
    if [ ! -d "$GITOPS_DIR" ]; then
      echo "❌ GitOps repository not found at $GITOPS_DIR"
      echo "Please clone it first:"
      echo "  cd /apps && git clone https://github.com/mosaic-stories/gitops.git mosaic-life-gitops"
      exit 1
    fi
    
    cd "$GITOPS_DIR"
    
    # Pull latest changes
    echo "Pulling latest changes from GitOps repo..."
    git pull origin main
    echo ""
    
    # Update the image tag
    echo "Updating image tag in environments/{{environment}}/values.yaml..."
    # Using jq filter syntax with -y flag for YAML output (compatible with Python-based yq)
    yq -yi ".global.imageTag = \"$TAG\"" "environments/{{environment}}/values.yaml"
    
    echo ""
    echo "Updated values:"
    cat "environments/{{environment}}/values.yaml"
    echo ""
    
    # Commit and push (non-interactive)
    git add "environments/{{environment}}/values.yaml"
    git commit -m "deploy({{environment}}): manual update to image tag $TAG"
    git push origin main
    echo ""
    echo "✅ GitOps repository updated"
    echo "🚀 ArgoCD will automatically sync the {{environment}} environment"
    echo ""
    echo "Monitor deployment:"
    echo "  just argocd-watch mosaic-life-{{environment}}"

# Deploy specific git SHA to environment via GitOps
gitops-deploy-sha sha="" environment="prod": (gitops-update-tag environment sha)
    @echo "Deployment initiated for SHA {{sha}} to {{environment}}"

# ============================================================
# AWS Resource Information
# ============================================================

# Get Cognito configuration
cognito-info:
    @echo "Cognito User Pool: {{COGNITO_USER_POOL_ID}}"
    @aws cognito-idp describe-user-pool --user-pool-id {{COGNITO_USER_POOL_ID}} --query 'UserPool.{Name:Name,Status:Status,Domain:Domain}' --output table

# List S3 buckets
s3-info:
    @echo "Media Bucket: {{S3_MEDIA_BUCKET}}"
    @echo "Backup Bucket: {{S3_BACKUP_BUCKET}}"
    @echo ""
    @aws s3 ls | grep mosaic

# List ECR repositories
ecr-info:
    @aws ecr describe-repositories --repository-names mosaic-life/web mosaic-life/core-api --query 'repositories[*].{Name:repositoryName,URI:repositoryUri}' --output table

# Show VPC information
vpc-info:
    @echo "EKS Cluster VPC Information:"
    @aws eks describe-cluster --name {{CLUSTER_NAME}} --query 'cluster.resourcesVpcConfig.{VpcId:vpcId,SubnetIds:subnetIds}' --output json

# ============================================================
# Secrets Management
# ============================================================

# Get Cognito client configuration (requires client ID from infrastructure repo)
get-cognito-config:
    #!/usr/bin/env bash
    set -euo pipefail

    # This assumes secrets are managed in the infrastructure repo
    # Fetch from AWS Secrets Manager if available

    echo "Cognito Configuration:"
    echo "User Pool ID: {{COGNITO_USER_POOL_ID}}"
    echo ""
    echo "To get client details, check the infrastructure repository or AWS Console"
    echo "https://console.aws.amazon.com/cognito/v2/idp/user-pools/{{COGNITO_USER_POOL_ID}}/app-integration/clients"

# ============================================================
# Cleanup
# ============================================================

# Clean Docker images
clean-images:
    docker system prune -f
    docker image prune -f

# Clean everything (images, volumes, networks)
clean-all:
    docker system prune -af --volumes

# ============================================================
# Utilities
# ============================================================

# Get AWS account ID
get-account:
    @echo {{AWS_ACCOUNT}}

# Show all existing resources
show-resources:
    @echo "═══════════════════════════════════════════════════"
    @echo "Mosaic Life - Existing AWS Resources"
    @echo "═══════════════════════════════════════════════════"
    @echo ""
    @echo "EKS Cluster: {{CLUSTER_NAME}}"
    @echo "Namespace: {{NAMESPACE}}"
    @echo "Region: {{AWS_REGION}}"
    @echo "Account: {{AWS_ACCOUNT}}"
    @echo ""
    @echo "Cognito User Pool: {{COGNITO_USER_POOL_ID}}"
    @echo "S3 Media Bucket: {{S3_MEDIA_BUCKET}}"
    @echo "S3 Backup Bucket: {{S3_BACKUP_BUCKET}}"
    @echo ""
    @echo "ECR Registry: {{ECR_REGISTRY}}"
    @echo "  - {{ECR_WEB}}"
    @echo "  - {{ECR_CORE_API}}"
    @echo ""
    @echo "All infrastructure managed in:"
    @echo "https://github.com/mosaic-stories/infrastructure"

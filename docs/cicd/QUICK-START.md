# CI/CD Quick Start Guide

Get your CI/CD pipeline up and running in 30 minutes.

## Prerequisites Checklist

- [ ] AWS CLI configured with admin access
- [ ] kubectl configured for EKS cluster `mosaiclife-eks`
- [ ] GitHub repository admin access
- [ ] ArgoCD installed on EKS cluster
- [ ] yq installed (`brew install yq`)
- [ ] GitHub CLI installed (`brew install gh`)
- [ ] **IAM OIDC provider and roles already configured** (managed in infrastructure repository)
- [ ] **EKS RBAC already configured** (managed in infrastructure repository)

## Step 1: Verify IAM Configuration (2 minutes)

> **Note**: IAM roles and OIDC configuration are managed in the infrastructure repository and should already be deployed. This step verifies the configuration.

```bash
# Verify OIDC provider exists
aws iam list-open-id-connect-providers | grep token.actions.githubusercontent.com

# Verify required IAM roles exist
aws iam get-role --role-name github-actions-ecr-push
aws iam get-role --role-name github-actions-eks-deploy
aws iam get-role --role-name github-actions-kubectl-role

# Verify role outputs
echo "✅ All IAM roles configured"
```

## Step 2: Verify EKS RBAC Configuration (2 minutes)

> **Note**: EKS RBAC configuration is managed in the infrastructure repository and should already be applied. This step verifies the configuration.

```bash
# Verify ClusterRole exists
kubectl get clusterrole github-actions-deploy

# Verify ClusterRoleBinding exists
kubectl get clusterrolebinding github-actions-deploy

# Verify preview environment role
kubectl get clusterrole github-actions-preview

echo "✅ EKS RBAC configured"
```

## Step 3: Create GitOps Repository (10 minutes)

```bash
# Create the GitOps repository on GitHub
gh repo create mosaic-stories/mosaic-gitops --public

# Clone and set up structure
git clone https://github.com/mosaic-stories/mosaic-gitops.git
cd mosaic-gitops

# Create directory structure
mkdir -p environments/{prod,staging,preview} base

# Create base values
cat > base/values.yaml <<EOF
global:
  registry: 033691785857.dkr.ecr.us-east-1.amazonaws.com
  domain: mosaiclife.me
web:
  enabled: true
coreApi:
  enabled: true
EOF

# Create production values
cat > environments/prod/values.yaml <<EOF
global:
  imageTag: main-latest
  environment: prod
web:
  replicaCount: 2
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
coreApi:
  replicaCount: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
EOF

# Create staging values
cat > environments/staging/values.yaml <<EOF
global:
  imageTag: develop-latest
  environment: staging
web:
  replicaCount: 1
  autoscaling:
    enabled: false
coreApi:
  replicaCount: 2
  autoscaling:
    enabled: false
EOF

# Commit and push
git add .
git commit -m "Initial GitOps repository structure"
git push -u origin main
```

## Step 4: Create GitHub PAT for GitOps (2 minutes)

```bash
# Create a PAT with repo scope
# Go to: https://github.com/settings/tokens/new
# Scopes: repo (full control)
# Copy the token

# Add to repository secrets
gh secret set GITOPS_PAT --repo mosaic-stories/mosaic-life
# Paste the PAT when prompted
```

## Step 5: Configure ArgoCD (5 minutes)

```bash
# Add repositories to ArgoCD
argocd repo add https://github.com/mosaic-stories/mosaic-life \
  --username mosaic-bot \
  --password $(gh auth token)

argocd repo add https://github.com/mosaic-stories/mosaic-gitops \
  --username mosaic-bot \
  --password $(gh auth token)

# Apply ArgoCD project and applications
kubectl apply -f infra/argocd/projects/mosaic-life.yaml
kubectl apply -f infra/argocd/applications/mosaic-life-prod.yaml
kubectl apply -f infra/argocd/applications/mosaic-life-staging.yaml

# Verify applications
argocd app list
```

## Step 6: Test the Pipeline (3 minutes)

```bash
# Trigger a build manually
gh workflow run build-push.yml --ref main

# Watch the workflow
gh run watch

# Check ArgoCD sync status
argocd app get mosaic-life-prod
```

## Step 7: Test Preview Environment (5 minutes)

```bash
# Create a test branch
git checkout -b test-preview-env
git commit --allow-empty -m "test: preview environment"
git push origin test-preview-env

# Create a PR
gh pr create --title "Test Preview Environment" --body "Testing automated preview deployment"

# Wait for the workflow to complete
gh pr checks

# Check the PR comment for preview URLs
gh pr view --web
```

## Verification Steps

### ✅ Verify IAM Roles

```bash
# These roles are managed in the infrastructure repository
aws iam get-role --role-name github-actions-ecr-push
aws iam get-role --role-name github-actions-eks-deploy
aws iam get-role --role-name github-actions-kubectl-role
```

### ✅ Verify EKS RBAC

```bash
# These resources are managed in the infrastructure repository
kubectl get clusterrole github-actions-deploy
kubectl get clusterrolebinding github-actions-deploy
```

### ✅ Verify ArgoCD Apps

```bash
argocd app list
argocd app get mosaic-life-prod
argocd app get mosaic-life-staging
```

### ✅ Verify Workflows

```bash
gh workflow list
gh run list --workflow=ci.yml
gh run list --workflow=build-push.yml
```

### ✅ Verify ECR Repositories

```bash
aws ecr describe-repositories --repository-names mosaic-life/web
aws ecr describe-repositories --repository-names mosaic-life/core-api
```

## Troubleshooting Common Issues

### Issue: IAM roles not found

**Error**: `NoSuchEntity: The role with name github-actions-ecr-push cannot be found`

**Solution**:
```bash
# IAM roles are managed in the infrastructure repository
# Contact infrastructure team or check infrastructure repository deployment status
# Repository: mosaic-stories/mosaic-infrastructure (or equivalent)
```

### Issue: GitHub Actions can't assume role

**Error**: `User is not authorized to perform: sts:AssumeRoleWithWebIdentity`

**Solution**:
```bash
# Verify OIDC provider exists (managed in infrastructure repository)
aws iam list-open-id-connect-providers

# Check trust relationship
aws iam get-role --role-name github-actions-ecr-push \
  --query 'Role.AssumeRolePolicyDocument'

# Ensure the trust policy allows this repository:
# "token.actions.githubusercontent.com:sub": "repo:mosaic-stories/mosaic-life:*"
```

### Issue: ArgoCD can't access repository

**Error**: `repository not found`

**Solution**:
```bash
# Verify repository credentials
argocd repo list

# Re-add repository with correct credentials
argocd repo rm https://github.com/mosaic-stories/mosaic-life
argocd repo add https://github.com/mosaic-stories/mosaic-life \
  --username mosaic-bot \
  --password $(gh auth token)
```

### Issue: Preview environment not accessible

**Error**: DNS record not created

**Solution**:
```bash
# Check External DNS is running
kubectl get deployment external-dns -n kube-system

# Check External DNS logs
kubectl logs -n kube-system deployment/external-dns

# Verify Route53 hosted zone
aws route53 list-hosted-zones
```

## Next Steps

After completing the quick start:

1. **Configure notifications**: Set up Slack alerts for ArgoCD
2. **Enable monitoring**: Configure Prometheus/Grafana dashboards
3. **Set up alerts**: Create CloudWatch alarms for failures
4. **Review security**: Audit IAM roles and RBAC permissions
5. **Document runbooks**: Create incident response procedures

## Useful Commands

```bash
# View workflow runs
gh run list --limit 10

# View specific workflow run logs
gh run view <run-id> --log

# Manually sync ArgoCD app
argocd app sync mosaic-life-prod

# List all preview environments
kubectl get namespaces -l type=preview

# Clean up old preview environments
kubectl delete namespace preview-pr-<number>

# View ArgoCD app history
argocd app history mosaic-life-prod

# Rollback ArgoCD app
argocd app rollback mosaic-life-prod <revision>
```

## Monitoring Dashboard

Access these URLs to monitor your deployments:

- **GitHub Actions**: https://github.com/mosaic-stories/mosaic-life/actions
- **ArgoCD UI**: `kubectl port-forward svc/argocd-server -n argocd 8080:443`
- **Jaeger Tracing**: `kubectl port-forward svc/jaeger-query -n observability 16686:16686`
- **Grafana**: `kubectl port-forward svc/grafana -n observability 3000:80`

## Support

If you encounter issues:

1. Check the [full documentation](./README.md)
2. Review [setup instructions](../../infra/iam/setup-instructions.md)
3. Check [ArgoCD documentation](../../infra/argocd/README.md)
4. Open an issue with the `cicd` label
5. Ask in #mosaic-devops Slack channel

# AWS and Kubernetes Setup for GitHub Actions CI/CD

> **⚠️ DEPRECATED**: This file is retained for historical reference only.
>
> **IAM roles, OIDC configuration, and EKS RBAC are now managed in the infrastructure repository.**
>
> The CloudFormation templates and Kubernetes RBAC manifests previously in this directory have been moved to the infrastructure repository for centralized management.
>
> To set up or modify CI/CD infrastructure:
> 1. Refer to the infrastructure repository documentation
> 2. Deploy changes through the infrastructure repository's deployment process
> 3. Verify configuration using the commands in `docs/cicd/QUICK-START.md`

---

## Historical Reference

This guide previously walked through setting up AWS IAM roles, OIDC provider, and Kubernetes RBAC for the GitHub Actions CI/CD pipeline. The configuration is now centrally managed.

## Prerequisites (Historical)

- AWS CLI configured with admin credentials
- kubectl configured for the EKS cluster
- GitHub repository admin access
- AWS Account ID: `033691785857`
- EKS Cluster: `mosaiclife-eks`

## Required IAM Roles (Now in Infrastructure Repo)

The following roles must be configured:

1. **github-actions-ecr-push**: Allows pushing container images to ECR
2. **github-actions-eks-deploy**: Allows deployment operations to EKS
3. **github-actions-kubectl-role**: Assumed by deploy role to execute kubectl commands

## Required EKS RBAC (Now in Infrastructure Repo)

The following Kubernetes resources must be applied:

1. **ClusterRole: github-actions-deploy**: Permissions for standard deployments
2. **ClusterRoleBinding: github-actions-deploy**: Binds the role to the GitHub Actions user
3. **ClusterRole: github-actions-preview**: Full access for preview environments
4. **ClusterRoleBinding: github-actions-preview**: Binds preview role

## Verification

See `docs/cicd/QUICK-START.md` for current verification steps.

---

## Old Step 1: Deploy IAM Roles and OIDC Provider (Historical)

### Option A: Using CloudFormation (Recommended)

```bash
# Deploy the CloudFormation stack
aws cloudformation create-stack \
  --stack-name mosaic-life-github-actions-oidc \
  --template-body file://infra/iam/github-actions-oidc.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=GitHubOrg,ParameterValue=mosaic-stories \
    ParameterKey=GitHubRepo,ParameterValue=mosaic-life

# Wait for stack creation
aws cloudformation wait stack-create-complete \
  --stack-name mosaic-life-github-actions-oidc

# Get the output values
aws cloudformation describe-stacks \
  --stack-name mosaic-life-github-actions-oidc \
  --query 'Stacks[0].Outputs'
```

### Option B: Manual Setup

If you prefer to create resources manually:

1. **Create OIDC Provider:**

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

2. **Create IAM Roles:**

See the CloudFormation template for the exact policies needed for each role.

## Step 2: Configure EKS Cluster Access

### Update aws-auth ConfigMap

Add the GitHub Actions IAM role to the EKS cluster's aws-auth ConfigMap:

```bash
# Get current aws-auth ConfigMap
kubectl get configmap aws-auth -n kube-system -o yaml > aws-auth-patch.yaml

# Edit aws-auth-patch.yaml and add the following to mapRoles:
```

```yaml
- rolearn: arn:aws:iam::033691785857:role/github-actions-kubectl-role
  username: github-actions-kubectl
  groups:
    - system:masters  # Or a more restrictive group
```

```bash
# Apply the updated ConfigMap
kubectl apply -f aws-auth-patch.yaml
```

### Apply Kubernetes RBAC

```bash
# Apply the RBAC configuration
kubectl apply -f infra/iam/eks-rbac.yaml

# Verify the ClusterRole was created
kubectl get clusterrole github-actions-deploy
kubectl get clusterrolebinding github-actions-deploy
```

## Step 3: Create GitHub Secrets

### Required Repository Secrets

Go to GitHub repository → Settings → Secrets and variables → Actions

You don't need to create AWS credentials as secrets since we're using OIDC! The workflows will automatically assume the IAM roles.

### Optional Secrets

If using the GitOps update workflow, create:

1. **GITOPS_PAT**: Personal Access Token for the GitOps repository
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Create token with `repo` scope
   - Add as repository secret

## Step 4: Create GitOps Repository

If you haven't already, create the GitOps repository:

```bash
# Create the repository structure
mkdir -p mosaic-gitops/{environments/{prod,staging,preview},base}

# Create base values.yaml
cat > mosaic-gitops/base/values.yaml <<EOF
global:
  registry: 033691785857.dkr.ecr.us-east-1.amazonaws.com
  domain: mosaiclife.me

web:
  enabled: true

coreApi:
  enabled: true
EOF

# Create environment-specific values
cat > mosaic-gitops/environments/prod/values.yaml <<EOF
global:
  imageTag: main-latest  # Will be updated by GitHub Actions
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

# Initialize git and push
cd mosaic-gitops
git init
git add .
git commit -m "Initial GitOps repository structure"
git remote add origin https://github.com/mosaic-stories/mosaic-gitops.git
git push -u origin main
```

## Step 5: Install ArgoCD (if not already installed)

```bash
# Create ArgoCD namespace
kubectl create namespace argocd

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD to be ready
kubectl wait --for=condition=available --timeout=300s \
  deployment/argocd-server -n argocd

# Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d

# Port forward to access ArgoCD UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

## Step 6: Configure ArgoCD

```bash
# Install ArgoCD CLI (macOS)
brew install argocd

# Login to ArgoCD
argocd login localhost:8080 --username admin --password <password-from-step-5>

# Add repositories
argocd repo add https://github.com/mosaic-stories/mosaic-life \
  --username mosaic-bot \
  --password $GITHUB_PAT

argocd repo add https://github.com/mosaic-stories/mosaic-gitops \
  --username mosaic-bot \
  --password $GITHUB_PAT

# Apply ArgoCD applications
kubectl apply -f infra/argocd/projects/mosaic-life.yaml
kubectl apply -f infra/argocd/applications/mosaic-life-prod.yaml
kubectl apply -f infra/argocd/applications/mosaic-life-staging.yaml
```

## Step 7: Configure Route53 and External DNS

### Verify External DNS is running

```bash
kubectl get deployment external-dns -n kube-system
```

### If not installed, deploy External DNS:

```bash
# Create IAM policy for External DNS
aws iam create-policy \
  --policy-name mosaic-external-dns-policy \
  --policy-document file://infra/iam/external-dns-policy.json

# Create IRSA for External DNS
eksctl create iamserviceaccount \
  --cluster=mosaiclife-eks \
  --namespace=kube-system \
  --name=external-dns \
  --attach-policy-arn=arn:aws:iam::033691785857:policy/mosaic-external-dns-policy \
  --approve

# Deploy External DNS
kubectl apply -f infra/k8s/external-dns.yaml
```

## Step 8: Test the Setup

### Test ECR Push

```bash
# Trigger a manual workflow run
gh workflow run build-push.yml --ref main
```

### Test Preview Environment

```bash
# Create a test PR
git checkout -b test-preview
git commit --allow-empty -m "Test preview environment"
git push origin test-preview

# Open PR on GitHub
gh pr create --title "Test Preview" --body "Testing preview environment deployment"
```

### Verify ArgoCD Sync

```bash
# Check application status
argocd app get mosaic-life-prod

# Force sync if needed
argocd app sync mosaic-life-prod
```

## Step 9: Security Hardening

### Enable Image Signing Verification

```bash
# Install cosign
brew install cosign

# Generate signing key pair
cosign generate-key-pair

# Store the private key in GitHub Secrets
# Public key can be stored in the repository
```

### Enable Policy Enforcement

```bash
# Install OPA Gatekeeper
kubectl apply -f https://raw.githubusercontent.com/open-policy-agent/gatekeeper/master/deploy/gatekeeper.yaml

# Apply image verification policies
kubectl apply -f infra/policies/image-verification.yaml
```

## Troubleshooting

### GitHub Actions cannot assume IAM role

Check that the OIDC provider thumbprint is correct:

```bash
aws iam list-open-id-connect-providers
aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn <provider-arn>
```

### kubectl commands fail in GitHub Actions

Verify the aws-auth ConfigMap:

```bash
kubectl get configmap aws-auth -n kube-system -o yaml
```

### Preview environment not accessible

Check DNS records:

```bash
# Verify Route53 record was created
aws route53 list-resource-record-sets \
  --hosted-zone-id Z039487930F6987CJO4W9 \
  --query "ResourceRecordSets[?contains(Name, 'pr-')]"

# Check External DNS logs
kubectl logs -n kube-system deployment/external-dns
```

### ArgoCD not syncing

Check ArgoCD application status:

```bash
argocd app get mosaic-life-prod
kubectl describe application mosaic-life-prod -n argocd
```

## Monitoring and Alerts

### Set up CloudWatch Alarms

```bash
# Create SNS topic for alerts
aws sns create-topic --name mosaic-cicd-alerts

# Create CloudWatch alarms for failed deployments
aws cloudwatch put-metric-alarm \
  --alarm-name mosaic-deployment-failures \
  --alarm-description "Alert on deployment failures" \
  --metric-name FailedDeployments \
  --namespace GitHub/Actions \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:033691785857:mosaic-cicd-alerts
```

## Next Steps

1. Configure Slack/email notifications for ArgoCD
2. Set up deployment metrics dashboard
3. Implement blue-green or canary deployments
4. Add automated rollback on health check failures
5. Enable audit logging for all deployments

## References

- [GitHub Actions OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [External DNS Documentation](https://github.com/kubernetes-sigs/external-dns)
- [EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)

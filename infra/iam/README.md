# IAM Configuration

> **⚠️ Configuration Managed Externally**

IAM roles, OIDC provider configuration, and EKS RBAC for CI/CD are **managed in the infrastructure repository**, not in this application repository.

## What's Managed Externally

### AWS IAM Resources
- **GitHub OIDC Provider** (`token.actions.githubusercontent.com`)
- **IAM Roles**:
  - `github-actions-ecr-push` - Push container images to ECR
  - `github-actions-eks-deploy` - Deploy to EKS cluster
  - `github-actions-kubectl-role` - Execute kubectl commands
  - `github-actions-gitops-update` - Update GitOps repository (optional)

### Kubernetes RBAC Resources
- **ClusterRole: github-actions-deploy** - Deployment permissions
- **ClusterRoleBinding: github-actions-deploy** - Bind role to GitHub Actions
- **ClusterRole: github-actions-preview** - Preview environment permissions
- **ClusterRoleBinding: github-actions-preview** - Bind preview role

## For Application Developers

You **don't need to manage these resources** for regular development work. The CI/CD workflows in `.github/workflows/` will automatically use the pre-configured IAM roles via OIDC.

### Verifying Configuration

To verify that CI/CD infrastructure is properly configured:

```bash
# Check IAM roles exist
aws iam get-role --role-name github-actions-ecr-push
aws iam get-role --role-name github-actions-eks-deploy

# Check Kubernetes RBAC
kubectl get clusterrole github-actions-deploy
kubectl get clusterrolebinding github-actions-deploy
```

See `docs/cicd/QUICK-START.md` for detailed verification steps.

## For Infrastructure Operators

To set up or modify CI/CD infrastructure:

1. Navigate to the infrastructure repository
2. Follow the infrastructure repository's deployment procedures
3. Deploy IAM and RBAC configurations through infrastructure-as-code
4. Verify deployment using the commands above

## Historical Reference

The `setup-instructions.md` file in this directory is retained for historical reference but is no longer the active deployment method.

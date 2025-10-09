# CI/CD Infrastructure Management Change

**Date**: October 8, 2025  
**Status**: Complete

## Summary

IAM roles, OIDC provider configuration, and EKS RBAC resources for CI/CD have been **moved to the infrastructure repository** for centralized management. This simplifies the application repository and aligns with infrastructure-as-code best practices.

## What Changed

### Files Removed
- `infra/iam/github-actions-oidc.yaml` - CloudFormation template (moved to infrastructure repo)
- `infra/iam/eks-rbac.yaml` - Kubernetes RBAC manifests (moved to infrastructure repo)

### Files Updated
- `docs/cicd/QUICK-START.md` - Simplified to verify existing configuration instead of deploying it
- `docs/cicd/README.md` - Updated to reflect external management of IAM resources
- `docs/CICD.md` - Added note about infrastructure repository management
- `infra/iam/setup-instructions.md` - Marked as deprecated/historical reference
- `INFRASTRUCTURE_SETUP.md` - Updated CI/CD checklist item

### Files Added
- `infra/iam/README.md` - Guide explaining external management and verification steps
- `docs/cicd/INFRASTRUCTURE_CHANGE.md` - This document

## For Developers

**No changes required to your workflow.** GitHub Actions workflows will continue to work unchanged. The IAM roles are assumed automatically via OIDC.

### What You Need to Know
1. IAM roles and OIDC configuration are pre-configured (managed externally)
2. Workflows in `.github/workflows/` use these roles automatically
3. No AWS credentials needed in repository secrets

### Verification
To verify CI/CD infrastructure is configured:

```bash
# Check IAM roles
aws iam get-role --role-name github-actions-ecr-push
aws iam get-role --role-name github-actions-eks-deploy

# Check Kubernetes RBAC
kubectl get clusterrole github-actions-deploy
```

See `docs/cicd/QUICK-START.md` for complete verification steps.

## For Infrastructure Operators

### Required IAM Roles (In Infrastructure Repo)
1. **github-actions-ecr-push** - Push container images to ECR
2. **github-actions-eks-deploy** - Deploy to EKS
3. **github-actions-kubectl-role** - Execute kubectl commands
4. **github-actions-gitops-update** - Update GitOps repository (optional)

### Required Kubernetes RBAC (In Infrastructure Repo)
1. **ClusterRole: github-actions-deploy** - Standard deployment permissions
2. **ClusterRoleBinding: github-actions-deploy** - Binds role to GitHub Actions user
3. **ClusterRole: github-actions-preview** - Preview environment permissions
4. **ClusterRoleBinding: github-actions-preview** - Binds preview role

### OIDC Provider
- **Provider URL**: `token.actions.githubusercontent.com`
- **Audience**: `sts.amazonaws.com`
- **Thumbprint**: `6938fd4d98bab03faadb97b34396831e3780aea1`

### Trust Policy Requirements
IAM roles must trust the GitHub repository:
```json
{
  "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
  },
  "StringLike": {
    "token.actions.githubusercontent.com:sub": "repo:mosaic-stories/mosaic-life:*"
  }
}
```

## Benefits of This Change

1. **Centralized Infrastructure Management**
   - All infrastructure-as-code in one place
   - Easier to audit and maintain
   - Single deployment process for infrastructure changes

2. **Simplified Application Repository**
   - Developers don't need to manage IAM configuration
   - Cleaner repository structure
   - Focus on application code

3. **Better Security Posture**
   - Infrastructure changes go through infrastructure repo approval
   - Separation of concerns (app vs. infrastructure)
   - Reduced risk of accidental IAM misconfiguration

4. **Improved Developer Experience**
   - CI/CD "just works" - configuration is pre-done
   - No need to understand CloudFormation or IAM for app development
   - Faster onboarding

## Migration Notes

### For Existing Deployments
If you previously deployed using the CloudFormation template from this repository:

1. The IAM roles and OIDC provider should remain unchanged
2. No immediate action required
3. Future updates to IAM configuration will be managed in infrastructure repo
4. Consider migrating to infrastructure repo management on next update cycle

### For New Deployments
1. Ensure infrastructure repository has deployed IAM and RBAC resources
2. Verify configuration using `docs/cicd/QUICK-START.md`
3. GitHub Actions workflows will work automatically

## Documentation References

- **Quick Start**: `docs/cicd/QUICK-START.md` - Verification and setup
- **Full Documentation**: `docs/cicd/README.md` - Complete CI/CD pipeline details
- **Architecture**: `docs/CICD.md` - High-level CI/CD architecture
- **Historical Reference**: `infra/iam/setup-instructions.md` - Old deployment process (deprecated)

## Rollback

If you need to revert to self-managed IAM configuration:

1. Restore `github-actions-oidc.yaml` and `eks-rbac.yaml` from git history
2. Deploy using the instructions in the historical `setup-instructions.md`
3. Update documentation to remove infrastructure repository references

```bash
# Restore files from git history
git show HEAD~1:infra/iam/github-actions-oidc.yaml > infra/iam/github-actions-oidc.yaml
git show HEAD~1:infra/iam/eks-rbac.yaml > infra/iam/eks-rbac.yaml
```

## Questions?

- Review `docs/cicd/` directory for comprehensive documentation
- Check `infra/iam/README.md` for quick reference
- Open an issue if you encounter problems

# CI/CD Pipeline Documentation

This document describes the complete CI/CD pipeline for Mosaic Life, including GitHub Actions workflows, ArgoCD GitOps deployment, and preview environments.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Workflows](#workflows)
- [Deployment Environments](#deployment-environments)
- [Preview Environments](#preview-environments)
- [Security and Quality Gates](#security-and-quality-gates)
- [Troubleshooting](#troubleshooting)

## Overview

The CI/CD pipeline implements a modern GitOps approach with the following characteristics:

- **Automated Testing**: Unit, integration, E2E, security scanning
- **Container Images**: Built and pushed to Amazon ECR with SBOM generation
- **Image Signing**: Cosign signatures for supply chain security
- **GitOps Deployment**: ArgoCD automatically deploys from GitOps repository
- **Preview Environments**: Automatic PR-based preview deployments
- **Zero-Downtime**: Rolling updates with health checks

## Architecture

```
┌─────────────┐
│   GitHub    │
│  Repository │
└──────┬──────┘
       │
       │ Push/PR
       ▼
┌─────────────────┐
│ GitHub Actions  │
│   Workflows     │
├─────────────────┤
│ • CI Tests      │
│ • Build Images  │
│ • Security Scan │
│ • Push to ECR   │
│ • Update GitOps │
└────────┬────────┘
         │
         ▼
┌─────────────────┐         ┌──────────────┐
│  GitOps Repo    │────────>│   ArgoCD     │
│ (mosaic-gitops) │         │              │
└─────────────────┘         └──────┬───────┘
                                    │
                                    │ Sync
                                    ▼
                            ┌──────────────┐
                            │ EKS Cluster  │
                            │  Kubernetes  │
                            └──────────────┘
```

## Workflows

### 1. CI Workflow (`ci.yml`)

**Trigger**: Pull requests and pushes to `main`/`develop`

**Jobs**:
- **Frontend Lint**: ESLint and TypeScript type checking
- **Frontend Test**: Unit tests with Vitest, coverage reporting
- **Frontend Build**: Production build with bundle size checks
- **Backend Lint**: Ruff linting and MyPy type checking
- **Backend Test**: Pytest with PostgreSQL service
- **Security Scan**: Gitleaks, npm audit, pip-audit, Bandit
- **Dependency Review**: Automated dependency vulnerability checks
- **Contract Tests**: OpenAPI/schema validation

**Quality Gates**:
- All tests must pass
- No high-severity security issues
- Bundle size < 250KB
- Test coverage reported to Codecov

### 2. Build and Push Workflow (`build-push.yml`)

**Trigger**: Pushes to `main`/`develop`, tags, manual dispatch

**Jobs**:
- **Build Web Image**:
  - Build Docker image for frontend
  - Push to ECR with multiple tags
  - Generate SBOM (Software Bill of Materials)
  - Scan with Grype for vulnerabilities

- **Build Core API Image**:
  - Build Docker image for backend
  - Push to ECR with multiple tags
  - Generate SBOM
  - Scan with Grype

- **Sign Images**:
  - Sign both images with Cosign
  - Provides supply chain security

- **Update GitOps**:
  - Update image tags in GitOps repository
  - Triggers ArgoCD sync

**Image Tags**:
- `main-{sha}`: Main branch builds
- `develop-{sha}`: Develop branch builds
- `pr-{number}`: Pull request builds
- `v{version}`: Semver tags
- `latest`: Latest main branch (production)

### 3. Preview Environment Workflow (`preview-env.yml`)

**Trigger**: Pull request opened/synchronized

**Jobs**:
- **Deploy Preview**:
  - Build and push preview images
  - Create dedicated namespace (`preview-pr-{number}`)
  - Deploy with Helm
  - Create DNS records (pr-{number}.mosaiclife.me)
  - Comment on PR with URLs

- **Cleanup Preview**:
  - Triggered when PR is closed
  - Delete namespace and all resources
  - Remove DNS records

**Preview URLs**:
- Frontend: `https://pr-{number}.mosaiclife.me`
- API: `https://pr-{number}-api.mosaiclife.me`

### 4. E2E Tests Workflow (`e2e-tests.yml`)

**Trigger**: PRs, pushes, nightly schedule

**Jobs**:
- **Playwright Tests**: Browser-based E2E testing
- **Accessibility Tests**: axe-core WCAG compliance
- **Performance Tests**: K6 load testing, Lighthouse CI

## Deployment Environments

### Production

- **Namespace**: `mosaic-prod`
- **Branch**: `main`
- **ArgoCD App**: `mosaic-life-prod`
- **Auto-sync**: Enabled
- **Self-heal**: Enabled
- **Replicas**:
  - Web: 2-10 (autoscaling)
  - API: 3-20 (autoscaling)
- **Domains**:
  - `mosaiclife.me` (web)
  - `api.mosaiclife.me` (API)

### Staging

- **Namespace**: `mosaic-staging`
- **Branch**: `develop`
- **ArgoCD App**: `mosaic-life-staging`
- **Auto-sync**: Enabled
- **Self-heal**: Enabled
- **Replicas**:
  - Web: 1
  - API: 2
- **Domains**:
  - `staging.mosaiclife.me` (web)
  - `staging-api.mosaiclife.me` (API)

### Preview (PR-based)

- **Namespace**: `preview-pr-{number}`
- **Branch**: Feature branch
- **Lifecycle**: Created on PR open, deleted on PR close
- **Replicas**: 1 each (no autoscaling)
- **Resources**: Reduced limits for cost efficiency
- **Domains**:
  - `pr-{number}.mosaiclife.me` (web)
  - `pr-{number}-api.mosaiclife.me` (API)

## Preview Environments

### How It Works

1. **PR Opened**: GitHub Actions builds images and deploys to dedicated namespace
2. **DNS Created**: External DNS creates Route53 records automatically
3. **Comment Posted**: Bot comments on PR with preview URLs
4. **Updates**: Each push to the PR rebuilds and updates the preview
5. **PR Closed**: Namespace and DNS records are automatically cleaned up

### Accessing Preview Environments

After PR creation, check the PR comments for:
- Frontend URL
- API URL
- Kubernetes namespace
- Image tags

### Preview Environment Limits

To control costs, preview environments have:
- Single replica (no autoscaling)
- Reduced resource limits (CPU: 200m, Memory: 256Mi)
- No persistent storage
- Automatic cleanup after 7 days of inactivity (future enhancement)

## Security and Quality Gates

### Code Security

1. **Secret Scanning**: Gitleaks prevents credential commits
2. **Dependency Scanning**: npm audit and pip-audit for vulnerabilities
3. **Static Analysis**: Bandit for Python security issues
4. **Dependency Review**: GitHub's dependency review on PRs

### Image Security

1. **SBOM Generation**: Full software bill of materials for each image
2. **Vulnerability Scanning**: Grype scans all images before deployment
3. **Image Signing**: Cosign signatures verify image authenticity
4. **Base Image**: Minimal distroless/alpine images
5. **Non-root**: All containers run as non-root user

### Kubernetes Security

1. **Network Policies**: Default deny with explicit allow rules
2. **RBAC**: Least-privilege access for GitHub Actions
3. **Pod Security**: securityContext with restrictive settings
4. **Image Pull Policy**: Always pull to ensure latest signed images

### Quality Gates

Before deploying to production:
- ✅ All unit tests pass (≥80% coverage)
- ✅ E2E tests pass
- ✅ Security scans show no high/critical issues
- ✅ Bundle size under budget
- ✅ Accessibility tests pass
- ✅ Images signed with Cosign

## GitOps Workflow

### Repository Structure

**Application Repo** (`mosaic-stories/mosaic-life`):
- Source code
- Helm charts (templates)
- CI/CD workflows

**GitOps Repo** (`mosaic-stories/mosaic-gitops`):
- Environment-specific values
- Exact image tags
- Configuration (no code)

### Deployment Flow

1. Code merged to `main`
2. GitHub Actions builds images
3. Images pushed to ECR with tag `main-{sha}`
4. GitHub Actions updates `environments/prod/values.yaml` in GitOps repo
5. ArgoCD detects change and syncs
6. Kubernetes rolling update with zero downtime

### Rollback Procedure

**Option 1: GitOps Revert**
```bash
cd mosaic-gitops
git revert <commit-hash>
git push
# ArgoCD will automatically rollback
```

**Option 2: ArgoCD CLI**
```bash
argocd app history mosaic-life-prod
argocd app rollback mosaic-life-prod <revision>
```

**Option 3: Kubernetes**
```bash
kubectl rollout undo deployment/mosaic-life-core-api -n mosaic-prod
```

## AWS Credentials (OIDC)

The pipeline uses **OpenID Connect (OIDC)** for AWS authentication - no long-lived credentials!

### IAM Roles

The following IAM roles are **managed in the infrastructure repository** and must be deployed before using CI/CD:

1. **github-actions-ecr-push**: Push images to ECR
2. **github-actions-eks-deploy**: Deploy to EKS cluster  
3. **github-actions-kubectl-role**: Execute kubectl commands via role assumption
4. **github-actions-gitops-update**: Update GitOps repository (optional)

### OIDC Provider

The GitHub OIDC provider (`token.actions.githubusercontent.com`) is configured with trust relationships that allow workflows from the `mosaic-stories/mosaic-life` repository to assume the above roles.

### Setup & Configuration

**IAM roles and OIDC configuration are managed externally** in the infrastructure repository. This repository assumes these resources are already deployed.

To verify the configuration:

```bash
# Verify OIDC provider
aws iam list-open-id-connect-providers | grep token.actions.githubusercontent.com

# Verify roles exist
aws iam get-role --role-name github-actions-ecr-push
aws iam get-role --role-name github-actions-eks-deploy
aws iam get-role --role-name github-actions-kubectl-role
```

For initial setup or modifications, refer to the infrastructure repository documentation.

## Monitoring and Observability

### GitHub Actions

- **Workflow Status**: Badge in README
- **Codecov**: Coverage trends and PR reports
- **Artifacts**: Test results, SBOM, security reports

### ArgoCD

- **Application Status**: Health and sync state
- **History**: Deployment history and diffs
- **Notifications**: Slack alerts for failures

### Kubernetes

- **Metrics**: Prometheus metrics from pods
- **Logs**: Aggregated in CloudWatch/Loki
- **Traces**: OpenTelemetry to Jaeger
- **Health Checks**: Liveness and readiness probes

## Troubleshooting

### Build Failures

**Problem**: Docker build fails in GitHub Actions

**Solution**:
```bash
# Check workflow logs
gh run view <run-id> --log-failed

# Test build locally
docker build -t test ./apps/web
```

### ECR Push Failures

**Problem**: Cannot push to ECR

**Solution**:
```bash
# Verify IAM role
aws sts get-caller-identity

# Check ECR repository exists
aws ecr describe-repositories --repository-names mosaic-life/web

# Manually test ECR login
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  033691785857.dkr.ecr.us-east-1.amazonaws.com
```

### Preview Environment Not Accessible

**Problem**: PR comment shows URLs but they're not accessible

**Solution**:
```bash
# Check namespace exists
kubectl get namespace preview-pr-{number}

# Check pods are running
kubectl get pods -n preview-pr-{number}

# Check ingress
kubectl get ingress -n preview-pr-{number}

# Check External DNS logs
kubectl logs -n kube-system deployment/external-dns

# Check Route53 records
aws route53 list-resource-record-sets \
  --hosted-zone-id Z039487930F6987CJO4W9 | grep pr-{number}
```

### ArgoCD Sync Issues

**Problem**: ArgoCD not syncing changes

**Solution**:
```bash
# Check application status
argocd app get mosaic-life-prod

# View diff
argocd app diff mosaic-life-prod

# Force sync
argocd app sync mosaic-life-prod --force

# Check ArgoCD logs
kubectl logs -n argocd deployment/argocd-application-controller
```

### Failed Deployments

**Problem**: Deployment shows as failed in Kubernetes

**Solution**:
```bash
# Check deployment status
kubectl rollout status deployment/mosaic-life-core-api -n mosaic-prod

# Check pod logs
kubectl logs -l app=mosaic-life-core-api -n mosaic-prod

# Check events
kubectl get events -n mosaic-prod --sort-by='.lastTimestamp'

# Check resource constraints
kubectl describe pod <pod-name> -n mosaic-prod
```

## Best Practices

### For Developers

1. **Write tests**: All features need unit and E2E tests
2. **Security first**: Never commit secrets, use AWS Secrets Manager
3. **Small PRs**: Keep changes focused for faster reviews
4. **Preview first**: Test in preview environment before merging
5. **Check pipelines**: Ensure CI passes before requesting review

### For DevOps

1. **Monitor costs**: Preview environments can accumulate
2. **Regular updates**: Keep dependencies and base images updated
3. **Audit access**: Review IAM roles and RBAC periodically
4. **Backup**: Ensure GitOps repo is backed up
5. **Disaster recovery**: Test rollback procedures regularly

## Metrics and KPIs

Track these metrics for CI/CD health:

- **Deployment Frequency**: Deployments per day/week
- **Lead Time**: Commit to production time
- **MTTR**: Mean time to recovery from failures
- **Change Failure Rate**: % of deployments causing issues
- **Build Time**: CI/CD pipeline duration
- **Preview Environment Usage**: Active preview environments

## Future Enhancements

- [ ] Blue-green deployments for zero-downtime migrations
- [ ] Canary deployments with automated rollback
- [ ] Chaos engineering tests in preview environments
- [ ] Automated performance regression testing
- [ ] Multi-region deployment support
- [ ] Preview environment auto-cleanup after inactivity
- [ ] Integration with Datadog/New Relic for APM
- [ ] Automated dependency updates with Renovate

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [Helm Documentation](https://helm.sh/docs/)
- [AWS EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [CNCF Security Best Practices](https://www.cncf.io/blog/2023/01/19/security-best-practices-for-kubernetes/)

## Support

For issues with CI/CD:
- Check this documentation first
- Review GitHub Actions workflow logs
- Check ArgoCD application status
- Open issue with `cicd` label
- Contact DevOps team in #mosaic-devops Slack channel

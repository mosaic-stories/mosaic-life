# SHA-Based Image Tagging and Deployment

## Overview

Mosaic Life uses **SHA-based image tags** for all deployments to ensure:
- ✅ **Immutability** - Each tag represents an exact code state
- ✅ **Traceability** - Easy to identify what code is running
- ✅ **No ambiguity** - No confusion about "latest" or branch tags
- ✅ **Rollbacks** - Easy to deploy any previous SHA

## Architecture

### Image Tagging Strategy

When code is pushed to `main` or `develop`:

1. **GitHub Actions builds** Docker images with multiple tags:
   - `abc1234` (short SHA - **primary tag**)
   - `main` or `develop` (branch name)
   - `latest` (only on main branch)

2. **GitHub Actions updates** the GitOps repository:
   - Updates `environments/{env}/values.yaml`
   - Sets `global.imageTag: "abc1234"`
   - Commits with descriptive message

3. **ArgoCD detects** the GitOps change:
   - Automatically syncs (if auto-sync enabled)
   - Deploys new image to Kubernetes

### Flow Diagram

```
┌─────────────┐
│ Developer   │
│ pushes code │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│ GitHub Actions              │
│ 1. Build images             │
│    - web:abc1234            │
│    - core-api:abc1234       │
│ 2. Push to ECR              │
│ 3. Sign with Cosign         │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ Update GitOps Repo          │
│ environments/prod/values.yaml│
│   global:                   │
│     imageTag: "abc1234"     │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ ArgoCD Detects Change       │
│ - Polls every 3 min (default)│
│ - Or webhook trigger        │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ Deploy to Kubernetes        │
│ - Pulls abc1234 from ECR    │
│ - Updates deployments       │
│ - Health checks pass        │
└─────────────────────────────┘
```

## Automatic Deployments

### Production (main branch)

```bash
# Developer workflow
git checkout main
git pull
# ... make changes ...
git commit -m "feat: add new feature"
git push origin main

# GitHub Actions automatically:
# 1. Builds images with SHA tag
# 2. Updates gitops/environments/prod/values.yaml
# 3. ArgoCD syncs to production
```

### Staging (develop branch)

```bash
# Developer workflow
git checkout develop
git pull
# ... make changes ...
git commit -m "feat: test new feature"
git push origin develop

# GitHub Actions automatically:
# 1. Builds images with SHA tag
# 2. Updates gitops/environments/staging/values.yaml
# 3. ArgoCD syncs to staging
```

## Manual Deployments

### Deploy Specific SHA to Production

```bash
# Deploy a specific commit SHA
just deploy-sha abc1234 prod

# Or use the longer form
just gitops-update-tag prod abc1234
```

### Deploy Current Commit

```bash
# Builds and deploys your current local commit
just release-sha
just gitops-update-tag prod  # Will use current SHA
```

### Rollback to Previous Version

```bash
# 1. Find the SHA you want to rollback to
cd /apps/mosaic-life-gitops
git log environments/prod/values.yaml

# 2. Look for the commit message showing the SHA:
#    "deploy(prod): update image tag to xyz5678"

# 3. Deploy that SHA
just deploy-sha xyz5678 prod

# Or manually edit and commit
cd /apps/mosaic-life-gitops
vim environments/prod/values.yaml
# Change imageTag to "xyz5678"
git add environments/prod/values.yaml
git commit -m "rollback(prod): revert to xyz5678"
git push
```

## Image Tag Format

### Tag Structure

All images are tagged with the **7-character short SHA**:

```
033691785857.dkr.ecr.us-east-1.amazonaws.com/mosaic-life/web:abc1234
033691785857.dkr.ecr.us-east-1.amazonaws.com/mosaic-life/core-api:abc1234
```

### Additional Tags

For convenience, images also receive:
- **Branch name** (`main`, `develop`)
- **`latest`** (only main branch)

But **production always uses SHA tags** in values.yaml.

## GitOps Repository Structure

### Production Values

```yaml
# environments/prod/values.yaml
global:
  imageTag: "abc1234"  # ← Set by CI/CD
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
```

### How It's Used

The Helm chart uses `global.imageTag`:

```yaml
# Helm template (in mosaic-life repo)
spec:
  containers:
    - name: web
      image: {{ .Values.global.registry }}/mosaic-life/web:{{ .Values.global.imageTag }}
```

## Monitoring Deployments

### Watch ArgoCD Sync

```bash
# Watch production deployment
just argocd-watch mosaic-life-prod

# Check status
just argocd-status mosaic-life-prod

# View diff before sync
just argocd-diff mosaic-life-prod
```

### Check Running Versions

```bash
# Get image tags of running pods
kubectl get pods -n mosaic-prod -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'

# Example output:
# web-7d8f9c6b5-abcde    033691785857.dkr.ecr.us-east-1.amazonaws.com/mosaic-life/web:abc1234
# core-api-6dbfb6b478-xyz  033691785857.dkr.ecr.us-east-1.amazonaws.com/mosaic-life/core-api:abc1234
```

### View Deployment History

```bash
# In gitops repo
cd /apps/mosaic-life-gitops
git log --oneline environments/prod/values.yaml

# Shows deployment history:
# abc1234 deploy(prod): update image tag to abc1234
# xyz5678 deploy(prod): update image tag to xyz5678
# def9012 deploy(prod): update image tag to def9012
```

## Troubleshooting

### Image Not Found in ECR

**Problem**: Pods show `ImagePullBackOff` with error:
```
Failed to pull image "...mosaic-life/web:abc1234": 
rpc error: code = Unknown desc = Error response from daemon: 
manifest for ...web:abc1234 not found
```

**Solution**:
```bash
# 1. Check if image exists in ECR
aws ecr describe-images \
  --repository-name mosaic-life/web \
  --region us-east-1 \
  --query 'imageDetails[*].imageTags' \
  --output table

# 2. If missing, check GitHub Actions build
# Visit: https://github.com/mosaic-stories/mosaic-life/actions

# 3. Verify the build-push workflow completed successfully
# Look for the "Build and Push Docker Images" workflow

# 4. If build failed, fix the issue and re-push:
git commit --amend --no-edit
git push --force-with-lease
```

### GitOps Update Failed

**Problem**: GitHub Actions shows error updating gitops repo:
```
fatal: could not read Username for 'https://github.com'
```

**Solution**:
```bash
# Verify GITOPS_PAT secret is configured
# 1. Go to: https://github.com/mosaic-stories/mosaic-life/settings/secrets/actions
# 2. Check that GITOPS_PAT exists and is valid
# 3. Generate new PAT if needed at: https://github.com/settings/tokens
#    Permissions needed: repo (full control)
```

### ArgoCD Not Syncing

**Problem**: GitOps repo updated but ArgoCD not deploying.

**Solution**:
```bash
# 1. Check ArgoCD application status
just argocd-status mosaic-life-prod

# 2. Look for sync errors in conditions
# Common issues:
# - Auto-sync disabled
# - Sync policies preventing automatic sync
# - Application in "manual" sync mode

# 3. Manually trigger sync
just argocd-sync mosaic-life-prod

# 4. Watch the sync
just argocd-watch mosaic-life-prod
```

### Wrong Image Deployed

**Problem**: Expecting SHA `abc1234` but seeing different version.

**Solution**:
```bash
# 1. Check what's in gitops repo
cd /apps/mosaic-life-gitops
cat environments/prod/values.yaml | grep imageTag

# 2. Check what ArgoCD sees
argocd app manifests mosaic-life-prod | grep -A 2 "image:"

# 3. Check what's actually running
kubectl get pods -n mosaic-prod \
  -o jsonpath='{.items[*].spec.containers[*].image}' | tr ' ' '\n'

# 4. Force sync if out of date
just argocd-sync mosaic-life-prod
```

## CI/CD Pipeline Details

### GitHub Actions Workflow

Location: `.github/workflows/build-push.yml`

#### Key Steps

1. **Build Images** (parallel)
   - `build-web` job
   - `build-core-api` job
   - Output: SHA-based tags

2. **Sign Images**
   - Uses Cosign (keyless)
   - Verifies image integrity

3. **Update GitOps**
   - Clones `mosaic-stories/gitops` repo
   - Updates `environments/{env}/values.yaml`
   - Commits and pushes

#### Required Secrets

- `GITOPS_PAT` - Personal Access Token with repo permissions

#### AWS Permissions

- Role: `github-actions-ecr-push`
- Permissions:
  - `ecr:GetAuthorizationToken`
  - `ecr:BatchCheckLayerAvailability`
  - `ecr:PutImage`
  - `ecr:InitiateLayerUpload`
  - `ecr:UploadLayerPart`
  - `ecr:CompleteLayerUpload`

## Best Practices

### Do's ✅

- ✅ Always use SHA tags in gitops values
- ✅ Keep a deployment log (gitops commit history)
- ✅ Test in staging before prod
- ✅ Monitor deployments with `just argocd-watch`
- ✅ Use semantic commit messages for traceability

### Don'ts ❌

- ❌ Don't use `latest` tag in production
- ❌ Don't manually update Kubernetes resources
- ❌ Don't bypass the gitops repo
- ❌ Don't force-push to main/develop
- ❌ Don't forget to verify builds completed

## Quick Reference

### Common Commands

```bash
# Build and push with SHA tag
just release-sha

# Deploy specific SHA to prod
just deploy-sha abc1234 prod

# Deploy current commit to staging
just gitops-update-tag staging

# Watch deployment
just argocd-watch mosaic-life-prod

# Check what's running
kubectl get pods -n mosaic-prod -o wide

# View deployment history
cd /apps/mosaic-life-gitops && git log environments/prod/values.yaml

# Rollback
just deploy-sha <previous-sha> prod
```

### Environment URLs

- **Production**: https://mosaiclife.me
- **Staging**: https://staging.mosaiclife.me

### Repository Links

- **Application**: https://github.com/mosaic-stories/mosaic-life
- **GitOps**: https://github.com/mosaic-stories/gitops
- **Infrastructure**: https://github.com/mosaic-stories/infrastructure

## See Also

- [GitOps Setup Guide](GITOPS-SETUP.md)
- [CI/CD Overview](README.md)
- [Deployment Runbook](../ops/DEPLOYMENT-RUNBOOK.md) (if exists)

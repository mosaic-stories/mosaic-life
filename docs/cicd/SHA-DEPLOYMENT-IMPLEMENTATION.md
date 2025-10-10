# SHA-Based Deployment Implementation - Summary

## ✅ What Was Implemented

### 1. Clean SHA-Based Image Tagging

**Changed**: `.github/workflows/build-push.yml`

**Docker tags now generated**:
- `abc1234` (short SHA - **primary**)
- `main` or `develop` (branch name)
- `latest` (main branch only)

**Removed prefixes** like `main-abc1234` or `sha-abc1234` for clarity.

### 2. GitOps Repository Auto-Update

**Changed**: `.github/workflows/build-push.yml` - `update-image-tags` job

**Now updates**:
- Repository: `mosaic-stories/gitops` (was `mosaic-gitops`)
- File: `environments/{env}/values.yaml`
- Field: `global.imageTag` with SHA only

**Commit message includes**:
- SHA deployed
- Trigger event
- Actor
- Full commit details

### 3. GitOps Values Structure

**Updated**: `/apps/mosaic-life-gitops/environments/*/values.yaml`

**New structure**:
```yaml
global:
  imageTag: ""  # Set by CI/CD to SHA (e.g., "abc1234")
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

### 4. Justfile Recipes for Manual Deployment

**Added to `justfile`**:

```bash
# Update gitops with specific SHA
just gitops-update-tag prod abc1234

# Deploy specific SHA
just deploy-sha abc1234 prod

# Deploy current commit
just gitops-update-tag prod  # Uses current SHA
```

### 5. Comprehensive Documentation

**Created**:
- `docs/cicd/SHA-BASED-DEPLOYMENTS.md` - Complete guide
- `docs/cicd/SHA-DEPLOYMENT-TEST-PLAN.md` - Testing checklist
- Updated `gitops/README.md` - SHA deployment section

## 📋 Files Changed

### mosaic-life Repository

| File | Change |
|------|--------|
| `.github/workflows/build-push.yml` | Updated tag strategy, fixed gitops repo URL |
| `justfile` | Added `gitops-update-tag` and `deploy-sha` recipes |
| `docs/cicd/SHA-BASED-DEPLOYMENTS.md` | New: Complete deployment guide |
| `docs/cicd/SHA-DEPLOYMENT-TEST-PLAN.md` | New: Testing checklist |

### gitops Repository

| File | Change |
|------|--------|
| `environments/prod/values.yaml` | Updated structure for SHA tags |
| `environments/staging/values.yaml` | Updated structure for SHA tags |
| `README.md` | Added SHA deployment documentation |

## 🔄 Workflow Overview

### Automatic Deployment (on git push)

```
Developer Push
      ↓
GitHub Actions
  ├─ Build web:abc1234
  ├─ Build core-api:abc1234
  ├─ Push to ECR
  ├─ Sign with Cosign
  └─ Update gitops repo
      ↓
gitops repo updated
  (global.imageTag: "abc1234")
      ↓
ArgoCD detects change
      ↓
Deploy to Kubernetes
```

### Manual Deployment

```bash
# From mosaic-life repo
just deploy-sha abc1234 prod

# Prompts for confirmation
# Updates gitops repo
# ArgoCD syncs automatically
```

## 🧪 Testing Steps

### Quick Test

1. **Make a small change**:
   ```bash
   cd /apps/mosaic-life
   echo "# Test $(date)" >> README.md
   git add README.md
   git commit -m "test: SHA deployment"
   git push origin main
   ```

2. **Watch the build**:
   ```bash
   gh run watch  # or visit GitHub Actions
   ```

3. **Verify gitops update**:
   ```bash
   cd /apps/mosaic-life-gitops
   git pull
   cat environments/prod/values.yaml | grep imageTag
   # Should show: imageTag: "abc1234"
   ```

4. **Watch ArgoCD sync**:
   ```bash
   just argocd-watch mosaic-life-prod
   ```

5. **Verify deployment**:
   ```bash
   kubectl get pods -n mosaic-prod -o jsonpath='{.items[*].spec.containers[*].image}'
   # Should show images tagged with abc1234
   ```

## 🚨 Current Issue Resolution

### Problem
```
Failed to pull image: manifest for mosaic-life/web:main-latest not found
```

### Root Cause
GitOps values had `imageTag: "main-latest"` which doesn't exist in ECR.

### Solution Implemented
1. ✅ Changed tag format to clean SHA (`abc1234`)
2. ✅ Updated gitops values structure
3. ✅ Fixed GitHub Actions to update correct repo
4. ✅ Added manual deployment option

### Next Action Required
**Trigger a new build** to create SHA-tagged images and update gitops:

```bash
cd /apps/mosaic-life

# Option 1: Make a trivial change
echo "# Deployment test $(date)" >> README.md
git add README.md
git commit -m "ops: trigger SHA-based deployment"
git push origin main

# Option 2: Use existing SHA (if images exist)
just deploy-sha $(git rev-parse --short HEAD) prod
```

## 🎯 Benefits

### Before (Problems)
- ❌ Ambiguous tags (`main-latest`, `latest`)
- ❌ No traceability to exact code version
- ❌ Manual gitops updates required
- ❌ Difficult rollbacks

### After (Solutions)
- ✅ Exact code version in image tag (SHA)
- ✅ Automatic gitops updates via CI/CD
- ✅ Full audit trail in git history
- ✅ Easy rollbacks to any SHA
- ✅ No confusion about "latest"

## 📚 Quick Reference

### Common Commands

```bash
# Automatic deployment (push to main)
git push origin main

# Manual deployment
just deploy-sha abc1234 prod

# Deploy current commit
SHA=$(git rev-parse --short HEAD)
just deploy-sha $SHA prod

# Watch deployment
just argocd-watch mosaic-life-prod

# Check deployed version
cd /apps/mosaic-life-gitops
cat environments/prod/values.yaml | grep imageTag

# Rollback
just deploy-sha <old-sha> prod
```

### View Deployment History

```bash
cd /apps/mosaic-life-gitops
git log --oneline environments/prod/values.yaml

# Shows:
# abc1234 deploy(prod): update image tag to abc1234
# def5678 deploy(prod): update image tag to def5678
```

## ⚙️ Required Secrets

Ensure these are configured in GitHub:

```
GITOPS_PAT - Personal Access Token
  Scope: repo (full control)
  Access to: mosaic-stories/gitops
```

Set at: https://github.com/mosaic-stories/mosaic-life/settings/secrets/actions

## 🔗 Documentation Links

| Document | Purpose |
|----------|---------|
| [SHA-Based Deployments](docs/cicd/SHA-BASED-DEPLOYMENTS.md) | Complete deployment guide |
| [Test Plan](docs/cicd/SHA-DEPLOYMENT-TEST-PLAN.md) | Testing checklist |
| [GitOps Setup](docs/ops/GITOPS-SETUP.md) | GitOps architecture |
| [gitops README](../mosaic-life-gitops/README.md) | Values structure |

## 📝 Commit Instructions

### For mosaic-life Repository

```bash
cd /apps/mosaic-life

git add .github/workflows/build-push.yml
git add justfile
git add docs/cicd/
git commit -m "ops: implement SHA-based image tagging and deployment

- Update Docker metadata to use clean SHA tags (no prefixes)
- Fix GitOps repo URL (gitops, not mosaic-gitops)
- Add justfile recipes for manual SHA deployments
- Add comprehensive SHA deployment documentation

Resolves: ImagePullBackOff due to main-latest tag not found
Implements: Immutable SHA-based deployments per best practices"

git push origin main
```

### For gitops Repository

```bash
cd /apps/mosaic-life-gitops

git add environments/
git add README.md
git commit -m "ops: update for SHA-based image deployments

- Restructure values.yaml for SHA tags
- Add SHA deployment documentation
- Remove hardcoded image tags

Note: global.imageTag will be updated automatically by CI/CD"

git push origin main
```

## ✅ Success Checklist

- [ ] GitHub Actions workflow updated
- [ ] Justfile recipes added
- [ ] GitOps values restructured
- [ ] Documentation created
- [ ] GITOPS_PAT secret verified
- [ ] Test deployment triggered
- [ ] ArgoCD synced successfully
- [ ] Pods running with SHA tags
- [ ] Team notified of new workflow

## 🆘 Support

If issues arise:

1. Check GitHub Actions logs
2. Verify ECR images exist
3. Review ArgoCD application status
4. Consult [SHA-Based Deployments](docs/cicd/SHA-BASED-DEPLOYMENTS.md)
5. Open issue with deployment details

## 🎓 Team Training

Share with team:
- New deployment workflow
- How to deploy specific SHAs
- Rollback procedures
- Where to find deployment history

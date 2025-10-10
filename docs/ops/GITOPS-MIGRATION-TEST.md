# GitOps Migration - Testing Checklist

## ✅ Completed Changes

### 1. ArgoCD Application Manifests Updated
- **File**: `infra/argocd/applications/mosaic-life-prod.yaml`
- **File**: `infra/argocd/applications/mosaic-life-staging.yaml`
- **Change**: Converted from single-source to multi-source configuration
  - Source 1: Helm chart from `mosaic-life` repo
  - Source 2: Values from `gitops` repo

### 2. GitOps Repository Cleaned Up
- **Location**: `/apps/mosaic-life-gitops/`
- **Removed**: Unnecessary `Chart.yaml` files
- **Added**: Comprehensive `README.md`
- **Structure**:
  ```
  gitops/
  ├── README.md
  ├── base/values.yaml
  └── environments/
      ├── prod/values.yaml
      └── staging/values.yaml
  ```

### 3. Documentation Created
- **File**: `docs/ops/GITOPS-SETUP.md`
- **Content**: Complete guide on GitOps architecture and workflows

### 4. Justfile Updated
- Added ArgoCD management recipes
- Includes project configuration apply

## 🧪 Testing Steps

### Step 1: Restart ArgoCD Port-Forward

```bash
# In one terminal, start the port-forward
just argocd-ui

# Or manually:
kubectl port-forward -n argocd svc/argocd-server 8085:443
```

### Step 2: Verify Application Status

```bash
# In another terminal, check the application
just argocd-status mosaic-life-prod

# Or manually:
argocd app get mosaic-life-prod --refresh
```

### Step 3: Expected Result

You should see:
- ✅ **Sync Status**: Should change from "Unknown" to "Synced" or "OutOfSync"
- ✅ **No authentication errors**
- ✅ **Sources**: Should list 2 sources (mosaic-life and gitops)
- ✅ **Health Status**: Should show component health

### Step 4: Test Sync

```bash
# Trigger a manual sync
just argocd-sync mosaic-life-prod

# Or manually:
argocd app sync mosaic-life-prod
```

### Step 5: View in UI

```bash
# Open browser to http://localhost:8085
# Login with admin credentials from:
just argocd-password

# Navigate to the mosaic-life-prod application
# Verify the multi-source configuration is visible
```

## 🔍 Troubleshooting

### If Authentication Errors Persist

```bash
# Ensure both repos are registered
argocd repo list

# Should show:
# - https://github.com/mosaic-stories/mosaic-life
# - https://github.com/mosaic-stories/gitops.git

# If missing, add them:
argocd repo add https://github.com/mosaic-stories/mosaic-life
argocd repo add https://github.com/mosaic-stories/gitops.git
```

### If "Path Not Found" Errors

```bash
# Verify Helm chart exists in app repo
ls -la /apps/mosaic-life/infra/helm/mosaic-life/

# Verify values files exist in gitops repo
ls -la /apps/mosaic-life-gitops/base/
ls -la /apps/mosaic-life-gitops/environments/prod/
```

### If Values Not Applied

```bash
# Check generated manifests
argocd app manifests mosaic-life-prod | less

# Look for your custom values being applied
```

## 📋 Commit Checklist

### For mosaic-life Repository

```bash
cd /apps/mosaic-life

# Check what changed
git status

# Should show:
# - infra/argocd/applications/mosaic-life-prod.yaml (modified)
# - infra/argocd/applications/mosaic-life-staging.yaml (modified)
# - infra/argocd/projects/mosaic-life.yaml (modified)
# - justfile (modified)
# - docs/ops/GITOPS-SETUP.md (new)

# Stage and commit
git add infra/argocd/ justfile docs/ops/GITOPS-SETUP.md
git commit -m "ops: migrate to multi-source GitOps configuration

- Convert ArgoCD apps to multi-source (chart from app repo, values from gitops repo)
- Update ArgoCD project to permit gitops.git repository
- Add comprehensive ArgoCD management recipes to justfile
- Add GitOps setup documentation

Resolves: authentication and permission errors in ArgoCD
Aligns with: GitOps best practices for team development"

# Push to remote
git push origin main
```

### For gitops Repository

```bash
cd /apps/mosaic-life-gitops

# Check what changed
git status

# Should show:
# - README.md (new)
# - environments/prod/Chart.yaml (deleted)
# - environments/staging/Chart.yaml (deleted)

# Stage and commit
git add -A
git commit -m "ops: prepare for multi-source ArgoCD configuration

- Remove Chart.yaml files (not needed with multi-source)
- Add comprehensive README with usage examples
- Document value precedence and workflow

This repo now provides values-only configuration for ArgoCD multi-source apps"

# Push to remote
git push origin main
```

## 🎯 Success Criteria

- [ ] ArgoCD shows 2 sources for mosaic-life-prod
- [ ] No "authentication required" errors
- [ ] No "not permitted in project" errors
- [ ] Sync completes successfully
- [ ] Application Health shows "Healthy"
- [ ] Values from gitops repo are applied (check replica counts)
- [ ] Both repositories committed and pushed

## 📚 Next Steps After Success

1. **Apply staging configuration**:
   ```bash
   just argocd-apply-staging
   argocd app sync mosaic-life-staging
   ```

2. **Test environment-specific changes**:
   ```bash
   # Make a change in gitops repo
   cd /apps/mosaic-life-gitops
   vim environments/prod/values.yaml
   # Change web.replicaCount to 3
   
   git add environments/prod/values.yaml
   git commit -m "ops: test multi-source sync"
   git push
   
   # Watch ArgoCD auto-sync (or trigger manually)
   just argocd-watch mosaic-life-prod
   ```

3. **Update preview environment template** to use multi-source (optional)

4. **Document for team** in project wiki or README

## 🔗 Quick Reference Commands

```bash
# View application status
just argocd-status mosaic-life-prod

# Sync application
just argocd-sync mosaic-life-prod

# Watch sync progress
just argocd-watch mosaic-life-prod

# View diff before sync
just argocd-diff mosaic-life-prod

# List all applications
just argocd-list

# Access UI
just argocd-ui

# Get admin password
just argocd-password
```

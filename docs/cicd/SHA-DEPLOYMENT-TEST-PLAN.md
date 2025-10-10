# SHA-Based Deployment Testing Checklist

## Pre-Testing Setup

### ✅ Required Secrets

Verify GitHub secrets are configured:

```bash
# Go to: https://github.com/mosaic-stories/mosaic-life/settings/secrets/actions

Required secrets:
✓ GITOPS_PAT - Personal Access Token with repo access to mosaic-stories/gitops
```

### ✅ AWS Permissions

Verify GitHub Actions IAM role:

```bash
aws iam get-role --role-name github-actions-ecr-push

# Should have permissions for:
# - ECR (push images)
# - Cosign (if using)
```

### ✅ GitOps Repository

Verify gitops repo structure:

```bash
cd /apps/mosaic-life-gitops
git pull origin main

# Should have:
ls -la base/values.yaml
ls -la environments/prod/values.yaml
ls -la environments/staging/values.yaml
```

## Test Plan

### Test 1: Build Images with SHA Tags

**Objective**: Verify images are built with clean SHA tags (no prefixes)

**Steps**:

1. Make a small change in the application:
   ```bash
   cd /apps/mosaic-life
   echo "# Test change $(date)" >> apps/web/README.md
   git add apps/web/README.md
   git commit -m "test: verify SHA-based image tagging"
   git push origin main
   ```

2. Watch GitHub Actions:
   ```bash
   # Visit: https://github.com/mosaic-stories/mosaic-life/actions
   # Or use gh CLI:
   gh run watch
   ```

3. Verify images in ECR:
   ```bash
   # Get the commit SHA
   SHA=$(git rev-parse --short HEAD)
   echo "Expected SHA: $SHA"
   
   # Check web image
   aws ecr describe-images \
     --repository-name mosaic-life/web \
     --image-ids imageTag=$SHA \
     --region us-east-1
   
   # Check core-api image
   aws ecr describe-images \
     --repository-name mosaic-life/core-api \
     --image-ids imageTag=$SHA \
     --region us-east-1
   ```

**Expected Result**:
- ✅ Images tagged with SHA (e.g., `abc1234`)
- ✅ Images also tagged with `main` and `latest`
- ✅ No `main-abc1234` or `sha-abc1234` prefixes

**If Failed**:
- Check docker metadata configuration in `.github/workflows/build-push.yml`
- Verify tag format: `type=sha,format=short,prefix=`

---

### Test 2: GitOps Repository Update

**Objective**: Verify GitHub Actions updates gitops repo with SHA

**Steps**:

1. After build completes, check gitops repo:
   ```bash
   cd /apps/mosaic-life-gitops
   git pull origin main
   
   # Check latest commit
   git log -1 --oneline
   
   # Should see: "deploy(prod): update image tag to <SHA>"
   ```

2. Verify values file:
   ```bash
   cat environments/prod/values.yaml | grep imageTag
   
   # Should show:
   # imageTag: "abc1234"
   ```

3. Check commit details:
   ```bash
   git show HEAD
   ```

**Expected Result**:
- ✅ New commit in gitops repo
- ✅ Commit message includes SHA
- ✅ `global.imageTag` set to SHA (no quotes issues)
- ✅ Only imageTag changed (replica counts untouched)

**If Failed**:
- Check GITOPS_PAT secret validity
- Verify yq syntax in workflow
- Check workflow logs for errors

---

### Test 3: ArgoCD Auto-Sync

**Objective**: Verify ArgoCD detects and deploys the change

**Steps**:

1. Start port-forward (if not running):
   ```bash
   just argocd-ui
   # Open http://localhost:8085 in browser
   ```

2. Watch ArgoCD application:
   ```bash
   # In another terminal
   just argocd-watch mosaic-life-prod
   ```

3. Check sync status:
   ```bash
   just argocd-status mosaic-life-prod
   ```

4. Verify pods are updated:
   ```bash
   # Wait for sync to complete, then check pods
   kubectl get pods -n mosaic-prod -o wide
   
   # Check image tags
   kubectl get pods -n mosaic-prod \
     -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'
   ```

**Expected Result**:
- ✅ ArgoCD detects change within 3 minutes
- ✅ Sync Status shows "Synced"
- ✅ Health Status shows "Healthy"
- ✅ Pods running with new SHA image tag
- ✅ No ImagePullBackOff errors

**If Failed**:
- Check ArgoCD logs: `kubectl logs -n argocd -l app.kubernetes.io/name=argocd-application-controller`
- Verify image exists in ECR
- Check pod events: `kubectl describe pod <pod-name> -n mosaic-prod`
- Manually trigger sync: `just argocd-sync mosaic-life-prod`

---

### Test 4: Manual Deployment

**Objective**: Verify manual SHA deployment works

**Steps**:

1. Find a previous SHA:
   ```bash
   cd /apps/mosaic-life-gitops
   git log --oneline environments/prod/values.yaml | head -5
   ```

2. Deploy using justfile:
   ```bash
   cd /apps/mosaic-life
   just deploy-sha <old-sha> prod
   # Answer 'y' when prompted
   ```

3. Verify deployment:
   ```bash
   just argocd-watch mosaic-life-prod
   ```

4. Check running version:
   ```bash
   kubectl get pods -n mosaic-prod -o jsonpath='{.items[*].spec.containers[*].image}'
   ```

**Expected Result**:
- ✅ GitOps repo updated with specified SHA
- ✅ ArgoCD syncs to the specified version
- ✅ Pods running with the old SHA

**If Failed**:
- Check yq is installed locally
- Verify gitops repo is cloned at `/apps/mosaic-life-gitops`
- Check git credentials for pushing

---

### Test 5: Rollback

**Objective**: Test rollback to previous version

**Steps**:

1. Deploy latest again:
   ```bash
   cd /apps/mosaic-life
   SHA=$(git rev-parse --short HEAD)
   just deploy-sha $SHA prod
   ```

2. Verify rollback works:
   ```bash
   just argocd-watch mosaic-life-prod
   ```

**Expected Result**:
- ✅ Can easily rollback to any previous SHA
- ✅ Deployment history preserved in git
- ✅ No data loss or service disruption

---

### Test 6: Staging Environment

**Objective**: Verify staging works with develop branch

**Steps**:

1. Create a test commit on develop:
   ```bash
   git checkout develop
   git pull
   echo "# Staging test $(date)" >> README.md
   git add README.md
   git commit -m "test: verify staging SHA deployment"
   git push origin develop
   ```

2. Watch GitHub Actions

3. Verify gitops update:
   ```bash
   cd /apps/mosaic-life-gitops
   git pull
   cat environments/staging/values.yaml | grep imageTag
   ```

4. Check ArgoCD:
   ```bash
   just argocd-watch mosaic-life-staging
   ```

**Expected Result**:
- ✅ Staging values updated (not prod)
- ✅ Staging environment deployed
- ✅ Production unchanged

---

## Post-Test Validation

### ✅ Image Registry

```bash
# List recent images
aws ecr describe-images \
  --repository-name mosaic-life/web \
  --query 'sort_by(imageDetails,& imagePushedAt)[-5:]' \
  --output table

# Should show SHA tags
```

### ✅ GitOps History

```bash
cd /apps/mosaic-life-gitops
git log --oneline environments/prod/values.yaml | head -10

# Should show clean deployment history with SHAs
```

### ✅ ArgoCD Health

```bash
just argocd-status mosaic-life-prod
just argocd-status mosaic-life-staging

# Both should show:
# - Sync Status: Synced
# - Health Status: Healthy
```

### ✅ Running Pods

```bash
# Production
kubectl get pods -n mosaic-prod
# All should be Running

# Staging
kubectl get pods -n mosaic-staging
# All should be Running
```

## Cleanup

After successful testing:

```bash
# Switch back to main
cd /apps/mosaic-life
git checkout main
git pull

# Ensure gitops is up to date
cd /apps/mosaic-life-gitops
git checkout main
git pull
```

## Success Criteria

- ✅ Images tagged with clean SHA (no prefixes)
- ✅ GitOps repo auto-updated by CI/CD
- ✅ ArgoCD auto-syncs on gitops changes
- ✅ Pods deploy with correct SHA images
- ✅ No ImagePullBackOff errors
- ✅ Manual deployment works
- ✅ Rollback works
- ✅ Staging isolated from prod

## Known Issues & Solutions

### Issue: Image Not Found

**Symptoms**: `ImagePullBackOff`, manifest not found

**Solution**:
```bash
# Verify build completed
gh run list --limit 5

# Check ECR
aws ecr list-images --repository-name mosaic-life/web
```

### Issue: GitOps Update Failed

**Symptoms**: Workflow fails at "Update GitOps" step

**Solution**:
```bash
# Check GITOPS_PAT secret
# Regenerate if needed at: https://github.com/settings/tokens
# Update secret at: https://github.com/mosaic-stories/mosaic-life/settings/secrets/actions
```

### Issue: ArgoCD Not Syncing

**Symptoms**: GitOps updated but pods not updating

**Solution**:
```bash
# Check application status
just argocd-status mosaic-life-prod

# Look for sync errors

# Manually sync
just argocd-sync mosaic-life-prod
```

## Documentation

After successful testing, update:

- [x] SHA-Based Deployments guide
- [x] GitOps Setup guide
- [x] Team runbook
- [ ] Add to onboarding docs

## Sign-off

- [ ] All tests passed
- [ ] Documentation updated
- [ ] Team notified of new workflow
- [ ] Rollback procedure validated

**Tested by**: _______________
**Date**: _______________
**Notes**: _______________

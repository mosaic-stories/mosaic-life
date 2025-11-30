# SES Email Fix - Implementation Steps

## Summary

Emails are not being sent because:
1. ✅ SES is configured correctly in AWS (noreply@mosaiclife.me is verified)
2. ❌ The `SES_FROM_EMAIL` environment variable is NOT set in production pods
3. ❌ The IAM role lacks SES permissions

## What We've Done

### 1. Updated CDK Stack (✅ Ready to Deploy)

**File:** `infra/cdk/lib/database-stack.ts`

Added SES permissions to the `CoreApiSecretsAccessRole`:
```typescript
// Grant SES permissions for sending invitation emails
eksServiceAccountRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: [
    'ses:SendEmail',
    'ses:SendRawEmail',
  ],
  resources: ['*'],
}));

eksServiceAccountRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: [
    'ses:GetSendQuota',
    'ses:GetSendStatistics',
    'ses:ListVerifiedEmailAddresses',
  ],
  resources: ['*'],
}));
```

### 2. Created Diagnostic Tools

- **Shell script:** `scripts/troubleshoot-ses.sh` - Quick AWS/SES checks
- **Python script:** `services/core-api/scripts/test_ses.py` - Detailed testing with email send
- **Documentation:** `docs/ops/SES-EMAIL-TROUBLESHOOTING.md` - Complete troubleshooting guide

## Deployment Steps

### Step 1: Deploy CDK Changes (IAM Permissions)

```bash
cd infra/cdk

# Verify the change
git diff lib/database-stack.ts

# Commit the change
git add lib/database-stack.ts
git commit -m "feat(iam): add SES permissions to core-api service account role"

# Deploy to production
cdk deploy DatabaseStack-prod --profile mosaic-prod

# Verify the policy was applied
aws iam get-role-policy \
  --role-name mosaic-prod-core-api-secrets-role \
  --policy-name CoreApiSecretsAccessRoleDefaultPolicy634CAD7A
```

Expected output should include the new SES permissions.

### Step 2: Update GitOps Repository (Environment Variables)

The production values come from: `https://github.com/mosaic-stories/gitops.git`

**Action Required:** Update the GitOps repository with SES environment variables.

**File to update:** `environments/prod/values.yaml` (in the gitops repo)

Add these to the `core-api` section:
```yaml
core-api:
  env:
    # ... existing vars ...
    
    # SES Email Configuration (ADD THESE)
    SES_FROM_EMAIL: "noreply@mosaiclife.me"
    SES_REGION: "us-east-1"
    APP_URL: "https://mosaiclife.me"  # Verify this is set
```

**Steps:**
```bash
# Clone the gitops repo
git clone https://github.com/mosaic-stories/gitops.git
cd gitops

# Edit the production values file
# Add the SES configuration as shown above

# Commit and push
git add environments/prod/values.yaml
git commit -m "feat(core-api): add SES email configuration for invitation system"
git push origin main
```

### Step 3: Verify ArgoCD Sync

After pushing to the gitops repo, ArgoCD will automatically sync (within ~3 minutes).

**Monitor the sync:**
```bash
# Watch ArgoCD sync status
argocd app get mosaic-life-prod --refresh

# Or use kubectl to watch pod updates
kubectl get pods -n mosaic-prod -l app=core-api -w
```

**Verify environment variables after sync:**
```bash
# Get a pod name
POD=$(kubectl get pods -n mosaic-prod -l app=core-api -o jsonpath='{.items[0].metadata.name}')

# Check SES variables are set
kubectl exec -n mosaic-prod $POD -- env | grep -E "SES_|APP_URL"
```

Expected output:
```
SES_FROM_EMAIL=noreply@mosaiclife.me
SES_REGION=us-east-1
APP_URL=https://mosaiclife.me
```

### Step 4: Test Email Sending

**Option A: Test via Application**

1. Log into https://mosaiclife.me
2. Navigate to a legacy
3. Click member count to open drawer
4. Click "Invite Member"
5. Enter an email and role
6. Click "Send Invitation"
7. Check the logs:
   ```bash
   kubectl logs -n mosaic-prod -l app=core-api --tail=50 | grep -i email
   ```
   
   Should see:
   ```
   INFO: Invitation email sent to=user@example.com message_id=<some-id>
   ```

**Option B: Test with Python Script**

```bash
cd services/core-api

# Set environment to point to production credentials
export AWS_PROFILE=mosaic-prod
export SES_FROM_EMAIL=noreply@mosaiclife.me
export SES_REGION=us-east-1
export APP_URL=https://mosaiclife.me

# Run the diagnostic script
uv run python scripts/test_ses.py

# When prompted, enter your email to receive a test
```

### Step 5: Monitor and Verify

**Check application logs:**
```bash
# Real-time logs
kubectl logs -n mosaic-prod -l app=core-api -f | grep -i email

# Recent email activity
kubectl logs -n mosaic-prod -l app=core-api --tail=100 | grep -i "invitation\|email\|ses"
```

**Check SES metrics:**
```bash
# Sending statistics
aws ses get-send-statistics --region us-east-1

# Current quota and usage
aws ses get-send-quota --region us-east-1
```

**Check CloudWatch Logs:**
```bash
# If CloudWatch logging is enabled
aws logs tail /aws/eks/mosaic-prod/core-api --follow --region us-east-1 | grep -i email
```

## Staging Environment

Repeat the same steps for staging:

1. **CDK:** Same CDK stack change applies to both prod and staging
   ```bash
   cdk deploy DatabaseStack-staging --profile mosaic-staging
   ```

2. **GitOps:** Update `environments/staging/values.yaml`:
   ```yaml
   core-api:
     env:
       SES_FROM_EMAIL: "noreply@mosaiclife.me"
       SES_REGION: "us-east-1"
       APP_URL: "https://staging.mosaiclife.me"
   ```

3. **Verify:**
   ```bash
   kubectl exec -n mosaic-staging <pod> -- env | grep SES_
   ```

## Verification Checklist

- [ ] CDK changes committed and pushed to main branch
- [ ] CDK deployed to production: `cdk deploy DatabaseStack-prod`
- [ ] IAM policy verified: role has ses:SendEmail and ses:SendRawEmail
- [ ] GitOps repo updated with SES_FROM_EMAIL and SES_REGION
- [ ] GitOps changes committed and pushed
- [ ] ArgoCD synced automatically (or manually triggered)
- [ ] Pods restarted with new environment variables
- [ ] Environment variables verified in running pods
- [ ] Test email sent successfully via diagnostic script
- [ ] Invitation email sent successfully via application
- [ ] Email received in recipient inbox (check spam folder)
- [ ] Application logs show "Invitation email sent" not "local mode"

## Rollback Plan

If issues occur:

1. **Revert GitOps changes:**
   ```bash
   cd gitops
   git revert HEAD
   git push origin main
   ```
   ArgoCD will auto-sync and remove the SES variables.

2. **Revert CDK changes:**
   ```bash
   cd infra/cdk
   git revert HEAD
   cdk deploy DatabaseStack-prod
   ```

3. **Check application still works without SES:**
   - It will fall back to "local mode" (logging only)
   - No emails sent, but no errors

## Common Issues

| Issue | Solution |
|-------|----------|
| "Would send invitation email" in logs | SES_FROM_EMAIL not set in pod environment |
| AccessDenied error | IAM role missing SES permissions - deploy CDK |
| Email not verified error | noreply@mosaiclife.me not verified - already done ✅ |
| Emails go to spam | Add SPF/DKIM records (separate task) |
| Rate limit exceeded | Check SES quota with `aws ses get-send-quota` |

## Next Steps After Deployment

1. **Monitor SES metrics** for first 24 hours
2. **Check bounce/complaint rates** in SES dashboard
3. **Set up SPF/DKIM records** to improve deliverability (if not already done)
4. **Request production access** if still in sandbox mode (currently can send 200/day)
5. **Add CloudWatch alarms** for SES bounces/complaints

## Related Documentation

- SES Troubleshooting: `docs/ops/SES-EMAIL-TROUBLESHOOTING.md`
- Design Doc: `docs/plans/2025-01-29-legacy-member-invitations-design.md`
- Implementation: `docs/plans/2025-01-29-legacy-member-invitations-implementation.md`

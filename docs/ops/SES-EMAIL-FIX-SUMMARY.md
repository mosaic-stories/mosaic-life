# SES Email Fix - Implementation Summary

## Problem Identified ✅

**Root Cause:** The `SES_FROM_EMAIL` environment variable is **NOT configured** in the Kubernetes deployment, causing the application to run in "local mode" which only logs emails to the console instead of sending them via SES.

### Verification

```bash
# Confirmed SES is working at AWS level
$ aws ses send-email --from noreply@mosaiclife.me --to joe@mosaiclife.me --subject "Test" --text "Test" --region us-east-1
✅ SUCCESS - MessageId: 0100019ad2cf5e68-21177d43-9c6d-4ee6-b514-00e93ac298ef-000000

# Confirmed email is verified
$ aws sesv2 list-email-identities --region us-east-1
✅ noreply@mosaiclife.me - VerificationStatus: SUCCESS
✅ mosaiclife.me (domain) - VerificationStatus: SUCCESS

# Confirmed environment variables are MISSING in pods
$ kubectl exec -n mosaic-prod core-api-xxx -- env | grep SES
❌ (no output - variables not set)

$ kubectl exec -n mosaic-prod core-api-xxx -- env | grep APP_URL
✅ APP_URL=https://mosaiclife.me
```

## Application Behavior

The email service code (`services/core-api/app/services/email.py:115`) checks:

```python
if not settings.ses_from_email:
    logger.info("Would send invitation email", ...)
    print(f"\n{'=' * 60}")
    print("INVITATION EMAIL (local mode - not sent)")
    # ... logs to console but doesn't send
    return True
```

When `SES_FROM_EMAIL` is not set, emails are **logged to console only** and never sent via SES.

## Solution

### Option 1: Quick Fix via kubectl (Temporary)

**NOT RECOMMENDED** - This violates GitOps principles and will be overwritten by ArgoCD.

```bash
# Get current deployment
kubectl get deployment -n mosaic-prod core-api -o yaml > /tmp/core-api-deployment.yaml

# Edit to add SES variables in env section
# Then apply
kubectl apply -f /tmp/core-api-deployment.yaml
```

### Option 2: Update via GitOps Repository (Recommended)

Since your ArgoCD application uses multi-source with values from the gitops repo:

```yaml
# From: infra/argocd/applications/mosaic-life-prod.yaml
sources:
  - repoURL: https://github.com/mosaic-stories/mosaic-life
    targetRevision: main
    path: infra/helm/mosaic-life
    helm:
      valueFiles:
        - $values/environments/prod/values.yaml  # <- VALUES FROM GITOPS REPO
        - $values/base/values.yaml               # <- VALUES FROM GITOPS REPO
  
  - repoURL: https://github.com/mosaic-stories/gitops.git
    targetRevision: main
    ref: values
```

**Action Required:** Update the gitops repository:

1. Clone the gitops repository:
   ```bash
   git clone https://github.com/mosaic-stories/gitops.git
   cd gitops
   ```

2. Edit `environments/prod/values.yaml` (or wherever core-api values are):
   ```yaml
   # Add to core-api environment variables
   core-api:
     env:
       # ... existing vars ...
       SES_FROM_EMAIL: "noreply@mosaiclife.me"
       SES_REGION: "us-east-1"
   ```

3. Commit and push:
   ```bash
   git add environments/prod/values.yaml
   git commit -m "feat(core-api): add SES email configuration for invitations"
   git push
   ```

4. ArgoCD will auto-sync (or manually sync):
   ```bash
   argocd app sync mosaic-life-prod
   ```

### Option 3: Inline Values Override (If no GitOps repo access)

If you don't have access to the gitops repo, you can modify the ArgoCD application to use inline values:

```bash
kubectl edit application mosaic-life-prod -n argocd
```

Add inline values to the helm source:

```yaml
sources:
  - repoURL: https://github.com/mosaic-stories/mosaic-life
    targetRevision: main
    path: infra/helm/mosaic-life
    helm:
      valueFiles:
        - $values/environments/prod/values.yaml
        - $values/base/values.yaml
      # Add inline values override
      values: |
        core-api:
          env:
            SES_FROM_EMAIL: "noreply@mosaiclife.me"
            SES_REGION: "us-east-1"
```

## IAM Permissions

The current IRSA role (`mosaic-prod-core-api-secrets-role`) needs SES permissions added.

### Check Current Permissions

```bash
ROLE_NAME="mosaic-prod-core-api-secrets-role"
aws iam list-attached-role-policies --role-name "$ROLE_NAME"
aws iam list-role-policies --role-name "$ROLE_NAME"
```

### Add SES Policy

**Option A: Create Managed Policy (Recommended)**

```bash
# Create policy document
cat > /tmp/ses-policy.json << 'EOF'
{
  "Version": "2012-17",
  "Statement": [
    {
      "Sid": "SESSendEmail",
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SESReadAccess",
      "Effect": "Allow",
      "Action": [
        "ses:GetSendQuota",
        "ses:GetSendStatistics",
        "ses:ListVerifiedEmailAddresses"
      ],
      "Resource": "*"
    }
  ]
}
EOF

# Create the policy
aws iam create-policy \
  --policy-name mosaic-prod-core-api-ses-policy \
  --policy-document file:///tmp/ses-policy.json \
  --description "Allow core-api to send emails via SES"

# Attach to role
aws iam attach-role-policy \
  --role-name mosaic-prod-core-api-secrets-role \
  --policy-arn "arn:aws:iam::033691785857:policy/mosaic-prod-core-api-ses-policy"
```

**Option B: Inline Policy**

```bash
aws iam put-role-policy \
  --role-name mosaic-prod-core-api-secrets-role \
  --policy-name SESSendEmailPolicy \
  --policy-document file:///tmp/ses-policy.json
```

### Verify Permissions

```bash
# List policies
aws iam list-attached-role-policies --role-name mosaic-prod-core-api-secrets-role
aws iam list-role-policies --role-name mosaic-prod-core-api-secrets-role

# Get inline policy
aws iam get-role-policy \
  --role-name mosaic-prod-core-api-secrets-role \
  --policy-name SESSendEmailPolicy
```

## Testing

### 1. Verify Environment Variables After Deployment

```bash
# Wait for new pods to start
kubectl get pods -n mosaic-prod -l app=core-api -w

# Check environment variables
POD=$(kubectl get pod -n mosaic-prod -l app=core-api -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n mosaic-prod $POD -- env | grep SES

# Expected output:
# SES_FROM_EMAIL=noreply@mosaiclife.me
# SES_REGION=us-east-1
```

### 2. Test with Python Diagnostic Script

```bash
# Port-forward to a pod
kubectl port-forward -n mosaic-prod $POD 8080:8080 &

# Run diagnostic locally
cd services/core-api
export SES_FROM_EMAIL=noreply@mosaiclife.me
export SES_REGION=us-east-1
export APP_URL=https://mosaiclife.me
uv run python scripts/test_ses.py
```

### 3. Test Invitation Flow

1. Log into https://mosaiclife.me
2. Navigate to a legacy you own
3. Click the member count to open MemberDrawer
4. Click "Invite Member"
5. Enter an email address and select a role
6. Click "Send Invitation"
7. Check logs:
   ```bash
   kubectl logs -n mosaic-prod -l app=core-api --tail=50 | grep -i email
   ```
   
   **Expected (SUCCESS):**
   ```
   INFO: Invitation email sent to=test@example.com message_id=<some-id>
   ```
   
   **NOT Expected (FAILURE):**
   ```
   INFO: Would send invitation email (local mode - not sent)
   ```

8. Check recipient's inbox (including spam folder)

### 4. Monitor SES Metrics

```bash
# Check sending statistics
aws ses get-send-statistics --region us-east-1 | jq '.SendDataPoints | sort_by(.Timestamp) | reverse | .[0:5]'

# Check quota
aws ses get-send-quota --region us-east-1
```

## Staging Environment

The same fix needs to be applied to staging:

```bash
# Check staging
kubectl exec -n mosaic-staging core-api-xxx -- env | grep SES

# Update staging values in gitops repo
# environments/staging/values.yaml
```

## Rollback Plan

If emails start failing after the change:

```bash
# Check logs for errors
kubectl logs -n mosaic-prod -l app=core-api --tail=100 | grep -i "error\|failed"

# Remove SES env vars to revert to local mode
# (update gitops repo and sync)

# Or quick revert via kubectl
kubectl set env deployment/core-api -n mosaic-prod SES_FROM_EMAIL-
kubectl set env deployment/core-api -n mosaic-prod SES_REGION-
```

## Monitoring

### Application Logs

```bash
# Tail logs for email activity
kubectl logs -n mosaic-prod -l app=core-api -f | grep -i email

# Search CloudWatch Logs (if configured)
aws logs tail /aws/eks/mosaic-prod/core-api --follow --region us-east-1 | grep -i email
```

### SES Dashboard

View in AWS Console:
- https://console.aws.amazon.com/ses/home?region=us-east-1#dashboard

Monitor:
- Send count
- Bounce rate (should be < 5%)
- Complaint rate (should be < 0.1%)
- Reputation dashboard

### CloudWatch Metrics

```bash
# View send count
aws cloudwatch get-metric-statistics \
  --namespace AWS/SES \
  --metric-name Send \
  --start-time "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
  --period 300 \
  --statistics Sum \
  --region us-east-1
```

## SES Sandbox Status

Current status: **Sending is ENABLED**, likely out of sandbox (quota: 200/day, 1/sec)

To verify:
```bash
aws sesv2 get-account --region us-east-1 | jq '.ProductionAccessEnabled'
```

If in sandbox:
- Can only send TO verified addresses
- Request production access: https://console.aws.amazon.com/ses/home?region=us-east-1#/get-set-up

## Checklist

- [x] Confirmed SES email is verified (noreply@mosaiclife.me)
- [x] Confirmed SES sending works (test email sent successfully)
- [x] Identified missing environment variables in deployment
- [x] Updated Helm values.yaml reference file
- [x] Created diagnostic scripts
- [ ] **TODO: Update gitops repository with SES environment variables**
- [ ] **TODO: Add IAM SES permissions to IRSA role**
- [ ] Sync ArgoCD application
- [ ] Verify environment variables in pods
- [ ] Test invitation flow end-to-end
- [ ] Monitor logs and metrics
- [ ] Apply same fix to staging environment

## Next Steps

1. **Immediate:** Update the gitops repository to add SES environment variables
2. **Immediate:** Add SES IAM permissions to the IRSA role
3. **After deployment:** Verify environment variables are set in pods
4. **After deployment:** Test invitation flow
5. **Monitor:** Check logs and SES metrics for 24 hours
6. **Document:** Update runbook with monitoring procedures

## Files Created

- `/apps/mosaic-life/scripts/troubleshoot-ses.sh` - Shell diagnostic script
- `/apps/mosaic-life/services/core-api/scripts/test_ses.py` - Python SES tester
- `/apps/mosaic-life/docs/ops/SES-EMAIL-TROUBLESHOOTING.md` - Detailed troubleshooting guide
- `/apps/mosaic-life/docs/ops/SES-EMAIL-FIX-SUMMARY.md` - This file

## Files Modified

- `/apps/mosaic-life/infra/helm/core-api/values.yaml` - Added SES config (reference only, not used in prod)

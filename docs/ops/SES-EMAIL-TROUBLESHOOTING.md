# SES Email Configuration & Troubleshooting Guide

## Issue
Emails are not being delivered from the invitation system. The sender email `noreply@mosaiclife.me` has been verified in SES, but emails are still not going through.

## Root Cause Analysis

Based on the code review, there are several potential issues:

### 1. ❌ Missing Environment Variable Configuration

**Problem:** The `SES_FROM_EMAIL` environment variable is not configured in the Helm deployment.

**Current State:**
- Code checks: `if not settings.ses_from_email:` (line 115 in email.py)
- If not set, it runs in "local mode" and only logs to console instead of sending
- Helm values.yaml does NOT include `SES_FROM_EMAIL` or `SES_REGION` in the `env:` section

**Fix Required:** Add to `infra/helm/core-api/values.yaml`:
```yaml
env:
  # ... existing vars ...
  SES_FROM_EMAIL: noreply@mosaiclife.me
  SES_REGION: us-east-1
  APP_URL: https://mosaiclife.me  # or appropriate domain
```

### 2. ❌ Missing IAM Permissions

**Problem:** The core-api service account may not have SES permissions.

**Current IRSA Role:** `arn:aws:iam::033691785857:role/mosaic-prod-core-api-secrets-role`

This role currently only has Secrets Manager permissions. It needs SES permissions added.

**Required IAM Policy:**
```json
{
  "Version": "2012-10-17",
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
      "Sid": "SESGetQuota",
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
```

### 3. ⚠️ Potential SES Sandbox Mode

**Problem:** If the AWS SES account is still in sandbox mode, emails can only be sent:
- FROM verified email addresses ✅ (noreply@mosaiclife.me is verified)
- TO verified email addresses only ❌ (restricts who can receive invites)

**Check:** Run `aws ses get-account-sending-enabled --region us-east-1`

**Fix:** Request production access in AWS SES Console if in sandbox mode.

## Diagnostic Steps

### Step 1: Run the Shell Script Diagnostic

```bash
cd /apps/mosaic-life
export SES_FROM_EMAIL=noreply@mosaiclife.me
./scripts/troubleshoot-ses.sh
```

This will check:
- AWS credentials
- SES verified identities
- SES sending quota
- Account sandbox status
- IAM permissions (basic)
- CloudWatch metrics

### Step 2: Run the Python Diagnostic Script

This provides a more detailed test including actual email sending:

```bash
cd /apps/mosaic-life/services/core-api

# Set environment variables
export SES_FROM_EMAIL=noreply@mosaiclife.me
export SES_REGION=us-east-1
export APP_URL=https://mosaiclife.me

# Run the diagnostic
uv run python scripts/test_ses.py
```

When prompted, enter your email address to receive a test email.

### Step 3: Check Application Logs

**For Kubernetes deployment:**
```bash
# Check if SES_FROM_EMAIL is set in the pods
kubectl get pods -n mosaic-life -l app=core-api
kubectl exec -n mosaic-life <pod-name> -- env | grep SES

# Check application logs for email-related messages
kubectl logs -n mosaic-life -l app=core-api --tail=100 | grep -i "email\|ses\|invitation"
```

**For local docker-compose:**
```bash
docker compose -f infra/compose/docker-compose.yml logs core-api | grep -i email
```

### Step 4: Test SES Directly with AWS CLI

```bash
# Send a test email directly via SES
aws ses send-email \
  --from noreply@mosaiclife.me \
  --to your-email@example.com \
  --subject "Test Email from AWS CLI" \
  --text "This is a test email to verify SES is working" \
  --region us-east-1
```

If this works, the issue is with application configuration, not SES itself.

### Step 5: Check SES Sending Statistics

```bash
# View recent sending activity
aws ses get-send-statistics --region us-east-1

# Check sending quota
aws ses get-send-quota --region us-east-1

# List verified identities
aws ses list-verified-email-addresses --region us-east-1
```

## Required Fixes

### Fix 1: Update Helm Values

Edit `infra/helm/core-api/values.yaml`:

```yaml
env:
  ENV: production  # or staging
  LOG_LEVEL: info
  
  # SES Configuration - ADD THESE
  SES_FROM_EMAIL: noreply@mosaiclife.me
  SES_REGION: us-east-1
  APP_URL: https://mosaiclife.me
  
  # ... rest of existing vars ...
```

### Fix 2: Update IAM Role Policy

Add SES permissions to the existing IRSA role:

```bash
# Get the current role name
ROLE_NAME="mosaic-prod-core-api-secrets-role"

# Create the policy document
cat > /tmp/ses-policy.json << 'EOF'
{
  "Version": "2012-10-17",
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
  --policy-document file:///tmp/ses-policy.json

# Attach the policy to the role
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "arn:aws:iam::033691785857:policy/mosaic-prod-core-api-ses-policy"
```

Or if you want to update inline:

```bash
aws iam put-role-policy \
  --role-name mosaic-prod-core-api-secrets-role \
  --policy-name SESSendEmailPolicy \
  --policy-document file:///tmp/ses-policy.json
```

### Fix 3: Redeploy the Application

After updating Helm values:

```bash
# Via ArgoCD (recommended for GitOps)
git add infra/helm/core-api/values.yaml
git commit -m "feat(core-api): add SES environment variables for email sending"
git push

# ArgoCD will auto-sync, or manually trigger:
argocd app sync mosaic-life-core-api

# Or via Helm directly (not recommended for production)
helm upgrade core-api ./infra/helm/core-api \
  --namespace mosaic-life \
  --values ./infra/helm/core-api/values.yaml
```

### Fix 4: Request Production Access (if in Sandbox)

1. Go to AWS SES Console: https://console.aws.amazon.com/ses/home?region=us-east-1
2. Navigate to "Account Dashboard"
3. Look for "Sending statistics" or "Account status"
4. If it says "Sandbox", click "Request production access"
5. Fill out the form explaining your use case (memorial/legacy platform, transactional invitation emails)

## Testing After Fixes

1. **Check environment variables are set:**
   ```bash
   kubectl exec -n mosaic-life <pod-name> -- env | grep SES
   ```
   
   Should show:
   ```
   SES_FROM_EMAIL=noreply@mosaiclife.me
   SES_REGION=us-east-1
   ```

2. **Test invitation flow:**
   - Log into the application
   - Navigate to a legacy
   - Click member count to open MemberDrawer
   - Click "Invite Member"
   - Enter an email address and role
   - Click "Send Invitation"

3. **Check application logs:**
   ```bash
   kubectl logs -n mosaic-life -l app=core-api --tail=50 | grep -i email
   ```
   
   Should see:
   ```
   INFO: Invitation email sent to=user@example.com message_id=<some-id>
   ```
   
   Should NOT see:
   ```
   INFO: Would send invitation email (local mode - not sent)
   ```

4. **Check recipient inbox:**
   - Check main inbox
   - Check spam/junk folder
   - Check "Promotions" or "Updates" tabs in Gmail

## Monitoring

### CloudWatch Logs

Application logs are in CloudWatch Logs:
```bash
aws logs tail /aws/eks/mosaic-life/core-api --follow --region us-east-1
```

### SES Metrics

Monitor in CloudWatch Metrics:
- Namespace: AWS/SES
- Metrics: Send, Delivery, Bounce, Complaint

### SES Dashboard

View in AWS Console:
https://console.aws.amazon.com/ses/home?region=us-east-1#dashboard:

## Common Issues & Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| Local mode active | Logs show "Would send invitation email" | Set `SES_FROM_EMAIL` env var |
| Permission denied | Error: "AccessDenied" | Add IAM SES permissions to IRSA role |
| Email not verified | Error: "Email address not verified" | Verify sender email in SES console |
| Sandbox mode | Can only send to verified emails | Request production access |
| Email goes to spam | Recipient doesn't see it | Check SPF/DKIM records, improve content |
| Rate limit exceeded | Error: "Max send rate exceeded" | Check SES quota, add retry logic |

## Verification Checklist

- [ ] `noreply@mosaiclife.me` is verified in SES (✅ confirmed)
- [ ] `SES_FROM_EMAIL` environment variable is set in Helm values
- [ ] `SES_REGION` environment variable is set (defaults to us-east-1)
- [ ] IAM role has `ses:SendEmail` and `ses:SendRawEmail` permissions
- [ ] Application pods have restarted with new environment variables
- [ ] Test email sent successfully via Python diagnostic script
- [ ] Invitation flow tested end-to-end
- [ ] Email received in recipient inbox (check spam folder)
- [ ] SES account moved out of sandbox mode (if needed)

## Next Steps

1. Run `./scripts/troubleshoot-ses.sh` to get current status
2. Update Helm values to add `SES_FROM_EMAIL`
3. Update IAM role to add SES permissions
4. Redeploy application
5. Test with Python diagnostic script
6. Test invitation flow in application
7. Monitor logs and CloudWatch metrics

## Resources

- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)
- [SES Sandbox Mode](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [SES IAM Permissions](https://docs.aws.amazon.com/ses/latest/dg/control-user-access.html)
- [Email Best Practices](https://docs.aws.amazon.com/ses/latest/dg/best-practices.html)

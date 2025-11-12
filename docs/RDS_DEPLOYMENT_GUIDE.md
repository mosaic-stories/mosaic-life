# RDS PostgreSQL Deployment Guide

## Quick Deployment Steps

Follow these steps to deploy the RDS database and configure your application to use it.

### Prerequisites

✅ AWS CDK installed and configured
✅ EKS cluster running with External Secrets Operator installed
✅ kubectl configured for your cluster

---

## Step 1: Deploy the Database (10-15 minutes)

```bash
# Deploy RDS stack via CDK
just db-deploy
```

This command will:
- Create a PostgreSQL 16.x instance (db.t3.micro)
- Set up security groups in private subnets
- Create credentials in AWS Secrets Manager
- Configure IAM roles for Kubernetes IRSA
- Enable automated backups (7-day retention)

**Wait for deployment to complete.** You'll see output similar to:

```
✓ MosaicDatabaseStack

Outputs:
MosaicDatabaseStack.DatabaseEndpoint = mosaic-prod-db.xxxxx.us-east-1.rds.amazonaws.com
MosaicDatabaseStack.DatabasePort = 5432
MosaicDatabaseStack.DatabaseConnectionSecretArn = arn:aws:secretsmanager:...
MosaicDatabaseStack.CoreApiSecretsRoleArn = arn:aws:iam::ACCOUNT:role/mosaic-prod-core-api-secrets-role
```

---

## Step 2: Get IRSA Role ARN

```bash
# View database connection info and IAM role
just db-info
```

Copy the **IRSA Role ARN** (looks like `arn:aws:iam::ACCOUNT:role/mosaic-prod-core-api-secrets-role`)

---

## Step 3: Update Your Helm Values

### Option A: GitOps Repository (Recommended)

If using ArgoCD with a GitOps repo:

1. **Edit your environment values file:**
   ```bash
   # For production
   vim /apps/mosaic-life-gitops/environments/prod/values.yaml
   ```

2. **Add/update these sections:**
   ```yaml
   # Service Account with IRSA
   serviceAccount:
     create: true
     automount: true
     annotations:
       eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/mosaic-prod-core-api-secrets-role
     name: ""

   # External Secrets configuration
   externalSecrets:
     enabled: true
     secretStore: aws-secrets-manager
     databaseSecretName: "mosaic/prod/rds/connection"
     region: us-east-1

   # Database migrations
   migrations:
     enabled: true
     autoRun: true

   # Update image tags to latest version
   image:
     repository: ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/mosaic-life/core-api
     tag: "latest"  # or specific SHA
   ```

3. **Commit and push:**
   ```bash
   git add environments/prod/values.yaml
   git commit -m "feat: configure RDS database integration with IRSA"
   git push
   ```

4. **ArgoCD will automatically deploy** (or trigger manually):
   ```bash
   argocd app sync mosaic-life-prod
   ```

### Option B: Direct Helm Deployment

If deploying directly via Helm:

1. **Update values in this repo:**
   ```bash
   vim infra/helm/core-api/values.yaml
   ```

2. **Add the IRSA annotation:**
   ```yaml
   serviceAccount:
     annotations:
       eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/mosaic-prod-core-api-secrets-role
   ```

3. **Deploy:**
   ```bash
   just helm-deploy latest
   ```

---

## Step 4: Verify Deployment

### Check External Secret Sync

```bash
# Check if External Secret is syncing
kubectl get externalsecret -n mosaic-prod

# Should show: STATUS = SecretSynced
# If not, check details:
kubectl describe externalsecret core-api-db -n mosaic-prod
```

### Check Kubernetes Secret Created

```bash
# Verify the database secret was created
kubectl get secret -n mosaic-prod core-api-db-secret

# View secret contents (base64 encoded)
kubectl get secret -n mosaic-prod core-api-db-secret -o yaml
```

### Check Migration Job

```bash
# Check if migration job ran successfully
kubectl get jobs -n mosaic-prod | grep migration

# View migration logs
kubectl logs -n mosaic-prod job/core-api-migration-<revision>
```

Expected output:
```
Starting database migration...
Alembic version: 1.x.x
Current migration status:
Running migrations...
INFO  [alembic.runtime.migration] Running upgrade  -> abc123
Migration completed successfully!
```

### Check Application Pods

```bash
# Check if core-api pods are running
kubectl get pods -n mosaic-prod -l app.kubernetes.io/name=core-api

# View pod logs (should NOT see "DB_URL not configured" error)
kubectl logs -n mosaic-prod deployment/core-api --tail=50
```

Expected logs:
```
INFO:     core-api.start env=prod
INFO:     10.x.x.x:xxxxx - "GET /healthz HTTP/1.1" 200 OK
INFO:     10.x.x.x:xxxxx - "GET /readyz HTTP/1.1" 200 OK
```

---

## Step 5: Test Database Connection

### Test from Application Pod

```bash
# Get a core-api pod name
POD=$(kubectl get pods -n mosaic-prod -l app.kubernetes.io/name=core-api -o jsonpath='{.items[0].metadata.name}')

# Check database connection
kubectl exec -n mosaic-prod $POD -- python -c "
import os
from sqlalchemy import create_engine
engine = create_engine(os.environ['DB_URL'])
with engine.connect() as conn:
    result = conn.execute('SELECT version()')
    print('PostgreSQL version:', result.fetchone()[0])
"
```

### Test Migration Status

```bash
# Check current migration version
kubectl exec -n mosaic-prod $POD -- alembic current

# Should show the latest migration hash
```

### Test API Endpoint

```bash
# Test authentication endpoint (should not error about database)
curl -v https://backend.mosaiclife.me/api/v1/auth/me
```

---

## Troubleshooting

### Error: "DB_URL not configured"

**Cause:** External Secret not syncing or IRSA not configured correctly.

**Fix:**
1. Check IRSA role ARN in ServiceAccount:
   ```bash
   kubectl get sa core-api -n mosaic-prod -o yaml | grep eks.amazonaws.com/role-arn
   ```

2. Verify IAM role trust policy allows the service account:
   ```bash
   aws iam get-role --role-name mosaic-prod-core-api-secrets-role
   ```

3. Check External Secrets Operator logs:
   ```bash
   kubectl logs -n external-secrets-system deployment/external-secrets
   ```

### Error: "SecretSyncError"

**Cause:** IAM permissions issue or secret doesn't exist in AWS.

**Fix:**
1. Verify secret exists:
   ```bash
   aws secretsmanager describe-secret --secret-id mosaic/prod/rds/connection
   ```

2. Test IAM permissions manually:
   ```bash
   # Assume the IRSA role and test access
   aws secretsmanager get-secret-value --secret-id mosaic/prod/rds/connection
   ```

### Migration Job Fails

**Cause:** Database not reachable or migration conflict.

**Fix:**
1. Check database security group allows traffic from EKS:
   ```bash
   just db-info  # Note security group ID
   aws ec2 describe-security-groups --group-ids sg-xxxxx
   ```

2. Check network connectivity from pod:
   ```bash
   kubectl run -it --rm debug --image=postgres:16 --restart=Never -- \
     psql "postgresql://USER:PASS@ENDPOINT:5432/mosaic" -c "SELECT 1"
   ```

3. Delete failed job and retry:
   ```bash
   kubectl delete job -n mosaic-prod core-api-migration-<revision>
   # Redeploy to trigger new migration job
   ```

---

## Rollback Procedure

If something goes wrong and you need to rollback:

### Rollback Application Deployment

```bash
# Via GitOps: revert commit in gitops repo
git revert HEAD
git push

# Via Helm: rollback to previous release
helm rollback core-api -n mosaic-prod
```

### Rollback Database (if needed)

```bash
# Option 1: Rollback migrations
POD=$(kubectl get pods -n mosaic-prod -l app.kubernetes.io/name=core-api -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n mosaic-prod $POD -- alembic downgrade -1

# Option 2: Restore from snapshot (destructive!)
# See docs/DATABASE_SETUP.md for full restore procedure
```

---

## Post-Deployment Checklist

- [ ] Database deployed successfully
- [ ] IRSA role configured in Helm values
- [ ] External Secret syncing (status: SecretSynced)
- [ ] Kubernetes secret created (core-api-db-secret)
- [ ] Migration job completed successfully
- [ ] Application pods running without database errors
- [ ] API endpoints responding correctly
- [ ] End-to-end authentication flow working
- [ ] Database connection tested from pod
- [ ] CloudWatch alarms configured (optional)
- [ ] Backup restore tested (recommended)

---

## Cost Summary

| Resource | Configuration | Monthly Cost |
|----------|--------------|-------------|
| RDS Instance | db.t3.micro | $13-15 |
| Storage | 20 GB gp3 | $2-3 |
| Backups | 7-day retention | $0.10-0.20 |
| **Total** | **MVP/Testing** | **$15-19** |

**Upgrade Path:**
- db.t3.small (2 GB RAM): ~$30/month
- db.t3.medium (4 GB RAM): ~$60/month
- Multi-AZ enabled: +100% cost

---

## Next Steps

1. **Set up monitoring:**
   ```bash
   # Create CloudWatch alarms for high CPU, low storage, etc.
   # See docs/DATABASE_SETUP.md "Monitoring" section
   ```

2. **Test backup and restore:**
   ```bash
   # Create a manual snapshot
   aws rds create-db-snapshot \
     --db-instance-identifier mosaic-prod-db \
     --db-snapshot-identifier test-snapshot-$(date +%Y%m%d)
   
   # Practice restore procedure
   # See docs/DATABASE_SETUP.md "Backup and Recovery" section
   ```

3. **Configure alerting:**
   - Set up PagerDuty/Slack notifications for database issues
   - Create runbooks for common database problems

4. **Plan for scaling:**
   - Monitor database metrics over time
   - Identify when to upgrade instance size
   - Consider read replicas when needed

---

## Support

For detailed database management, see:
- **[Database Setup Guide](docs/DATABASE_SETUP.md)** - Comprehensive database documentation

For deployment issues:
- **[Troubleshooting](docs/DATABASE_SETUP.md#troubleshooting)** - Common issues and solutions
- **GitHub Issues:** https://github.com/mosaic-stories/mosaic-life/issues

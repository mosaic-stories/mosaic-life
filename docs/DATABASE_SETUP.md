# RDS PostgreSQL Database Setup

This document covers the setup, configuration, and management of the Amazon RDS PostgreSQL database for Mosaic Life.

## Overview

The database infrastructure is managed via AWS CDK and deployed as a separate stack (`MosaicDatabaseStack`). This setup provides:

- **Cost-optimized configuration** for MVP/testing (~$15-19/month)
- **Production upgrade path** without application changes
- **Automated backups** and point-in-time recovery
- **Secure credential management** via AWS Secrets Manager
- **Kubernetes integration** via External Secrets Operator
- **Automatic migrations** on deployment via Helm hooks

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     EKS Cluster (mosaic-prod)                │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Core API Pods (with IRSA)                           │   │
│  │  - ServiceAccount: core-api                          │   │
│  │  - IAM Role: mosaic-prod-core-api-secrets-role       │   │
│  └──────────────┬───────────────────────────────────────┘   │
│                 │                                             │
│  ┌──────────────▼───────────────────────────────────────┐   │
│  │  External Secrets Operator                           │   │
│  │  - Syncs secrets from AWS Secrets Manager           │   │
│  │  - Creates K8s secret: core-api-db-secret           │   │
│  └──────────────┬───────────────────────────────────────┘   │
└─────────────────┼───────────────────────────────────────────┘
                  │
         ┌────────┼────────┐
         │        │        │
         ▼        ▼        ▼
    ┌────────┐ ┌──────────────────┐ ┌─────────────────┐
    │   RDS  │ │ Secrets Manager  │ │  IAM (IRSA)     │
    │Postgres│ │ - Credentials    │ │ - Role policy   │
    │  16.x  │ │ - Connection URL │ │ - Trust policy  │
    └────────┘ └──────────────────┘ └─────────────────┘
```

---

## Quick Start

### 1. Deploy the Database

```bash
# Deploy RDS PostgreSQL stack
just db-deploy
```

This creates:
- RDS PostgreSQL 16.x instance (db.t3.micro)
- Security groups and subnet groups
- AWS Secrets Manager secrets
- IAM role for Kubernetes IRSA
- Automated backups (7-day retention)

**Deployment time:** 10-15 minutes

### 2. Update Helm Values with IRSA Role

After deployment, get the IAM role ARN:

```bash
just db-info
```

Update your Helm values file (e.g., `/apps/mosaic-life-gitops/environments/prod/values.yaml`):

```yaml
serviceAccount:
  create: true
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/mosaic-prod-core-api-secrets-role

externalSecrets:
  enabled: true
  secretStore: aws-secrets-manager
  databaseSecretName: "mosaic/prod/rds/connection"
  region: us-east-1

migrations:
  enabled: true
```

### 3. Deploy the Application

Deployment via GitOps (recommended):

```bash
just gitops-deploy prod
```

Or manual Helm deployment:

```bash
just helm-deploy <version>
```

The deployment will:
1. Create External Secret to sync DB credentials
2. Run database migrations automatically (Helm pre-install hook)
3. Start core-api pods with database connection

---

## Database Configuration

### Current Configuration (Cost-Optimized)

| Setting | Value | Purpose |
|---------|-------|---------|
| **Instance Type** | db.t3.micro | 2 vCPU, 1 GB RAM (~$13-15/month) |
| **Engine** | PostgreSQL 16.x | Latest stable version |
| **Storage** | 20 GB gp3 | SSD storage (~$2-4/month) |
| **Auto Scaling** | Up to 100 GB | Automatic storage growth |
| **Multi-AZ** | Disabled | Single-AZ for cost savings |
| **Backup Retention** | 7 days | Automated daily backups |
| **Encryption** | Enabled | Encryption at rest (KMS) |
| **Public Access** | Disabled | Only accessible from VPC |

**Total Monthly Cost:** ~$15-19/month

### Production Upgrade Path

When you have real users and need higher availability/performance:

#### Phase 1: Scale Up Instance
```typescript
// In infra/cdk/lib/database-stack.ts
instanceType: ec2.InstanceType.of(
  ec2.InstanceClass.T3,
  ec2.InstanceSize.SMALL // or MEDIUM
),
```

**Cost Impact:**
- db.t3.small: ~$30/month (2 vCPU, 2 GB RAM)
- db.t3.medium: ~$60/month (2 vCPU, 4 GB RAM)

#### Phase 2: Enable Multi-AZ
```typescript
multiAz: true, // High availability across AZs
```

**Cost Impact:** +100% (doubles instance cost)

#### Phase 3: Add Read Replicas
```typescript
// Create read replicas for scaling reads
const readReplica = new rds.DatabaseInstanceReadReplica(this, 'ReadReplica', {
  sourceDatabaseInstance: this.dbInstance,
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
  // ... other config
});
```

**Cost Impact:** +100% per replica

#### Phase 4: Enable Performance Insights
```typescript
enablePerformanceInsights: true,
performanceInsightRetention: rds.PerformanceInsightRetention.MONTHS_1,
```

**Cost Impact:** ~$2-3/month for 1-month retention

---

## Database Operations

### View Database Information

```bash
# Show connection details and configuration
just db-info
```

### Get Database Credentials

```bash
# Fetch credentials from AWS Secrets Manager
just db-get-credentials
```

Output example:
```json
{
  "host": "mosaic-prod-db.xxxxx.us-east-1.rds.amazonaws.com",
  "port": "5432",
  "database": "mosaic",
  "username": "mosaicadmin",
  "password": "xxxxx",
  "url": "postgresql://mosaicadmin:xxxxx@host:5432/mosaic",
  "sqlalchemy_url": "postgresql+psycopg://mosaicadmin:xxxxx@host:5432/mosaic"
}
```

### Connect to Database

#### From Kubernetes Pod (Recommended)

```bash
# Interactive psql session via temporary pod
just db-shell
```

#### From Local Machine (Requires Bastion/Port Forward)

```bash
# Get credentials
CREDS=$(just db-get-credentials)

# Create SSH tunnel via bastion (if configured)
# Or use AWS Systems Manager Session Manager

# Connect
psql postgresql://USER:PASS@HOST:5432/mosaic
```

### Run Database Migrations

Migrations run automatically during deployment via Helm hooks. To run manually:

```bash
# Run migrations in existing core-api pod
just db-migrate
```

Or directly in a pod:

```bash
POD=$(kubectl get pods -n mosaic-prod -l app.kubernetes.io/name=core-api -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it -n mosaic-prod $POD -- alembic upgrade head
```

### Check Migration Status

```bash
POD=$(kubectl get pods -n mosaic-prod -l app.kubernetes.io/name=core-api -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n mosaic-prod $POD -- alembic current
```

---

## Backup and Recovery

### Automated Backups

- **Frequency:** Daily during maintenance window (03:00-04:00 UTC)
- **Retention:** 7 days (increase to 30 days for production)
- **Storage:** Stored in AWS-managed S3 (no additional configuration needed)

### Manual Snapshot

```bash
# Create manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier mosaic-prod-db \
  --db-snapshot-identifier mosaic-prod-manual-$(date +%Y%m%d-%H%M%S)
```

### Restore from Backup

#### Point-in-Time Recovery (PITR)

```bash
# Restore to specific time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier mosaic-prod-db \
  --target-db-instance-identifier mosaic-prod-db-restored \
  --restore-time 2025-11-11T10:00:00Z \
  --vpc-security-group-ids sg-xxxxx
```

#### Restore from Snapshot

```bash
# List snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier mosaic-prod-db

# Restore
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier mosaic-prod-db-restored \
  --db-snapshot-identifier mosaic-prod-manual-20251111-120000
```

After restore:
1. Update DNS/connection strings
2. Run migrations if needed: `just db-migrate`
3. Verify data integrity

---

## Security

### Network Security

- **VPC Isolation:** Database runs in private subnets with no internet access
- **Security Group:** Only accepts connections from VPC CIDR (10.0.0.0/16)
- **No Public IP:** Database is not publicly accessible

### Access Control

- **IRSA (IAM Roles for Service Accounts):** Kubernetes pods authenticate via IAM roles
- **No Static Credentials:** Credentials stored in AWS Secrets Manager
- **External Secrets Operator:** Auto-syncs secrets to Kubernetes every 5 minutes
- **Least Privilege:** IAM policies grant only necessary permissions

### Credentials Rotation

To rotate database password:

```bash
# Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# Update in RDS
aws rds modify-db-instance \
  --db-instance-identifier mosaic-prod-db \
  --master-user-password "$NEW_PASSWORD" \
  --apply-immediately

# Update Secrets Manager
aws secretsmanager update-secret \
  --secret-id mosaic/prod/rds/credentials \
  --secret-string "{\"username\":\"mosaicadmin\",\"password\":\"$NEW_PASSWORD\"}"

# External Secrets will sync new password within 5 minutes
# Restart pods to pick up new credentials
kubectl rollout restart deployment/core-api -n mosaic-prod
```

### Encryption

- **At Rest:** AES-256 encryption via AWS KMS
- **In Transit:** TLS/SSL enforced for all connections
- **Secrets:** Encrypted in Secrets Manager with KMS

---

## Monitoring

### CloudWatch Metrics

View metrics in AWS Console:
- CPU Utilization
- Database Connections
- Read/Write IOPS
- Storage Space
- Replication Lag (if Multi-AZ)

### Database Logs

Logs are exported to CloudWatch Logs:

```bash
# View PostgreSQL logs
aws logs tail /aws/rds/instance/mosaic-prod-db/postgresql --follow

# View upgrade logs
aws logs tail /aws/rds/instance/mosaic-prod-db/upgrade --follow
```

### Performance Insights

Not enabled by default (cost savings). To enable:

```typescript
// In infra/cdk/lib/database-stack.ts
enablePerformanceInsights: true,
```

Then view in AWS Console → RDS → Performance Insights

### Alerting (Recommended)

Create CloudWatch alarms:

```bash
# High CPU usage
aws cloudwatch put-metric-alarm \
  --alarm-name mosaic-rds-high-cpu \
  --alarm-description "RDS CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DBInstanceIdentifier,Value=mosaic-prod-db \
  --evaluation-periods 2

# Low storage space
aws cloudwatch put-metric-alarm \
  --alarm-name mosaic-rds-low-storage \
  --alarm-description "RDS storage < 20%" \
  --metric-name FreeStorageSpace \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 4294967296 \  # 4 GB in bytes (20% of 20GB)
  --comparison-operator LessThanThreshold \
  --dimensions Name=DBInstanceIdentifier,Value=mosaic-prod-db \
  --evaluation-periods 1
```

---

## Troubleshooting

### Issue: Pods Can't Connect to Database

**Symptoms:**
- Pods crash with "DB_URL not configured" error
- External Secret shows "SecretSyncError"

**Diagnosis:**

```bash
# Check External Secret status
kubectl describe externalsecret -n mosaic-prod core-api-db

# Check if secret was created
kubectl get secret -n mosaic-prod core-api-db-secret

# Check IRSA role annotation
kubectl get sa -n mosaic-prod core-api -o yaml | grep eks.amazonaws.com/role-arn
```

**Solution:**

1. Verify IRSA role ARN in ServiceAccount annotation
2. Check IAM role trust policy allows the service account
3. Verify secret exists in AWS Secrets Manager:
   ```bash
   aws secretsmanager describe-secret --secret-id mosaic/prod/rds/connection
   ```

### Issue: Migration Job Fails

**Symptoms:**
- Helm deployment hangs on migration job
- Job pods show error logs

**Diagnosis:**

```bash
# Check migration job
kubectl get jobs -n mosaic-prod | grep migration

# View job logs
kubectl logs -n mosaic-prod job/core-api-migration-<revision>
```

**Common Causes:**

1. **Database not reachable:** Check security groups allow traffic from EKS pods
2. **Invalid credentials:** Verify secret content matches database
3. **Migration conflict:** Previous migration failed; check Alembic state

**Solution:**

```bash
# Delete failed job
kubectl delete job -n mosaic-prod core-api-migration-<revision>

# Fix underlying issue, then redeploy
just gitops-deploy prod
```

### Issue: High Database Connections

**Symptoms:**
- `FATAL: too many clients already` errors
- Application pods can't acquire connections

**Diagnosis:**

```bash
# Check connection count
kubectl exec -n mosaic-prod <pod> -- psql $DB_URL -c \
  "SELECT count(*) FROM pg_stat_activity;"
```

**Solution:**

1. Scale down replicas temporarily:
   ```bash
   kubectl scale deployment/core-api -n mosaic-prod --replicas=2
   ```

2. Increase `max_connections` in parameter group (requires restart)

3. Implement connection pooling (add pgbouncer)

### Issue: Slow Queries

**Diagnosis:**

```bash
# Find slow queries
kubectl exec -n mosaic-prod <pod> -- psql $DB_URL -c \
  "SELECT pid, now() - query_start AS duration, query 
   FROM pg_stat_activity 
   WHERE state = 'active' 
   ORDER BY duration DESC;"
```

**Solution:**

1. Add indexes for frequently queried columns
2. Enable Performance Insights for detailed analysis
3. Optimize queries with EXPLAIN ANALYZE
4. Scale up instance size if consistently slow

---

## Cost Optimization

### Current Costs (MVP Configuration)

| Resource | Monthly Cost |
|----------|-------------|
| db.t3.micro instance | $13-15 |
| 20 GB gp3 storage | $2-3 |
| Automated backups (7 days) | $0.10-0.20 |
| **Total** | **$15-19** |

### Cost Reduction Strategies

1. **Use Reserved Instances** (1-year commitment)
   - Save 30-40% on instance costs
   - Purchase via AWS Console → RDS → Reserved DB Instances

2. **Optimize Backup Storage**
   - Reduce retention period if not needed
   - Delete unnecessary manual snapshots

3. **Right-Size Instance**
   - Monitor CPU/memory usage
   - Scale down if consistently under 30% utilization

4. **Use Aurora Serverless** (future consideration)
   - Pay only for usage
   - Auto-scales with demand
   - May be more cost-effective at scale

---

## Maintenance

### Routine Tasks

- **Weekly:** Review CloudWatch metrics and alarms
- **Monthly:** Check backup integrity, test restore process
- **Quarterly:** Review costs, optimize configuration
- **Annually:** Consider reserved instance purchase

### Updates and Patching

- **Minor version updates:** Automatic (configured in CDK)
- **Major version updates:** Manual (requires testing)
- **Maintenance window:** Sunday 04:00-05:00 UTC

To upgrade major version:

```typescript
// In infra/cdk/lib/database-stack.ts
engine: rds.DatabaseInstanceEngine.postgres({
  version: rds.PostgresEngineVersion.VER_17, // Update version
}),
```

Then deploy:

```bash
just db-diff  # Review changes
just db-deploy
```

---

## Disaster Recovery

### Recovery Time Objective (RTO)

- **PITR Restore:** 20-30 minutes
- **Snapshot Restore:** 15-25 minutes
- **DNS Propagation:** 5-60 minutes
- **Total RTO:** ~1 hour

### Recovery Point Objective (RPO)

- **Automated Backups:** 5 minutes (transaction log backup)
- **Manual Snapshots:** Point of snapshot creation

### DR Runbook

1. **Identify Failure**
   - Monitor CloudWatch alarms
   - Check RDS instance status

2. **Assess Impact**
   - Determine data loss (if any)
   - Identify last known good state

3. **Initiate Recovery**
   ```bash
   # Option A: Point-in-time recovery
   just db-restore-pitr <timestamp>
   
   # Option B: Snapshot restore
   just db-restore-snapshot <snapshot-id>
   ```

4. **Update Application**
   - Update DB endpoint in secrets
   - Restart pods: `kubectl rollout restart deployment/core-api -n mosaic-prod`

5. **Verify Recovery**
   - Run health checks
   - Test critical user flows
   - Verify data integrity

6. **Post-Mortem**
   - Document incident
   - Implement preventive measures

---

## References

- [AWS RDS PostgreSQL Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [External Secrets Operator](https://external-secrets.io/)
- [Alembic Migrations](https://alembic.sqlalchemy.org/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/16/)

---

## Support

For issues or questions:
- **GitHub Issues:** https://github.com/mosaic-stories/mosaic-life/issues
- **Documentation:** `/docs` directory
- **Owners:** @hewjoe and @drunkie-tech

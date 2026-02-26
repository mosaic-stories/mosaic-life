# RDS to Aurora PostgreSQL Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from RDS PostgreSQL to Aurora PostgreSQL to enable Apache AGE extension support.

**Architecture:** Create a new Aurora PostgreSQL cluster from an RDS snapshot using CDK `DatabaseClusterFromSnapshot`. The application cutover happens by updating the `host` field in the existing Secrets Manager secret, which External Secrets reads to construct `DB_URL`. Both databases coexist during validation. RDS is decommissioned after Aurora is proven stable.

**Tech Stack:** AWS CDK (TypeScript), Aurora PostgreSQL 16.x, Helm, External Secrets Operator, AWS CLI

**Design doc:** `docs/plans/2026-02-24-aurora-migration-design.md`

---

## Important Context

### How DB_URL reaches the application (production)

1. CDK creates Secrets Manager secret `mosaic/prod/rds/credentials` with `username` and `password`
2. RDS auto-populates `host`, `port`, `dbname`, `engine` fields in the secret
3. External Secrets (`infra/helm/mosaic-life/templates/external-secrets.yaml:27`) reads ALL fields from the secret and constructs:
   ```
   postgresql+psycopg://{username}:{password}@{host}:{port}/{dbname}?sslmode=require
   ```
4. This becomes the `DB_URL` env var in the `database-credentials` K8s secret
5. Application pods read `DB_URL` from that K8s secret

### CDK Bug Warning

`SnapshotCredentials.fromSecret()` has a known bug ([aws-cdk#23815](https://github.com/aws/aws-cdk/issues/23815)) that creates a duplicate secret. **Do NOT attempt to attach the existing secret to the Aurora cluster.** Instead, the Aurora stack creates its own credentials, and we manually update the existing secret's `host` field during cutover.

### Key files

| File | Purpose |
|------|---------|
| `infra/cdk/bin/mosaic-life.ts` | CDK app entrypoint — instantiates all stacks |
| `infra/cdk/lib/database-stack.ts` | Current RDS stack (298 lines) |
| `infra/cdk/lib/aurora-database-stack.ts` | **NEW** — Aurora cluster from snapshot |
| `infra/helm/mosaic-life/templates/external-secrets.yaml` | Constructs DB_URL from secret fields |
| `infra/helm/mosaic-life/values.yaml:352-353` | Secret path reference |
| `services/core-api/app/database.py` | App DB connection (handles psycopg→asyncpg conversion) |

---

## Task 1: Create Aurora Database Stack (CDK)

**Files:**
- Create: `infra/cdk/lib/aurora-database-stack.ts`

**Step 1: Create the Aurora stack file**

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface AuroraDatabaseStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  environment: string;
  snapshotIdentifier: string;
}

/**
 * Aurora PostgreSQL Database Stack
 *
 * Restored from an RDS PostgreSQL snapshot to enable extensions
 * not available on RDS (e.g., Apache AGE for graph relationships).
 *
 * Configuration:
 * - db.t4g.medium writer (2 vCPU, 4 GB RAM) - ~$50-60/month
 * - Single writer, no readers (add readers later for HA/scaling)
 * - Aurora-managed storage (auto-scales, encrypted)
 * - 7-day automated backups
 * - PostgreSQL 16.x (Aurora compatible)
 */
export class AuroraDatabaseStack extends cdk.Stack {
  public readonly dbCluster: rds.DatabaseCluster;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: AuroraDatabaseStackProps) {
    super(scope, id, props);

    const { vpc, environment, snapshotIdentifier } = props;

    // ============================================================
    // Security Group for Aurora
    // ============================================================
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'AuroraSecurityGroup', {
      vpc,
      securityGroupName: `mosaic-${environment}-aurora-sg`,
      description: 'Security group for Aurora PostgreSQL cluster',
      allowAllOutbound: false,
    });

    const vpcCidr = vpc.vpcCidrBlock || '10.0.0.0/16';
    this.dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpcCidr),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL traffic from VPC'
    );

    // ============================================================
    // Cluster Parameter Group (Aurora PostgreSQL optimizations)
    // ============================================================
    const clusterParameterGroup = new rds.ParameterGroup(this, 'AuroraClusterParameterGroup', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      description: 'Custom cluster parameter group for Mosaic Life Aurora PostgreSQL',
      parameters: {
        // Connection settings
        'max_connections': '100',

        // Query optimization
        'random_page_cost': '1.1',
        'effective_io_concurrency': '200',

        // Logging
        'log_min_duration_statement': '1000',
        'log_connections': '1',
        'log_disconnections': '1',
        'log_lock_waits': '1',

        // Connection timeout settings
        'idle_in_transaction_session_timeout': '300000',
        'statement_timeout': '30000',
      },
    });

    // Note: shared_buffers, effective_cache_size, maintenance_work_mem, work_mem
    // are managed by Aurora automatically based on instance class. Do NOT set
    // these in the cluster parameter group — Aurora optimizes them.
    //
    // Similarly, wal_buffers and checkpoint_completion_target are Aurora-managed
    // WAL settings and should not be overridden.

    // ============================================================
    // Aurora PostgreSQL Cluster (from RDS snapshot)
    // ============================================================
    this.dbCluster = new rds.DatabaseClusterFromSnapshot(this, 'AuroraCluster', {
      snapshotIdentifier,

      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),

      // Single writer instance, no readers
      writer: rds.ClusterInstance.provisioned('writer', {
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T4G,
          ec2.InstanceSize.MEDIUM // ~$50-60/month
        ),
        publiclyAccessible: false,
        autoMinorVersionUpgrade: true,
      }),

      // Network configuration
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [this.dbSecurityGroup],

      // Port
      port: 5432,

      // Cluster parameter group
      parameterGroup: clusterParameterGroup,

      // Storage encryption (Aurora manages storage automatically)
      storageEncrypted: true,

      // Backup configuration
      backup: {
        retention: cdk.Duration.days(7),
        preferredWindow: '03:00-04:00', // UTC
      },
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00',

      // Delete protection — safe during migration
      deletionProtection: environment === 'prod',

      // RETAIN during migration so we don't accidentally lose the cluster
      removalPolicy: cdk.RemovalPolicy.RETAIN,

      // CloudWatch log exports
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,

      // Cluster identifier
      clusterIdentifier: `mosaic-${environment}-aurora`,
    });

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'AuroraClusterEndpoint', {
      value: this.dbCluster.clusterEndpoint.hostname,
      description: 'Aurora PostgreSQL writer endpoint',
      exportName: `mosaic-${environment}-aurora-endpoint`,
    });

    new cdk.CfnOutput(this, 'AuroraClusterPort', {
      value: this.dbCluster.clusterEndpoint.port.toString(),
      description: 'Aurora PostgreSQL port',
      exportName: `mosaic-${environment}-aurora-port`,
    });

    new cdk.CfnOutput(this, 'AuroraClusterIdentifier', {
      value: `mosaic-${environment}-aurora`,
      description: 'Aurora cluster identifier',
      exportName: `mosaic-${environment}-aurora-cluster-id`,
    });

    new cdk.CfnOutput(this, 'AuroraSecurityGroupId', {
      value: this.dbSecurityGroup.securityGroupId,
      description: 'Security group ID for Aurora cluster',
      exportName: `mosaic-${environment}-aurora-sg-id`,
    });

    new cdk.CfnOutput(this, 'EstimatedMonthlyCost', {
      value: 'db.t4g.medium writer: ~$50-60/month + Aurora storage: ~$3-5/month = ~$53-65/month total',
      description: 'Estimated monthly cost for Aurora configuration',
    });
  }
}
```

**Step 2: Verify the file compiles**

Run: `cd /apps/mosaic-life/infra/cdk && npx tsc --noEmit`
Expected: No errors (or only pre-existing ones)

**Step 3: Commit**

```bash
git add infra/cdk/lib/aurora-database-stack.ts
git commit -m "feat: add Aurora PostgreSQL database stack (from snapshot)"
```

---

## Task 2: Register Aurora Stack in CDK App

**Files:**
- Modify: `infra/cdk/bin/mosaic-life.ts:1-64`

**Step 1: Add the Aurora stack import and instantiation**

After the existing `DatabaseStack` instantiation (line 54), add:

```typescript
import { AuroraDatabaseStack } from '../lib/aurora-database-stack';
```

And after the `DatabaseStack` block:

```typescript
// Aurora Database Stack - restored from RDS snapshot for AGE extension support
// Pass snapshot identifier via context: cdk deploy -c snapshotId=mosaic-pre-aurora-migration
const snapshotId = app.node.tryGetContext('snapshotId');
if (snapshotId) {
  new AuroraDatabaseStack(app, 'MosaicAuroraDatabaseStack', {
    env,
    vpc: appStack.vpc,
    environment: prodEnvironment,
    snapshotIdentifier: snapshotId,
  });
}
```

The `if (snapshotId)` guard ensures:
- Normal `cdk synth` and `cdk diff` still work without a snapshot ID
- Aurora stack is only created when explicitly requested: `cdk deploy MosaicAuroraDatabaseStack -c snapshotId=<id>`

**Step 2: Verify CDK synth works without snapshot ID**

Run: `cd /apps/mosaic-life/infra/cdk && npx cdk synth --quiet`
Expected: Synthesizes successfully, no Aurora stack in output

**Step 3: Verify CDK synth works with snapshot ID**

Run: `cd /apps/mosaic-life/infra/cdk && npx cdk synth MosaicAuroraDatabaseStack -c snapshotId=test-snapshot --quiet`
Expected: Synthesizes Aurora stack with `test-snapshot` as the snapshot identifier

**Step 4: Commit**

```bash
git add infra/cdk/bin/mosaic-life.ts
git commit -m "feat: register Aurora stack in CDK app (snapshot-id gated)"
```

---

## Task 3: Take RDS Snapshot and Deploy Aurora

> **Note:** This task is executed manually against AWS, not as code changes.

**Step 1: Take RDS snapshot**

```bash
aws rds create-db-snapshot \
  --db-instance-identifier mosaic-prod-db \
  --db-snapshot-identifier mosaic-pre-aurora-migration \
  --region us-east-1
```

**Step 2: Wait for snapshot to complete**

```bash
aws rds wait db-snapshot-available \
  --db-snapshot-identifier mosaic-pre-aurora-migration \
  --region us-east-1
```

**Step 3: Preview CDK changes**

```bash
cd /apps/mosaic-life/infra/cdk
npx cdk diff MosaicAuroraDatabaseStack -c snapshotId=mosaic-pre-aurora-migration
```

Review the diff carefully. Expected: new Aurora cluster, security group, parameter group, subnet group.

**Step 4: Deploy Aurora stack**

```bash
npx cdk deploy MosaicAuroraDatabaseStack -c snapshotId=mosaic-pre-aurora-migration
```

Wait for deployment to complete (~10-15 minutes). Note the `AuroraClusterEndpoint` output value.

**Step 5: Verify Aurora cluster is healthy**

```bash
aws rds describe-db-clusters \
  --db-cluster-identifier mosaic-prod-aurora \
  --query 'DBClusters[0].Status' \
  --region us-east-1
```

Expected: `"available"`

---

## Task 4: Cutover — Update Secrets Manager and Restart Application

> **Note:** This task is executed manually. This is the ~5-10 minute downtime window.

**Step 1: Note the Aurora writer endpoint**

```bash
AURORA_ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier mosaic-prod-aurora \
  --query 'DBClusters[0].Endpoint' \
  --output text \
  --region us-east-1)
echo "Aurora endpoint: $AURORA_ENDPOINT"
```

**Step 2: Scale down the application**

```bash
kubectl scale deployment core-api --replicas=0 -n mosaic-prod
```

Wait for pods to terminate:

```bash
kubectl get pods -n mosaic-prod -l app=core-api --watch
```

**Step 3: (Optional) Take a final RDS snapshot**

If any writes occurred since Task 3, take a final snapshot. At your scale, this is likely unnecessary — but for safety:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier mosaic-prod-db \
  --db-snapshot-identifier mosaic-final-pre-aurora \
  --region us-east-1
```

If you use this snapshot, you'd need to destroy and recreate the Aurora cluster from it. Given minimal traffic, the Task 3 snapshot should suffice.

**Step 4: Read current secret value**

```bash
aws secretsmanager get-secret-value \
  --secret-id mosaic/prod/rds/credentials \
  --query 'SecretString' \
  --output text \
  --region us-east-1 | python3 -m json.tool
```

Note the current `host` value (RDS endpoint) for rollback purposes. Save it somewhere safe.

**Step 5: Update the secret's host field to Aurora endpoint**

```bash
# Get current secret JSON
CURRENT_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id mosaic/prod/rds/credentials \
  --query 'SecretString' \
  --output text \
  --region us-east-1)

# Update host field with Aurora endpoint
UPDATED_SECRET=$(echo "$CURRENT_SECRET" | python3 -c "
import sys, json
secret = json.load(sys.stdin)
secret['host'] = '$AURORA_ENDPOINT'
print(json.dumps(secret))
")

# Write updated secret
aws secretsmanager put-secret-value \
  --secret-id mosaic/prod/rds/credentials \
  --secret-string "$UPDATED_SECRET" \
  --region us-east-1
```

**Step 6: Force External Secrets refresh**

```bash
# Delete the K8s secret so ESO recreates it immediately
kubectl delete secret database-credentials -n mosaic-prod
```

External Secrets Operator will recreate the `database-credentials` secret with the updated `host` within seconds.

Verify the new DB_URL:

```bash
kubectl get secret database-credentials -n mosaic-prod -o jsonpath='{.data.DB_URL}' | base64 -d
```

Expected: URL contains the Aurora endpoint, not the RDS endpoint.

**Step 7: Scale application back up**

```bash
kubectl scale deployment core-api --replicas=2 -n mosaic-prod
```

**Step 8: Verify application health**

```bash
# Watch pods come up
kubectl get pods -n mosaic-prod -l app=core-api --watch

# Check logs for database connection
kubectl logs -n mosaic-prod -l app=core-api --tail=50

# Hit health endpoint
curl -s https://api.mosaiclife.me/health | python3 -m json.tool

# Test key user flows manually via the web app
```

---

## Task 5: Validation Period (Several Days)

> **Note:** No code changes. Monitor and observe.

**Daily checks:**

```bash
# Aurora cluster status
aws rds describe-db-clusters \
  --db-cluster-identifier mosaic-prod-aurora \
  --query 'DBClusters[0].{Status:Status,Endpoint:Endpoint}' \
  --region us-east-1

# Application pod health
kubectl get pods -n mosaic-prod -l app=core-api

# Recent errors in logs
kubectl logs -n mosaic-prod -l app=core-api --since=24h | grep -i error

# RDS instance is idle (no connections)
aws cloudwatch get-metric-data \
  --metric-data-queries '[{"Id":"conn","MetricStat":{"Metric":{"Namespace":"AWS/RDS","MetricName":"DatabaseConnections","Dimensions":[{"Name":"DBInstanceIdentifier","Value":"mosaic-prod-db"}]},"Period":3600,"Stat":"Average"}}]' \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --region us-east-1
```

**Rollback procedure** (if issues found):

```bash
# 1. Scale down
kubectl scale deployment core-api --replicas=0 -n mosaic-prod

# 2. Revert secret host to RDS endpoint
CURRENT_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id mosaic/prod/rds/credentials \
  --query 'SecretString' --output text --region us-east-1)
REVERTED=$(echo "$CURRENT_SECRET" | python3 -c "
import sys, json
secret = json.load(sys.stdin)
secret['host'] = '<SAVED_RDS_ENDPOINT>'
print(json.dumps(secret))
")
aws secretsmanager put-secret-value \
  --secret-id mosaic/prod/rds/credentials \
  --secret-string "$REVERTED" --region us-east-1

# 3. Refresh and scale up
kubectl delete secret database-credentials -n mosaic-prod
kubectl scale deployment core-api --replicas=2 -n mosaic-prod
```

---

## Task 6: Decommission RDS

> **Prerequisite:** Aurora has been running the application successfully for several days with no issues.

**Step 1: Stop the RDS instance (saves compute cost)**

```bash
aws rds stop-db-instance \
  --db-instance-identifier mosaic-prod-db \
  --region us-east-1
```

Note: AWS auto-starts stopped instances after 7 days. If you need more time, you'll need to stop it again.

**Step 2: Wait a few more days. If still stable, proceed to code cleanup.**

**Step 3: Move IRSA role and secret into Aurora stack, remove RDS stack (single commit)**

Modify `infra/cdk/lib/aurora-database-stack.ts` to add:
- The Secrets Manager secret definition (import existing via `fromSecretNameV2`)
- The IRSA role definition (copy from `database-stack.ts`)
- `grantRead` on the secret for the IRSA role

Modify `infra/cdk/bin/mosaic-life.ts` to:
- Remove the `DatabaseStack` import and instantiation
- Make Aurora stack unconditional (remove the `if (snapshotId)` guard)

Remove `infra/cdk/lib/database-stack.ts`

**Important:** Before deploying, run `cdk diff` on both stacks to verify:
- The old stack only deletes the RDS instance and its resources (subnet group, param group, SG)
- The new stack does NOT recreate the IRSA role or secret (use `cdk import` if needed)

```bash
git add -A
git commit -m "feat: decommission RDS, consolidate IRSA and secrets into Aurora stack"
```

**Step 4: Refactor DatabaseClusterFromSnapshot to DatabaseCluster**

After decommission deploy is stable, remove the snapshot dependency:
- Change `DatabaseClusterFromSnapshot` to `DatabaseCluster`
- Remove `snapshotIdentifier` prop
- Add `credentials: rds.Credentials.fromSecret(...)` if desired
- Remove the `if (snapshotId)` context guard in the app entrypoint

```bash
git commit -m "refactor: switch Aurora from snapshot-based to standalone cluster definition"
```

**Step 5: Delete the RDS instance from AWS**

```bash
# Final snapshot before deletion
aws rds delete-db-instance \
  --db-instance-identifier mosaic-prod-db \
  --final-db-snapshot-identifier mosaic-prod-db-final-snapshot \
  --region us-east-1
```

Or via CDK deploy (if the stack removal handles it).

---

## Summary of Downtime and Risk

| Phase | Downtime | Risk | Rollback |
|-------|----------|------|----------|
| Task 1-2 | None | None — code only | Revert commit |
| Task 3 | None | Low — Aurora runs alongside RDS | Delete Aurora stack |
| Task 4 | ~5-10 min | Medium — app switches to Aurora | Update secret host back to RDS |
| Task 5 | None | Low — monitoring period | Same as Task 4 rollback |
| Task 6 | None | Low — RDS already idle | Restart RDS, revert secret |

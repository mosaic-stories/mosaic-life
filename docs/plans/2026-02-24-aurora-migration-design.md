# RDS to Aurora PostgreSQL Migration Design

**Date:** 2026-02-24
**Status:** Approved
**Goal:** Migrate from RDS PostgreSQL to Aurora PostgreSQL to support Apache AGE extension for graph relationships, while retaining pgvector support.

## Context

- Current database: RDS PostgreSQL 16.x on `db.t3.micro` (~$15-19/month)
- RDS does not support the Apache AGE extension
- Aurora PostgreSQL supports both AGE and pgvector
- Early stage with few users — small database, low traffic

## Approach: Snapshot-Based Migration

Create an Aurora PostgreSQL cluster from an RDS snapshot. The cutover happens by updating the `host` field in AWS Secrets Manager (which External Secrets reads to construct DB_URL). Validate, then decommission RDS.

### Why not fresh Aurora + Alembic?

Snapshot restore guarantees exact data fidelity with less manual effort. A fresh Aurora would require pg_dump/pg_restore and is more error-prone for foreign keys, sequences, and data integrity.

## Design

### CDK Changes

**New file: `infra/cdk/lib/aurora-database-stack.ts`**

Coexists alongside `database-stack.ts` during migration. Key configuration:

- **Construct:** `DatabaseClusterFromSnapshot`
- **Engine:** Aurora PostgreSQL 16.x (matching current RDS)
- **Writer:** `ClusterInstance.provisioned('writer')` with `db.t4g.medium`
- **Readers:** None (single instance for cost optimization)
- **Snapshot:** `snapshotIdentifier` passed as a stack prop at deploy time
- **Network:** Same VPC, same private subnets, same security group rules as current RDS
- **Parameters:** Aurora `ClusterParameterGroup` with equivalent tuning (max_connections, shared_buffers, etc.)
- **Storage:** Encrypted, Aurora-managed (no explicit allocation — Aurora auto-scales)
- **Backup:** 7-day retention
- **Removal policy:** `RETAIN` during migration for safety
- **Credentials:** Reuses existing Secrets Manager secret (`mosaic/{env}/rds/credentials`) — no new credentials created
- **IAM:** Reuses existing IRSA role — secret ARN unchanged, no IAM changes needed
- **Outputs:** Aurora cluster endpoint, port, cluster identifier

**Unchanged: `database-stack.ts`** — remains fully intact during migration. Both stacks coexist.

### Cutover Mechanism — Secrets Manager Update

**Important discovery:** The production Helm chart (`infra/helm/mosaic-life/templates/external-secrets.yaml:27`) constructs DB_URL by reading `host`, `port`, `username`, `password`, and `dbname` directly from the Secrets Manager secret — there is no `dbEndpoint` Helm value override in the mosaic-life chart.

RDS automatically populates these fields in the secret when `credentials: rds.Credentials.fromSecret()` is used. The cutover is:

1. Update the `host` field in the Secrets Manager secret (`mosaic/prod/rds/credentials`) to the Aurora writer endpoint
2. Trigger an External Secrets refresh (or wait for the 1h interval)
3. Restart pods to pick up the new DB_URL

Alternatively, for Aurora's CDK construct, if we pass the same secret via `credentials: rds.Credentials.fromSecret()`, Aurora will automatically update the `host` field to its own writer endpoint. This is the cleanest approach — CDK deploy handles the secret update.

### Helm Changes

None required for the cutover itself. The External Secrets template reads from the same secret path and the DB_URL format remains identical: `postgresql+psycopg://user:pass@endpoint:5432/mosaic?sslmode=require`

### Application Changes

None. The application reads `DB_URL` from the environment and is database-engine agnostic. Aurora PostgreSQL is wire-compatible with RDS PostgreSQL.

### Cost Impact

| Resource | Current (RDS) | Aurora |
|----------|--------------|--------|
| Compute | db.t3.micro ~$13-15/mo | db.t4g.medium ~$50-60/mo |
| Storage | 20GB gp3 ~$2-4/mo | Aurora-managed ~$3-5/mo |
| **Total** | **~$15-19/mo** | **~$53-65/mo** |

During migration (both running): ~$68-84/month. After decommission: ~$53-65/month.

## Migration Phases

### Phase 1 — Prepare (no downtime)

1. Take a manual RDS snapshot: `aws rds create-db-snapshot --db-instance-identifier mosaic-prod-db --db-snapshot-identifier mosaic-pre-aurora-migration`
2. Note the snapshot identifier
3. Deploy Aurora stack via CDK with that snapshot ID
4. Aurora comes up alongside existing RDS — verify it's healthy

### Phase 2 — Cutover (~5-10 minutes downtime)

1. Scale down application: `kubectl scale deployment core-api --replicas=0 -n mosaic-prod`
2. Take a final RDS snapshot to capture any last writes
3. If delta matters, restore Aurora from this final snapshot; otherwise accept Phase 1 snapshot (traffic is negligible)
4. Update `host` field in Secrets Manager secret to Aurora writer endpoint (either manually via AWS CLI or by having Aurora CDK share the same secret)
5. Trigger External Secrets refresh and restart pods — migration job runs `alembic upgrade head` (no-op since schema came from snapshot), then app pods start with new endpoint
6. Verify application works: health checks, key user flows, log monitoring

### Phase 3 — Validation (several days)

- Run application against Aurora
- Monitor logs, error rates, query performance
- Old RDS instance remains running but idle (~$15/month)
- **Rollback plan:** Update `host` field in Secrets Manager back to the RDS endpoint, refresh External Secrets, and restart pods

### Phase 4 — Decommission

1. Stop the old RDS instance (saves compute cost, storage still billed)
2. After a few more days of stable operation, in a **single commit**:
   - Move IRSA role and Secrets Manager secret definitions into the Aurora stack
   - Remove RDS instance and associated resources (subnet group, parameter group, security group) from `database-stack.ts`
   - Remove `database-stack.ts` from the CDK app entrypoint
3. Refactor `DatabaseClusterFromSnapshot` to `DatabaseCluster` (remove snapshot reference)
4. Deploy via CDK

**Important:** Moving resources between CloudFormation stacks requires care. CFN sees it as delete + create, which can fail for resources with fixed names (like the IRSA role). Options:
- Use `cdk import` to adopt existing resources into Aurora stack before removing old stack
- Or temporarily remove fixed name constraints so CFN can create new resources, then rename

**Key principle:** Never deploy a state where the IRSA role or Secrets Manager secret doesn't exist.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss between snapshot and cutover | Writes during window are lost | Scale app to 0 replicas before taking final snapshot |
| Aurora parameter incompatibility | Some RDS params may not apply to Aurora | Validate parameter group settings against Aurora docs; Aurora manages some params differently (e.g., shared_buffers) |
| Connection string differences | App fails to connect | Aurora uses same PostgreSQL wire protocol; DB_URL format is identical |
| CDK deploy failure | Aurora not created | RDS still running, no impact; debug and retry |
| Resource deletion during stack removal | IRSA role or secret lost | Single commit for move + removal; validate with `cdk diff` before deploy |
| Aurora snapshot restore takes too long | Extended downtime | At current DB size (<1GB), restore should complete in minutes |

## Post-Migration: Enabling Apache AGE

After Aurora is stable, enable AGE as a separate task:
1. Connect to Aurora and run `CREATE EXTENSION age;`
2. Add AGE-specific Alembic migration
3. Begin implementing graph relationship models

This is intentionally out of scope for this migration plan.

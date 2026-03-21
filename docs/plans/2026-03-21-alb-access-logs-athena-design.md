# ALB Access Logs + Athena Query Tables

**Date:** 2026-03-21
**Status:** Approved

## Goal

Enable ALB access logging to S3 for the shared production/staging ALB, and create an Athena table with partition projection for querying those logs.

## Scope

- **In scope (this repo):** Helm annotation changes, CDK stack for Athena/Glue resources
- **Out of scope (infrastructure repo):** S3 bucket policy for ELB service account — required prerequisite, tracked as a final step

## Design

### 1. Helm Annotations — ALB Access Logs

Access logs are enabled via the `alb.ingress.kubernetes.io/load-balancer-attributes` annotation. Since all ingresses in an ALB group share one load balancer, the attribute applies at the ALB level and must be identical across all grouped ingresses.

**Production and staging** (`values.yaml` + `values-staging.yaml`) use the same shared ALB log configuration:

```yaml
alb.ingress.kubernetes.io/load-balancer-attributes: >-
  idle_timeout.timeout_seconds=3600,
  access_logs.s3.enabled=true,
  access_logs.s3.bucket=mosaic-life-observability,
  access_logs.s3.prefix=alb/access/shared
```

**Preview environments:** No access logs (ephemeral ALBs, not worth the complexity).

**S3 path structure** (written automatically by AWS):

```
s3://mosaic-life-observability/alb/access/shared/AWSLogs/033691785857/elasticloadbalancing/us-east-1/yyyy/MM/dd/
```

### 2. CDK Stack — Athena + Glue Resources

**New file:** `infra/cdk/lib/alb-access-logs-stack.ts`
**Stack name:** `MosaicAlbAccessLogsStack`

**Resources:**

| Resource | Name | Purpose |
|----------|------|---------|
| Glue Database | `mosaic_life_alb_logs` | Container for ALB log tables |
| Glue Table | `access_logs` | Partition-projected table over shared ALB logs |
| Athena WorkGroup | `mosaic-life-alb-logs` | Query execution context with results at `s3://mosaic-life-observability/athena/results/alb-logs/` |

**Table schema:** Standard 33-column ALB access log format using `org.apache.hadoop.hive.serde2.RegexSerDe`.

**Partition projection** on `day` column:

- `projection.day.type = "date"`
- `projection.day.range = "2026/03/01,NOW"`
- `projection.day.format = "yyyy/MM/dd"`
- `projection.day.interval = "1"`, `projection.day.interval.unit = "DAYS"`
- `storage.location.template` points to the shared S3 prefix

**Entry point:** Added to `bin/mosaic-life.ts` alongside existing stacks.

**Deployment:** `cd infra/cdk && npx cdk deploy MosaicAlbAccessLogsStack`

### 3. Prerequisite — S3 Bucket Policy (Infrastructure Repo)

ALB access logging uses the **regional ELB service account** (not cluster IAM roles). For `us-east-1`, the ELB account is `127311923021`.

The `mosaic-life-observability` bucket policy must allow:

```json
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::127311923021:root"},
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::mosaic-life-observability/alb/access/*"
}
```

This change lives in the infrastructure repo and must be applied before the ALB annotations will work.

## Files Changed

| File | Change |
|------|--------|
| `infra/helm/mosaic-life/values.yaml` | Add `load-balancer-attributes` to web and core-api ingress annotations |
| `infra/helm/mosaic-life/values-staging.yaml` | Override `load-balancer-attributes` with the shared ALB log settings for web and core-api |
| `infra/cdk/lib/alb-access-logs-stack.ts` | New CDK stack for Glue database, tables, Athena workgroup |
| `infra/cdk/bin/mosaic-life.ts` | Register new stack |

## Implementation Order

1. CDK stack (Athena/Glue resources)
2. Helm annotation changes (prod + staging values)
3. S3 bucket policy in infrastructure repo (prerequisite for logs to flow)

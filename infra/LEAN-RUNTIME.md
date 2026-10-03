# Lean Runtime (ECS on Fargate) - Operations

Production and staging run on ECS/Fargate plus a single small RDS instance (target ~$75-90/month). Prod is always on; staging scales to zero. The way back to EKS is in [EKS-RETURN.md](EKS-RETURN.md). Design rationale lives in the OpenSpec change `lean-runtime-ecs-migration` (`openspec/changes/`, or `openspec/changes/archive/` once archived).

## Architecture

```mermaid
flowchart LR
  U[Users] --> R53[Route53 mosaiclife.me]
  R53 --> ALB["ALB mosaic-lean-alb (public subnets, idle 3600s)"]
  ALB -->|"/api/*, /healthz, /readyz, sitemap, robots; api.* backend.*"| API["core-api service (Fargate, 0.5 vCPU/1 GB)"]
  ALB -->|everything else| WEB["web service (Fargate Spot, 0.25 vCPU/0.5 GB)"]
  API --> RDS[("RDS PG16 db.t4g.micro, private subnets: core, core_staging")]
  API -.-> AWS["S3, SES, Bedrock, Secrets Manager"]
  STG["staging-* services: desiredCount 0 until staging-up / deploy"] -.-> ALB
```

- One ALB and one ECS cluster (`mosaic`) serve both environments. Hosts route to the right target groups: prod `mosaiclife.me`, `frontend.`, `api.`, `backend.`; staging `stage.`, `stage-api.` (all `*.mosaiclife.me`).
- Tasks sit in public subnets with a public IP and no NAT. Security group `mosaic-{env}-tasks` admits 8080 from the ALB only. core-api tasks also carry `mosaic-db-clients`, the only source RDS (`mosaic-lean-db-sg`) accepts.
- Prod log groups `/mosaic/prod/{core-api,web,migrate}` keep 30 days, staging 7.

## Stacks, context flags, deploy order

All stacks are in `infra/cdk` (`bin/mosaic-life.ts`). Foundation (VPC, S3 endpoint, `github-actions-ecs-deploy` role) is in the `mosaic-stories/infrastructure` repo and must be deployed first.

| Order | Stack | Contents |
|---|---|---|
| 1 | `MosaicRdsStack` | Instance `mosaic-lean-db`, SGs, params `/mosaiclife/lean/rds/*`; with `dbCopy`: cluster `mosaic-db-copy`, task defs `mosaic-{prod,staging}-db-copy` |
| 2 | `MosaicEcsRuntimeStack-shared` | Cluster `mosaic`, ALB, HTTPS listener, params `/mosaiclife/lean/ecs/*` |
| 3 | `MosaicEcsRuntimeStack-prod`, `-staging` | Roles, task defs, services, listener rules, optional DNS, alarms/dashboard (alarms prod only), staging nightly stop |

| Context flag | Default | Effect |
|---|---|---|
| `leanRuntime` | `false` (`cdk.json`) | Adds the three stack groups above. |
| `manageDns` | none | Comma list (`staging`, `prod,staging`) of envs whose Route53 aliases CDK owns. |
| `dbCopy` | `false` | Aurora-to-RDS copy tooling (needs `leanRuntime`). |
| `eksRoles` | `true` | Keeps the EKS IRSA core-api roles. Set `false` only after EKS is gone. |
| `graph` | unset | `neptune` re-adds Neptune IAM and the Neptune stack import. |

Flags are not sticky. A deploy that omits one removes what it controlled (CloudFormation deletes DNS records and db-copy tooling dropped from the template). Pass the full set every manual deploy, e.g. `cd infra/cdk && npx cdk deploy MosaicEcsRuntimeStack-prod -c leanRuntime=true -c manageDns=prod,staging`.

**Merges deploy.** `.github/workflows/cdk-deploy.yml` runs `cdk deploy --all` on pushes to `main`/`develop` that touch `infra/cdk/**` (the `environment` context is unused, so every stack deploys every time). While `leanRuntime` is `false` in `cdk.json`, merges ignore the lean stacks. Once cutover step 12.5 sets `leanRuntime: true` and `manageDns: "prod,staging"` there, every such merge deploys them too. `bin/mosaic-life.ts` still instantiates `MosaicAuroraDatabaseStack`, `MosaicNeptuneDatabaseStack` and `MosaicLiteLLMSharedStack` unconditionally, so after those are destroyed (tasks 1.3, 13.1) the next `cdk deploy --all` would recreate them: remove them from `bin` first. Editing only `infra/config/runtime-env/*.yaml` does not match the path filter; run the workflow manually (`workflow_dispatch`) or deploy by hand.

## Preconditions

SSM parameters to seed (String) before the first deploy:

| Parameter | Value |
|---|---|
| `/mosaiclife/prod/image-tag`, `/mosaiclife/staging/image-tag` | An image tag already in ECR (`prod-<sha7>`, `staging-<sha7>`). The release workflow owns them afterwards. |
| `/mosaiclife/lean/alarm-email` | Alert recipient. Never commit it; confirm the SNS subscription email once. |

Published by the foundation: `/mosaiclife/network/subnets/{private/us-east-1a|b|c,public/us-east-1a|b}`. Published by the stacks: `/mosaiclife/lean/rds/{endpoint,port,clients-sg-id,db-sg-id,master-secret-arn}` and `/mosaiclife/lean/ecs/{cluster-name,alb-arn,alb-dns-name,alb-hosted-zone-id,alb-sg-id,https-listener-arn}`.

Secrets Manager (task env comes from `infra/config/runtime-env/{env}.yaml`, secrets from these, injected at task start):

| Secret | Keys |
|---|---|
| `mosaic/shared/rds-lean/master` | CDK-generated: `username` (`mosaic_admin`), `password`, `host`, `port`, ... |
| `mosaic/{prod,staging}/rds/credentials` | `host`, `port`, `username` (`mosaic_prod`/`mosaic_staging`), `password`, `dbname` (`core`/`core_staging`), and `url` = `postgresql+psycopg://USER:PASS@HOST:5432/DB?sslmode=require`. ECS reads `url`; the EKS ExternalSecret reads the other keys. |
| `mosaic/{env}/session/secret-key` | `secret-key` |
| `mosaic/{env}/internal-api/token` | `token` |
| `mosaic/{prod,staging}/google-oauth` | `client-id`, `client-secret` (staging is a copy of the prod client) |

After changing a secret, restart the service to pick it up: `aws ecs update-service --cluster mosaic --service mosaic-prod-core-api --force-new-deployment`.

## Release flow

- Repo variable `DEPLOY_TARGET` selects the target: `ecs` runs the `deploy-ecs` job in `build-push.yml`; anything else keeps the old gitops tag bump (EKS). Switch with `gh variable set DEPLOY_TARGET --body ecs`.
- `main` deploys prod, `develop` deploys staging, tag `{prod|staging}-<sha7>`. Runs only from those branches (OIDC role `github-actions-ecs-deploy`).
- `.github/scripts/ecs-deploy.sh [--dry-run] <prod|staging> <tag>`:
  1. Clones the current task definitions (`mosaic-{env}-core-api`, `-web`, `-migrate`) with the new image and registers them.
  2. Runs the `migrate` task (`alembic upgrade head`) with the core-api service's network config; a non-zero exit stops the release before any service changes.
  3. Updates core-api then web (staging also sets `desiredCount=1` and upserts the 2 h auto-stop first) and waits for stability.
  4. Writes the tag to `/mosaiclife/{env}/image-tag`.
- **Rollback:** the service circuit breaker rolls a failing rollout back to the previous revision; the script exits 1 and leaves the SSM tag untouched. Migrations are not rolled back, so keep them backward compatible.
- **Redeploy an earlier tag:** with credentials able to assume the deploy role, run `.github/scripts/ecs-deploy.sh prod prod-<sha7>`. If the database is already ahead of that image's migrations, the migrate step will fail; then point the services at the old revision directly with `aws ecs update-service --cluster mosaic --service mosaic-prod-core-api --task-definition mosaic-prod-core-api:<revision>` (same for web), and set the SSM tag yourself.

## Staging up/down

- `staging-up.yml` (manual; dispatch from `develop` or `main`): upserts auto-stop schedules `staging-autostop-{core-api,web}` (now + 2 h, self-deleting, group `mosaic-staging`), then scales both services to 1 and waits.
- `staging-down.yml`: deletes pending auto-stop schedules, scales to 0. A staging deploy via `develop` does the same as up.
- Backstop: schedules `staging-nightly-stop-{core-api,web}` stop both services at 03:00 UTC daily.
- While asleep `stage.*` returns 503 (no targets). Staging has no alarms.

## Operating

**ECS Exec** (needs the AWS `session-manager-plugin`):

```bash
TASK=$(aws ecs list-tasks --cluster mosaic --service-name mosaic-prod-core-api --query 'taskArns[0]' --output text)
aws ecs execute-command --cluster mosaic --task "$TASK" --container core-api --interactive --command /bin/sh
```

**One-off script (backfill)**: reuse the core-api task definition and the service's network config.

```bash
ENV=prod
NETCFG=$(aws ecs describe-services --cluster mosaic --services mosaic-$ENV-core-api \
  --query 'services[0].networkConfiguration' --output json)
aws ecs run-task --cluster mosaic --launch-type FARGATE --task-definition mosaic-$ENV-core-api \
  --network-configuration "$NETCFG" \
  --overrides '{"containerOverrides":[{"name":"core-api","command":["python","scripts/backfill_embeddings.py","--limit","50"]}]}'
```

Output goes to `/mosaic/$ENV/core-api` (stream `core-api/core-api/<task-id>`). The task runs once and stops.

**Logs Insights**: saved queries `mosaic-{env}/request-by-id` (replace `REQUEST_ID`; it matches `request_id` or `trace_id`, and `trace_id` is the per-request correlation field on every log line) and `mosaic-{env}/errors-last-hour`. Both query `/mosaic/{env}/core-api`. Dashboards `mosaic-prod` and `mosaic-staging` show ALB, ECS, RDS and `Mosaic/{env}` `AppErrorCount`.

**Alarms** (prod, SNS `mosaic-prod-alerts`, email on ALARM and OK; names `mosaic-prod-<name>`):

| Alarm | First move |
|---|---|
| `core-api-no-healthy-targets`, `web-no-healthy-targets` | `aws ecs describe-services` events; check stopped tasks and `/mosaic/prod/*` logs; a bad rollout rolls itself back, otherwise redeploy the previous tag |
| `alb-5xx` | ALB-generated errors: no healthy targets or overload; check the two above and ECS CPU/memory |
| `target-5xx` | `errors-last-hour`; look at the latest release and roll back if it matches |
| `slow-responses` (p95 > 3 s, 15 min) | ECS CPU/memory, RDS CPU/connections; slow Bedrock calls show in logs |
| `rds-cpu`, `rds-freeable-memory` | Look for runaway queries (`pg_stat_activity` via ECS Exec); if sustained, resize to db.t4g.small |
| `rds-free-storage` (< 2 GB) | Storage autoscaling tops out at 50 GB; find the growth or raise `maxAllocatedStorage` |
| `app-errors` (>= 20 ERROR logs / 5 min) | `errors-last-hour`, then `request-by-id` on a sample |

## Database

**Bootstrap** (once, idempotent). Per the header of `infra/scripts/rds-bootstrap.sql`, run as `mosaic_admin` against `postgres` from a host with the `mosaic-db-clients` SG:

```bash
PGSSLMODE=require PGPASSWORD="$MASTER_PASSWORD" \
psql -X -h "$DB_HOST" -U mosaic_admin -d postgres \
     -v prod_password="$PROD_PASSWORD" -v staging_password="$STAGING_PASSWORD" \
     -f rds-bootstrap.sql
```

It creates roles `mosaic_prod`/`mosaic_staging`, databases `core`/`core_staging` (each connectable only by its owner) and the `vector` extension. No such host exists by default; one way is a run-task of the db-copy task definition (it ships `psql` and has the master credentials as `DST_*`) with `command` overridden to decode the SQL from base64 and run the `psql` call above. Generate passwords with `openssl rand -hex 24`, and note they are visible in the task's overrides to anyone allowed to `ecs:DescribeTasks`.

**db-copy** (Aurora to RDS, `-c dbCopy=true`). One task definition per source env; it reads the source from `mosaic/{env}/rds/credentials`, so run it before rewriting that secret. It refuses a non-empty destination and ends by comparing per-table row counts (non-zero exit on mismatch).

```bash
ENV=staging   # or prod
SUBNETS=$(aws ssm get-parameters --names /mosaiclife/network/subnets/public/us-east-1a /mosaiclife/network/subnets/public/us-east-1b \
  --query 'Parameters[].Value' --output text | tr '\t' ',')
SG=$(aws ssm get-parameter --name /mosaiclife/lean/rds/clients-sg-id --query Parameter.Value --output text)
aws ecs run-task --cluster mosaic-db-copy --launch-type FARGATE --task-definition mosaic-$ENV-db-copy \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=ENABLED}"
```

Logs: `/mosaic/shared/db-copy`. Override only `DST_DB`/`DST_ROLE`. For the prod rehearsal add `--overrides '{"containerOverrides":[{"name":"db-copy","environment":[{"name":"DST_DB","value":"core_copytest"}]}]}'`; the script creates that database (owned by `mosaic_prod`), and you drop it afterwards.

**Point-in-time restore** (7-day window; instance is protected from deletion):

1. `aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier mosaic-lean-db --target-db-instance-identifier mosaic-lean-db-restore --restore-time <UTC ISO8601> --db-subnet-group-name <name> --vpc-security-group-ids <db-sg-id> --db-parameter-group-name <name>`. Read the three values from `aws rds describe-db-instances --db-instance-identifier mosaic-lean-db` and `/mosaiclife/lean/rds/db-sg-id`.
2. Verify the data from a task carrying `mosaic-db-clients`.
3. Either repoint `host` and `url` in `mosaic/{env}/rds/credentials` and force a new deployment (the restored instance is then outside CDK), or `pg_dump`/`pg_restore` the needed tables back into `mosaic-lean-db` (preferred; keeps CDK ownership).

## Cutover runbook (EKS to ECS)

Condensed from design.md "Migration Plan" and tasks 11-12. Order matters.

### Staging first

1. Foundation deployed (infrastructure repo); SSM params seeded.
2. `cd infra/cdk && npx cdk deploy MosaicRdsStack -c leanRuntime=true -c dbCopy=true`, then bootstrap SQL.
3. Run db-copy for `staging` **before** touching its secret. Record row counts and `vector` versions. Then rewrite `mosaic/staging/rds/credentials` (RDS host, `mosaic_staging`, `core_staging`, plus `url`) and create `mosaic/staging/google-oauth`.
4. **Scale external-dns to 0 first.** It is an ArgoCD app with `selfHeal`, so pause sync (`argocd app set external-dns --sync-policy none`) and then `kubectl -n kube-system scale deploy/external-dns --replicas=0`. Delete the `stage.*`/`stage-api.*` A/AAAA and TXT records (zone `Z039487930F6987CJO4W9`).
5. Deploy `MosaicRdsStack MosaicEcsRuntimeStack-shared MosaicEcsRuntimeStack-staging` with `-c leanRuntime=true -c dbCopy=true -c manageDns=staging`, set `DEPLOY_TARGET=ecs` when ready to use the pipeline, run the release for `develop`, then smoke test (login, CRUD, media, AI chat SSE 10 min, story evolution, embeddings search, email, HSTS on `stage-api.*`), the rollback drill (unhealthy image) and `staging-down`/`staging-up`.
6. Rehearse the prod copy into `core_copytest` to time it.

### Prod (about 30 min window; a brief 503 is accepted)

1. `kubectl scale deploy/core-api -n mosaic-prod --replicas=0`; confirm Aurora writes stopped.
2. db-copy for `prod`; verify counts; update `mosaic/prod/rds/credentials`.
3. Deploy `MosaicEcsRuntimeStack-prod` with `-c leanRuntime=true -c dbCopy=true -c manageDns=staging`. Check health through the ALB DNS name with a `Host` header.
4. Delete the prod external-dns records (apex, `frontend.`, `api.`, `backend.`, plus TXT). Redeploy with `-c manageDns=prod,staging`; confirm with `dig`.
5. Set `"leanRuntime": true` and `"manageDns": "prod,staging"` in `infra/cdk/cdk.json`, smoke test prod, set `DEPLOY_TARGET=ecs`, push a trivial commit to `main`.
6. Keep rollback ready for 48 h.

### Rollback during the soak

Both runtimes share the one RDS database, so no data is lost. Allow the EKS node SG on the RDS SG, restart ESO sync so EKS core-api reads the RDS secret, scale EKS core-api to 1, hand DNS back (deploy without `manageDns` so CDK drops its records, re-enable ArgoCD sync and scale external-dns to 1 so it recreates them against the old ALB), set ECS services to 0, and `DEPLOY_TARGET=eks`.

Decommission (final snapshots, cluster delete, NAT to 0, leftovers) is tasks 13.x in the OpenSpec change.

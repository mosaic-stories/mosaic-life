## Context

Production and staging run on EKS cluster `mosaiclife-eks` (Kubernetes 1.33, on extended support). Data lives in Aurora PostgreSQL `mosaic-prod-aurora` and Neptune `mosaic-neptune`. Platform pieces are split across three repos:

- the CDK foundation stack and `eksctl` cluster definition in `mosaic-stories/infrastructure`;
- app stacks and Helm charts in this repo (`infra/cdk`, `infra/helm`);
- environment values in `mosaic-stories/gitops`.

The ALB and Route53 records are not in IaC. They are created at runtime by aws-load-balancer-controller and external-dns (`policy: sync`).

### Audit snapshot (2026-10-03, read-only)

| Area | Finding |
|---|---|
| Cost | Sept total $771. EKS $430 ($358 of it extended support), EC2-Other/NAT $78, Neptune $70, EC2 nodes $59, Aurora $55, CloudWatch $31 (EKS control-plane logs, 102 GB stored, no retention), public IPv4 $19, ALB $16. No Savings Plans or RIs. |
| Workload | mosaic-prod runs core-api ×1 (~136 MiB), web ×1, prerender ×1 (~528 MiB). LiteLLM ×1 (~1.2 GiB) runs in `aiservices`. docs and graph-explorer are scaled to 0. |
| Traffic | ~19.4k ALB requests and 163 MB in 14 days. Bedrock spend ≈ $0. |
| Aurora | PG 16.11, db.t4g.medium single writer, 112 MB used, ~7% CPU, ~9 connections, pgvector in use (`Vector(1024)`). |
| Neptune | db.t4g.medium, 141 MB, **0 requests in 30 days**. |
| Network | VPC `vpc-0cda4cc7432deca33` (10.20.0.0/16), 3 public and 3 private subnets, 2 NAT gateways, no VPC endpoints. |
| Edge | ALB `k8s-mosaiclifemain-…`, ACM cert `2988e3f2-…` (SANs include `*.mosaiclife.me`), zone `Z039487930F6987CJO4W9`. |

### App facts that shape the design

**Runtime behaviour**
- core-api runs Alembic in `scripts/start.sh` on every start, and swallows failures with `|| echo`. The Helm chart also runs Alembic as a PreSync Job.
- Background work runs in-process: FastAPI `BackgroundTasks` and `asyncio.create_task` after streams. There is no queue or worker, so a hard kill loses in-flight work.
- SSE streams are used for AI chat and story evolution. Today's ALB idle timeout is 3600 s.

**nginx (`apps/web/nginx.conf`)**
- Hard-codes `resolver kube-dns.kube-system.svc.cluster.local`, and nginx fails to start if that name doesn't resolve.
- Proxies `/api/`, `/healthz`, `/readyz`, `/sitemap.xml` and `/robots.txt` to `http://core-api:8080`, which also must resolve at startup.
- Routes bot user agents to `${PRERENDER_HOST}`.

**Configuration**
- `DEFAULT_CHAT_MODEL_ID` and the other `*_MODEL_ID` settings default to LiteLLM alias names such as `claude-sonnet-4-6`.
- `BedrockAdapter` passes `model_id` to Bedrock verbatim.
- `TITAN_EMBED_MODEL_ID = "titan-embed-text-v2"` is an alias, not a Bedrock ID.
- `services/memory.py` calls `stream_generate(model_id="")`, expecting a provider default.
- Graph access is optional: `GRAPH_AUGMENTATION_ENABLED=false` makes the registry return `None`, and every call site checks for that.
- IRSA trust policies hard-code OIDC id `D491975E1999961E7BBAAE1A77332FBA` in 5 CDK stacks.
- SES permissions on `mosaic-prod-core-api-role` were attached by hand and are not in CDK.
- The Neptune stack exports `mosaic-neptune-data-plane-resource-arn`, which `MosaicLifeStack` and `MosaicStagingResourcesStack` import. The Neptune stack therefore can't be deleted until those imports are removed.

## Goals / Non-Goals

**Goals**
- Run prod and staging for about $75–90/month total, with prod always on (one task per service).
- Make staging a separate environment that scales to zero.
- Keep deploys simple and automated: GitHub Actions → ECR → migrate → ECS rolling deploy with automatic rollback.
- Use CloudWatch-only observability with alarms and a budget alert.
- Keep a documented, low-friction path back to EKS: same images, same env contract, Helm charts kept rendering, IAM permissions shared.
- Complete the cutover in one weekend.

**Non-Goals:** see `proposal.md`. In short: no prod scale-to-zero, no HA/autoscaling tier, no graph replacement, no CloudFront/S3 web hosting, no ARM.

## Decisions

### D1. Runtime: ECS on Fargate, tasks in public subnets, no NAT (owner-selected)

- Both services use `awsvpc` networking in the existing VPC's public subnets with `assignPublicIp: ENABLED`.
- The task security group admits port 8080 only from the ALB security group. Tasks have no other inbound path.
- Without NAT, tasks reach ECR, S3, Secrets Manager, Bedrock, SES and CloudWatch through their public IP.
- A free **S3 gateway endpoint** keeps S3 traffic on the AWS network.
- RDS sits in the private subnets. Once NAT is removed they have no internet route, which RDS doesn't need.

| Service | Size | Capacity | Est. $/month |
|---|---|---|---|
| `core-api` | 0.5 vCPU / 1 GB | FARGATE (on-demand) | ~18 |
| `web` | 0.25 vCPU / 0.5 GB, or 0.5 / 1.5 with prerender | FARGATE_SPOT | ~3–6 |

- `core-api` stays on-demand because Spot reclaims would kill SSE streams and in-process background work.
- `web` is stateless, so a few minutes of Spot replacement is acceptable (owner tolerance).
- Settings: `stopTimeout: 120`, target-group deregistration delay 120 s, deployment `minimumHealthyPercent: 100` / `maximumPercent: 200`, circuit breaker with rollback, and ECS Exec enabled for debugging and running backfill scripts.

*Alternatives considered:* single EC2 + compose (~$55–68, but adds patching and home-grown deploys and secrets); ECS on an EC2 capacity provider (cheaper Spot hosts, but ENI limits on t3 and AMI patching); a NAT instance (fck-nat) with private tasks (similar cost, one more box to run).

### D2. Apex `/api` routing: let the ALB route straight to core-api (recommended)

nginx can no longer reach core-api by a cluster DNS name.

**Option A (recommended): ALB path rules.**
- On host `mosaiclife.me`, a rule matching `/api/*`, `/healthz`, `/readyz`, `/sitemap.xml` and `/robots.txt` forwards to the core-api target group.
- `api.mosaiclife.me` and `backend.mosaiclife.me` also forward to core-api.
- Everything else goes to web.
- This matches how `api.mosaiclife.me` already reaches core-api today, with no nginx hop.
- HSTS for bypassed responses comes from the ALB listener's response-header attribute (confirmed supported and present in the synthesized listener) `routing.http.response.strict_transport_security.header_value`. If that attribute proves unusable, the fallback is a tiny core-api middleware that adds the same header. See `specs/frontend-security-headers`.
- The proxy blocks stay in nginx so the EKS layout keeps working. They are only reached when the ALB doesn't intercept the path.

**Option B: ECS Service Connect.** nginx keeps proxying to `core-api:8080` through an Envoy sidecar plus a Cloud Map namespace. This preserves today's path exactly, but adds about 100–200 MB of sidecar memory per task and another moving part.

**Option C: one task containing both nginx and core-api.** nginx reaches core-api over localhost after a port change. Simple, but it couples the scaling and deploys of web and api, and diverges from the EKS shape.

### D3. Task definitions: CI registers revisions, CDK reads the live tag from SSM (recommended)

- CDK owns everything: cluster, ALB, rules, services, roles, log groups, alarms, and the *shape* of each task definition (env, secrets, sizes).
- The container image tag comes from an SSM parameter `/mosaiclife/{env}/image-tag`, resolved at deploy time (`ssm.StringParameter.valueForStringParameter`, a CloudFormation dynamic reference). A later `cdk deploy` therefore never reverts a release.
- The release workflow, in order:
  1. Build and push.
  2. `aws ecs register-task-definition`, cloned from the current revision with only the image changed.
  3. `aws ecs run-task` with the migration command override (`alembic upgrade head`). Wait and check the exit code; stop on failure.
  4. `aws ecs update-service` for core-api, then web, and wait for stability. The circuit breaker handles rollback.
  5. Write the new tag to SSM.

**Constraint found during apply: merging a CDK change deploys it.** `.github/workflows/cdk-deploy.yml` runs `cdk deploy --all` on any push to `main` or `develop` that touches `infra/cdk/**`. The `environment` context isn't read by the CDK code, so every merge deploys every stack. Consequences:
- The new stacks (`MosaicRdsStack`, `MosaicEcsRuntimeStack-*`) are only added to the app in `bin/mosaic-life.ts` when the `leanRuntime` context is true. It defaults to `false` in `cdk.json`. During the weekend the operator deploys them manually with `-c leanRuntime=true`. A follow-up commit flips the default once they are live.
- Any CDK PR that removes permissions must merge only after the matching runtime config change. For example, the Neptune IAM removal waits for `GRAPH_AUGMENTATION_ENABLED=false`.

*Alternative:* each release runs `cdk deploy -c imageTag=…`. One tool owns everything, but it is slower (3–5 min of CloudFormation), and getting migrations to run before rollout needs either split stacks or migrate-on-start.

### D4. Bedrock model aliases: an in-repo catalog in core-api (recommended)

- Add `app/config/bedrock_models.yaml`, mapping alias → Bedrock model ID. It is seeded from the `model_list` in `infra/helm/litellm/templates/configmap.yaml`, for example `claude-sonnet-4-6 → us.anthropic.claude-sonnet-4-6` and `titan-embed-text-v2 → amazon.titan-embed-text-v2:0`.
- `BedrockAdapter` resolves the incoming `model_id` in this order:
  1. Empty → `settings.default_chat_model_id`, then resolved as an alias.
  2. A catalog alias → its mapped Bedrock ID.
  3. Anything else → passed through unchanged, so raw Bedrock IDs and inference-profile ARNs still work.
- `TITAN_EMBED_MODEL_ID` is resolved through the same catalog. Dimension stays 1024 with `normalize: true`, as today.
- No settings or env names change, so the same `*_MODEL_ID` values work in both runtimes.
- A unit test asserts that the catalog's alias set matches the LiteLLM `model_list` alias set, enforcing the sync requirement.

*Alternative:* set every `*_MODEL_ID` env var to a raw Bedrock ID in the ECS task definitions. No code change, but env values would differ between the runtimes, `memory.py`'s empty model ID would still break, and aliases would leak into infra config.

### D5. Database: RDS PostgreSQL 16, db.t4g.micro, single-AZ (owner-selected)

- 20 GB gp3, storage autoscaling up to 50 GB, encrypted, 7-day PITR, deletion protection, Performance Insights off.
- Parameter group carries over `statement_timeout=30000` and `idle_in_transaction_session_timeout=300000`.
- One instance, two databases: `core` (prod) and `core_staging`. Separate login roles, `mosaic_prod` and `mosaic_staging`, each with `CONNECT` on its own database only and `REVOKE CONNECT … FROM PUBLIC`. Staging therefore cannot touch prod data.
- The master credentials are a CDK-generated secret, `mosaic/shared/rds-lean/master` (user `mosaic_admin`). RDS is pinned to the three private subnet IDs read from the foundation's SSM parameters, so removing NAT, which re-tags those subnets as isolated, can't replace the DB subnet group.
- App credentials stay in the **existing secret names** `mosaic/{prod,staging}/rds/credentials`, updated in place with host, port, username, password, dbname and a new `url` key. ECS injects `DB_URL` from `<secret>:url::`. The EKS ExternalSecret template keeps working from the other keys, which keeps the return path open.
- Sizing headroom is ~100 max connections, more than enough for core-api's pool across 2 tasks during a deploy. If memory pressure appears, scale to db.t4g.small (~$24).

### D6. Staging scale-to-zero

- Staging services default to `desiredCount: 0`. CDK ignores `desiredCount` drift after creation.
- Push to `develop` → the release workflow deploys to staging (steps 1–5) and sets `desiredCount=1`.
- `staging-up.yml` (manual) sets `desiredCount=1` with the current task definition. `staging-down.yml` (manual) sets it to 0.
- Auto-stop: the up and deploy paths create a one-time EventBridge Scheduler schedule, `at(now + N h)`, that calls `ecs:UpdateService desiredCount=0` and deletes itself after completion. A nightly recurring schedule is the backstop.
- While asleep, the ALB returns 503 for `stage.*`, because the target group has no targets.

### D7. Prerender: keep it only if it is free to keep

- Spike: run `tvanro/prerender-alpine:7.2.0` as a sidecar in the web task on Fargate, with no `SYS_ADMIN` and Chrome `--no-sandbox` flags if the image supports them.
- If it renders correctly within +0.25 vCPU / +1 GB on Spot (~+$2/month), keep it with `PRERENDER_HOST=127.0.0.1:3000`.
- Otherwise ship web without it. nginx skips bot routing when `PRERENDER_HOST` is empty, and bots get the normal SPA.

### D8. nginx and container startup changes (both runtimes)

- `nginx.conf` template variables:
  - `NGINX_RESOLVER` (default `kube-dns.kube-system.svc.cluster.local`; ECS uses `169.254.169.253`);
  - `CORE_API_UPSTREAM` (default `core-api:8080`);
  - `PRERENDER_HOST` (empty disables bot routing).
- Upstreams are resolved per request through variables plus the resolver, so nginx starts even when an upstream name doesn't resolve.
- `scripts/start.sh`: `RUN_MIGRATIONS_ON_START` (default `true`, to keep compose and EKS behaviour; ECS sets `false`). When it runs, a migration failure now exits non-zero instead of being swallowed.

### D9. Observability: CloudWatch only

**Logs**
- `awslogs` driver to `/mosaic/{env}/core-api`, `/mosaic/{env}/web` and `/mosaic/{env}/migrate`.
- Retention 30 days for prod, 7 days for staging.
- The existing python-json-logger fields (`asctime`, `levelname`, `name`, `message`, `trace_id`, `span_id`, `service`, plus any `extra=` fields) are queryable in Logs Insights unchanged. Per-request correlation uses `trace_id`, because core-api has no HTTP request-logging middleware.
- Saved Logs Insights queries are provided for "request by id" (matching `trace_id` or a domain `request_id`) and "errors last hour".

**Metrics**
- AWS-vended only: `AWS/ApplicationELB`, `AWS/ECS` (`CPUUtilization`, `MemoryUtilization`) and `AWS/RDS`.
- One log metric filter: `Mosaic/{env}` `AppErrorCount` from `{ $.levelname = "ERROR" }` (python-json-logger field name).
- Container Insights stays off (cost). `/metrics` is not scraped.

**Alarms (prod) → SNS topic `mosaic-prod-alerts` → email**

| Alarm | Condition |
|---|---|
| core-api has no healthy targets | `HealthyHostCount < 1` for 5 min |
| web has no healthy targets | `HealthyHostCount < 1` for 5 min |
| ALB errors | `HTTPCode_ELB_5XX_Count ≥ 10` / 5 min |
| Target errors | `HTTPCode_Target_5XX_Count ≥ 10` / 5 min |
| Slow responses | `TargetResponseTime` p95 > 3 s for 15 min |
| RDS CPU | `CPUUtilization > 80%` for 15 min |
| RDS storage | `FreeStorageSpace < 2 GB` |
| RDS memory | `FreeableMemory < 100 MB` for 15 min |
| App errors | `AppErrorCount ≥ 20` / 5 min |

**Also**
- One dashboard, `mosaic-prod`.
- An AWS Budget alerting at $100/month actual and $120/month forecast spend.
- ALB access logs keep going to `s3://mosaic-life-observability/alb/access/shared`, so the existing Athena table keeps working.

**Telemetry emitted by code changes**
- On the existing `ai.bedrock.stream` and `ai.bedrock.embed` spans: new attributes `ai.model.alias` (the requested ID) and `ai.model.id` (the resolved Bedrock ID).
- Log events: `bedrock.model_resolved` (debug, fields `model_alias`, `model_id`) and `bedrock.model_passthrough` (info, field `model_id`, emitted when the ID isn't in the catalog).
- `start.sh` logs `startup.migrations_skipped` / `startup.migrations_failed`.
- `OTEL_EXPORTER_OTLP_ENDPOINT` stays unset, as today. Adding X-Ray via an ADOT sidecar is a later, optional step.

### D10. IAM: define permissions once, attach to either principal

- New construct `infra/cdk/lib/constructs/core-api-permissions.ts` produces the core-api policy statements:
  - S3 media and backups buckets;
  - Bedrock invoke and stream, and `ApplyGuardrail`;
  - **SES `SendEmail`/`SendRawEmail` on the `mosaiclife.me` identity** (this fixes the hand-attached drift);
  - read access to the env's secrets.
- The ECS task role (`ecs-tasks.amazonaws.com` trust, created by the ECS runtime stack) and the IRSA role (OIDC trust, created while the `eksRoles` context is `true`) both use this construct. `eksRoles` defaults to `true` until decommission, because CDK merges auto-deploy.
- Neptune statements are only included when `-c graph=neptune`.
- The ECS execution role pulls from ECR, reads the secrets referenced by the task definitions, and writes logs.
- A new GitHub OIDC role, `github-actions-ecs-deploy`, is defined in the infrastructure repo. It allows:
  - `ecs:RegisterTaskDefinition|DescribeTaskDefinition|RunTask|DescribeTasks|UpdateService|DescribeServices`;
  - `iam:PassRole` on the task and execution roles;
  - `ssm:PutParameter` on `/mosaiclife/*/image-tag`;
  - `scheduler:CreateSchedule` with `iam:PassRole` for the scheduler role.
- Role naming convention, used by the deploy role's `iam:PassRole` scope `role/mosaic-*-ecs-*`:

  | Role | Name |
  |---|---|
  | Task roles | `mosaic-{env}-ecs-task-{service}` |
  | Execution role | `mosaic-{env}-ecs-execution` |
  | Staging scheduler role | `mosaic-staging-ecs-scheduler` |

- Other naming:
  - the ECS cluster is `mosaic`;
  - task definition families are `mosaic-{env}-{core-api|web|migrate}`;
  - the EventBridge Scheduler group is `mosaic-staging`.

### D11. Edge and DNS move into IaC

- A new CDK-owned ALB lives in two public subnets (2 public IPv4 instead of 3), with idle timeout 3600 s, the existing ACM cert, HTTP→HTTPS redirect, and access logs.
- Route53 aliases for `mosaiclife.me`, `frontend.`, `api.`, `backend.`, `stage.` and `stage-api.` become CDK resources.
- external-dns must be scaled to 0, and its records and TXT ownership records deleted, before CDK creates them. CloudFormation cannot adopt an existing record, and with `policy: sync` external-dns would delete or revert records it believes it owns.
- The redundant second ACM certificate is not used. It is deleted in decommissioning.

### Return-to-EKS path (documented in `infra/EKS-RETURN.md`)

1. Create the cluster from `infrastructure/infra/eksctl/cluster.yaml` at a supported version.
2. Redeploy the foundation with `-c natGateways=1`.
3. Install the add-ons and ArgoCD.
4. Deploy app stacks with `-c eksRoles=true`. The OIDC id is still hard-coded in 5 app stacks today. Task 13.4 moves it to context; until then, edit it for the new cluster.
5. Set the gitops image tag to the current SSM tag. Env values come from the shared `infra/config/runtime-env/{env}.yaml` that CDK also reads.
6. Allow the EKS node security group on the RDS security group. The database stays as it is.
7. Scale ECS to 0 and remove the CDK DNS records, letting external-dns take ownership. Flip.

### Growth tiers (for reference, not built here)

| Tier | Setup | Est. $/month |
|---|---|---|
| Lean | This design | ~80 |
| Ready | core-api min 2 tasks across 2 AZs with target-tracking autoscaling, web on-demand, RDS db.t4g.small Multi-AZ, Container Insights | ~200 |
| Scale | ECS autoscaling to N tasks, RDS larger or Aurora Serverless v2, or return to EKS when multi-service or plugin needs justify it | — |

## Risks / Trade-offs

- **[Single task per service, so a crash or Spot reclaim means minutes of downtime]** → Accepted per owner tolerance. ECS replaces tasks automatically, and the unhealthy-host alarms notify.
- **[Tasks with public IPs]** → No inbound except from the ALB security group. No SSH (ECS Exec over SSM only). Images keep running as a non-root user with a read-only root filesystem, as in Helm.
- **[Direct Bedrock behaviour differs subtly from LiteLLM: streaming chunking, error shapes, guardrail application]** → The Bedrock adapter already exists and handles guardrails natively. Before cutover, staging smoke tests must cover chat SSE, story evolution SSE, an embeddings write followed by a similarity search, and a guardrail intervention.
- **[Lost in-process background work on deploy]** → `stopTimeout` and the 120 s deregistration delay let most `BackgroundTasks` finish. This matches today's behaviour on pod termination.
- **[Single-AZ RDS]** → 7-day PITR plus a final-snapshot policy. Moving to Multi-AZ is a one-flag change in the Ready tier.
- **[external-dns fights the DNS change]** → The runbook scales external-dns to 0 as the very first cutover step and verifies records before continuing.
- **[Env config drift between CDK task definitions and gitops values]** → `infra/config/runtime-env/{prod,staging}.yaml` is the single source CDK reads. The return runbook regenerates the gitops values from it.
- **[Neptune data becomes unreachable]** → A final snapshot is retained. The graph has had zero reads for 30 days, and the code tolerates its absence.
- **[ALB HSTS attribute unavailable]** → Fall back to a core-api middleware that adds the header, about 10 LOC.

## Migration Plan

**Before the weekend** (PRs merged to `develop`/`main`; no prod behaviour change)
1. App PRs (D4, D8), the CDK constructs and stacks (D1–D3, D5, D6, D9–D11), and the workflows. All of it synthesises without deploying.
2. Retire Neptune:
   - set `GRAPH_AUGMENTATION_ENABLED=false` in gitops prod and staging;
   - remove the Neptune imports;
   - snapshot Neptune, disable deletion protection, destroy the stack.
3. Disable EKS control-plane logging and set retention on its log group.

**Saturday: build and validate staging on ECS**
1. Infrastructure repo:
   - add the S3 gateway endpoint and the `github-actions-ecs-deploy` role;
   - keep NAT for now, because EKS still uses it.
2. Deploy `MosaicRdsStack`. Create the roles and databases. Copy `core_staging` from Aurora with a one-off `postgres:16` ECS task (`pg_dump -Fc | pg_restore --no-owner`), then verify row counts per table and `CREATE EXTENSION vector`.
3. Scale external-dns to 0. Deploy `MosaicEcsRuntimeStack-staging` and take over the `stage.*` records.
4. Smoke-test staging:
   - Google login;
   - legacy and story CRUD;
   - media upload and view (S3 presign);
   - AI chat SSE (a 10-minute stream);
   - story evolution SSE;
   - embedding write and search;
   - an email send;
   - deploy-rollback test with a broken image;
   - scale to zero and back.
5. Dry-run the prod copy into a scratch database to time it and validate counts.

**Sunday: prod cutover (~30-minute window)**
1. Announce. There is no maintenance page; a brief 503 is accepted.
2. `kubectl scale deploy/core-api --replicas=0 -n mosaic-prod`. This freezes writes.
3. Copy prod `core` from Aurora to RDS and verify counts. Update the `mosaic/prod/rds/credentials` secret.
4. Deploy `MosaicEcsRuntimeStack-prod`. Run the migration task (expected no-op). Services become healthy.
5. Delete the external-dns-owned prod records and TXT records. CDK creates the aliases to the new ALB (apex, frontend, api, backend).
6. Run the smoke tests from Saturday against prod and watch the alarms and dashboard.

**Rollback during the soak (until EKS is deleted)**
- Allow the EKS node security group on the RDS security group.
- Restart ESO sync so EKS core-api picks up the RDS secret.
- Scale EKS core-api to 1, flip the DNS records back to the old ALB, and set ECS to 0.
- No data is lost, because both runtimes use the same RDS database after cutover.

**Decommission (after a 48 h soak)**
- Final snapshot of Aurora, then delete it.
- `just delete-cluster`, after deleting the ingresses so the controller removes the old ALB.
- Foundation `natGateways=0`.
- Delete:
  - LiteLLM (stack and database);
  - Grafana secrets;
  - SNS/SQS;
  - the Cognito pool;
  - stale secrets;
  - the redundant ACM cert;
  - the old pre-Aurora RDS snapshots;
  - Mimir data in S3.
- Mark the gitops repo dormant.
- Update CLAUDE.md, `MVP-SIMPLIFIED-ARCHITECTURE.md`, `DEPLOYMENT.md`, and add an ADR.

## Open Questions

None. All were resolved on 2026-10-03 (see `proposal.md` → Open Questions). Applied values:
- D2, D3 and D4 approved as recommended.
- Staging auto-stop is 2 h after the last deploy or start, plus a nightly 03:00 UTC stop.
- Alarm and budget email goes to the owner's address. It is read at deploy time from SSM `/mosaiclife/lean/alarm-email` and never committed, because this repo is public.
- Budget alerts at $100 actual / $120 forecast.
- Final snapshots are kept for 90 days.
- No maintenance page during cutover.

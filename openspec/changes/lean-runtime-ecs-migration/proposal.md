## Why

Production costs about **$771/month** (Sept 2026 Cost Explorer). The workload behind it is small: one core-api pod, one web pod, ~112 MB of Postgres data, ~1.4k requests/day and ~$0 of Bedrock spend. About 82% of the bill is fixed platform overhead:

| Item | $/month |
|---|---|
| EKS 1.33 extended support (standard support ended 2026-07-28) | 358 |
| EKS control plane | 72 |
| Neptune (zero queries in the last 30 days) | 70 |
| Two NAT gateways (6 GB/month processed) | 65 |
| Two t3.medium nodes, mostly running platform pods | 72 |
| Aurora db.t4g.medium | 55 |
| EKS control-plane logs (no retention) | 30 |

At current traffic this cost isn't justified. Each day on EKS 1.33 costs another ~$12 in extended support, so the move should happen quickly: one weekend, without upgrading the cluster first.

## What Changes

- **New lean runtime.** Production and staging run as ECS services on Fargate behind a single ALB that CDK owns, with the existing ACM cert and Route53 zone.
  - Tasks run in public subnets with a public IP.
  - Their security group admits only the ALB.
  - The NAT gateways are removed.
- **Database.**
  - Aurora is replaced by RDS PostgreSQL 16 on `db.t4g.micro` (single-AZ, pgvector, 7-day point-in-time recovery).
  - Staging is a separate `core_staging` database on the same instance.
  - Data moves with `pg_dump` / `pg_restore` in a short maintenance window.
- **Neptune is retired.**
  - `GRAPH_AUGMENTATION_ENABLED=false` is set in all environments.
  - A final cluster snapshot is kept, then the cluster is deleted.
  - Graph-augmented context degrades gracefully, as it already does when the adapter is absent.
- **LiteLLM is removed from the lean runtime.**
  - core-api calls Bedrock directly (`AI_LLM_PROVIDER=bedrock`, `AI_EMBEDDING_PROVIDER=bedrock`).
  - A core-api model-alias catalog keeps today's alias names (`claude-sonnet-4-6`, `titan-embed-text-v2`, …) valid against Bedrock.
  - Embeddings stay on Titan v2 at 1024 dimensions, so stored vectors remain valid.
- **Prerender becomes optional.**
  - If the prerender image runs on Fargate without `SYS_ADMIN` and adds no meaningful cost, it runs as a sidecar of the web task.
  - Otherwise bot traffic receives the normal SPA.
- **Staging scales to zero.**
  - Staging services normally run zero tasks.
  - A workflow starts staging on demand.
  - A scheduled rule stops it again after an idle window.
- **Deploys move to GitHub Actions + ECS.**
  - CI builds the images, pushes them to ECR, runs Alembic as a one-off ECS task, then updates the services.
  - The ECS deployment circuit breaker rolls back failed deploys automatically.
  - This replaces the gitops-repo tag bump and ArgoCD sync for the lean runtime.
- **Observability uses CloudWatch.**
  - Logs go to CloudWatch with 30-day retention.
  - About 8 alarms on ALB, ECS and RDS metrics notify by SNS email.
  - One dashboard and an AWS Budget alert are added.
  - ALB access logs keep flowing to the existing S3/Athena table.
  - Prometheus scraping and the Grafana/Loki/Mimir stack are not carried over.
- **The EKS return path is preserved.**
  - The Helm charts, gitops repo, ArgoCD manifests and `eksctl/cluster.yaml` stay in the repos.
  - CI keeps rendering the Helm charts.
  - IAM permissions are defined once and shared by ECS task roles and EKS IRSA roles.
  - The NAT gateway count becomes a parameter.
- **Small app changes required by the new runtime:**
  - nginx `resolver` and upstream hosts become configurable (today they are hard-coded to kube-dns).
  - Migrations on container start can be disabled.
  - SES permissions are declared in IaC (today they are attached by hand).
- **Decommissioning:**
  - Removed: the EKS cluster, Aurora, Neptune, the old ALB and NAT gateways, LiteLLM, the in-cluster observability stack, and unused SNS/SQS, Cognito pool and stale secrets.
  - Final snapshots of Aurora and Neptune are kept.
- **BREAKING (operations only):** the production deploy mechanism changes from ArgoCD sync to a GitHub Actions ECS deploy. The `mosaic-stories/gitops` repo becomes dormant. End users see no change apart from a planned maintenance window of about 30 minutes.

## Capabilities

### New Capabilities
- `lean-runtime-operations`: observable guarantees of the lean runtime:
  - how deploys happen (migration-before-rollout, automatic rollback);
  - staging scale-to-zero and on-demand start;
  - long-lived SSE streams surviving the edge;
  - health and alarm signals;
  - data durability (point-in-time recovery);
  - the ability to redeploy the same images to EKS.

### Modified Capabilities
- `ai-model-catalog`: model aliases are resolved to Bedrock model IDs by core-api's own catalog when the LiteLLM proxy is not deployed. "Adding a model is configuration only" must still hold.
- `frontend-security-headers`: in the lean runtime, `/api/*` on the apex host is routed by the ALB straight to core-api, bypassing nginx. HSTS must still be present on those responses, so the "all responses emit HSTS" requirement is restated in terms of the edge rather than nginx.

## Non-goals

- Scale-to-zero for **production** (wake-on-request Lambda). It is deferred because the fixed floor of ALB + RDS (~$45) dominates and bot traffic would keep waking it.
- Multi-AZ RDS, multiple core-api tasks, or autoscaling policies. These belong to the documented growth tier, not this change.
- Re-platforming the graph feature, for example a self-hosted TinkerPop container.
- Moving the web app to S3 + CloudFront, or hosting the docs site (currently scaled to 0 in production).
- ARM64 / Graviton images.
- Scheduling the activity-cleanup endpoint. Nothing calls it today, and this change does not make that worse.
- Changing the infrastructure repo's GitOps for EKS platform add-ons beyond what is needed to delete the cluster.

## Open Questions

Already answered by the owner on 2026-10-03:
- Upgrade EKS first? **No.** The migration happens in one weekend.
- Runtime: **Fargate + RDS** (not a single EC2 host).
- **Drop LiteLLM** and call Bedrock directly. No models are needed that Bedrock cannot serve.
- Prerender: **nice-to-have**. Drop it if it needs extra spend or an EC2 capacity provider.
- Staging: **separate environment that scales to zero**.

Assumed (no decision needed): staging keeps its existing hostnames, `stage.mosaiclife.me` and `stage-api.mosaiclife.me`, so the Google OAuth redirect URIs do not change.

Also answered by the owner on 2026-10-03 (second round). All open questions are resolved and the change is approved for apply:
1. **Design options.** D2: the ALB routes `/api` straight to core-api. D3: CI registers task definitions and CDK reads the image tag from SSM. D4: the model-alias catalog lives in core-api. All approved.
2. **Staging auto-stop.** Stop 2 h after the last deploy or start, with a nightly 03:00 UTC backstop. Approved.
3. **Alarm and budget recipient.** `project.hewitt@gmail.com`.
4. **Budget.** $100/month actual, $120/month forecast. Approved.
5. **Snapshot retention.** Keep the final Aurora and Neptune snapshots for 90 days, then delete them.
6. **Maintenance window.** No maintenance page. A brief 503 during the ~30-minute cutover is acceptable.

## Requirement sources

- Cost and inventory audit from this session (Cost Explorer Jun–Oct 2026; EKS, RDS, Neptune, VPC and ALB inventory), summarised in `design.md`.
- `docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md` (current architecture; budget target under $350/month).
- `openspec/specs/frontend-security-headers/spec.md` and `openspec/specs/ai-model-catalog/spec.md`.

## Impact

- **IaC, this repo (`infra/cdk`):**
  - new `MosaicRdsStack` and `MosaicEcsRuntimeStack`;
  - shared IAM policy constructs;
  - `MosaicNeptuneDatabaseStack`, `MosaicLiteLLMSharedStack` and `MosaicAuroraDatabaseStack` retired after cutover;
  - the IRSA roles in `MosaicLifeStack` and `MosaicStagingResourcesStack` are gated behind an `eksRoles` context flag (default `true` until decommission).
- **IaC, infrastructure repo:**
  - the NAT gateway count is parameterised (0 for lean);
  - an S3 gateway endpoint is added;
  - a `github-actions-ecs-deploy` OIDC role is added;
  - the eksctl cluster is deleted.
- **CI:**
  - `build-push.yml` gains ECS deploy jobs;
  - new `staging-up.yml` / `staging-down.yml` workflows;
  - `cdk-deploy.yml` role scope is updated;
  - `ci.yml` adds a `helm template` check.
- **core-api:**
  - Bedrock model-alias catalog;
  - empty or unknown model ID falls back to `DEFAULT_CHAT_MODEL_ID`;
  - Titan model ID corrected;
  - `RUN_MIGRATIONS_ON_START` flag in `scripts/start.sh`.
- **web:** `nginx.conf` resolver and upstream hosts become environment-driven (`NGINX_RESOLVER`, `CORE_API_UPSTREAM`, `PRERENDER_HOST`).
- **Docs:** `CLAUDE.md` architecture section, `infra/DEPLOYMENT.md`, a new ADR, and a "return to EKS" runbook.
- **Cost:** ~$771/month → ~$75–90/month.

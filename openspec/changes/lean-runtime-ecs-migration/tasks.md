Groups 1–10 are each one PR under 400 LOC, in dependency order. Groups marked **[infra repo]** land in `mosaic-stories/infrastructure`. Groups marked **[ops]** are runbook steps rather than PRs; record what was observed in each checkbox. Every PR group can merge without changing production behaviour. Production only changes in groups 11–13.

## 1. Quick wins and Neptune retirement (PR, plus gitops commit)

- [ ] 1.1 In `mosaic-stories/gitops`, set `GRAPH_AUGMENTATION_ENABLED=false` in the prod and staging core-api env. Wait for ArgoCD sync and confirm with `kubectl exec … env` that the pods have the flag.
- [ ] 1.2 Remove the `mosaic-neptune-data-plane-resource-arn` import and the `neptune-db:*` statements from `MosaicLifeStack` and `MosaicStagingResourcesStack`. Put them behind a `-c graph=neptune` context flag for the EKS return path. `cdk diff` should show only those IAM changes.
- [ ] 1.3 **[ops]** After the 1.2 deploy:
  - take a manual Neptune cluster snapshot `mosaic-neptune-final-2026-10`;
  - disable deletion protection;
  - `cdk destroy MosaicNeptuneDatabaseStack`;
  - delete the `mosaic/{prod,staging}/neptune/connection` secrets.
- [ ] 1.4 **[ops]** Disable EKS control-plane logging (`aws eks update-cluster-config --logging …enabled=false`) and set 7-day retention on `/aws/eks/mosaiclife-eks/cluster`.
- [ ] 1.5 **[ops]** Delete `s3://mosaic-life-observability/metricsmimir/`. Create the AWS Budget ($100/month actual, $120/month forecast; email `project.hewitt@gmail.com`).
- [ ] 1.6 Gate: `cdk synth` passes. The prod site still works (log in, open a legacy, start an AI chat). The Neptune stack is gone and the snapshot exists.

## 2. Bedrock model-alias catalog in core-api (PR)

- [ ] 2.1 Add `services/core-api/app/config/bedrock_models.yaml`, seeded from `infra/helm/litellm/templates/configmap.yaml` (`claude-*`, `glm-5`, `qwen3-next-80b`, `kimi-k2.5`, mistral aliases, `llama4-maverick-17b`, `titan-embed-text-v2`, `nova-multimodal-embeddings`).
- [ ] 2.2 Add a resolver to `app/adapters/bedrock.py`:
  - empty ID → `settings.default_chat_model_id`, then resolved as an alias;
  - known alias → mapped Bedrock ID;
  - anything else → passed through unchanged.

  Use it in `stream_generate` and `embed_texts`. Add the `ai.model.alias` / `ai.model.id` span attributes and the `bedrock.model_resolved` / `bedrock.model_passthrough` log events.
- [ ] 2.3 Unit tests:
  - alias, empty and passthrough resolution;
  - embeddings call `amazon.titan-embed-text-v2:0` with `dimensions=1024`;
  - the catalog's alias set equals the LiteLLM `model_list` alias set (sync guard).
- [ ] 2.4 Gate: `just validate-backend` and `uv run pytest` pass.

## 3. Container startup and nginx portability (PR)

- [ ] 3.1 `scripts/start.sh`:
  - add `RUN_MIGRATIONS_ON_START` (default `true`);
  - when it is `true`, a migration failure exits non-zero instead of `|| echo`;
  - log `startup.migrations_skipped` and `startup.migrations_failed`.
- [ ] 3.2 `apps/web/nginx.conf`:
  - template `NGINX_RESOLVER` (default kube-dns) and `CORE_API_UPSTREAM` (default `core-api:8080`);
  - resolve upstreams through variables so nginx starts even when the upstream can't be resolved;
  - skip bot→prerender routing when `PRERENDER_HOST` is empty;
  - set the defaults in the Dockerfile `ENV` so Helm behaviour is unchanged.
- [ ] 3.3 Add `helm template` for `infra/helm/mosaic-life` with the prod and staging values to `ci.yml`.
- [ ] 3.4 Gate:
  - `just validate-backend` and `just validate-frontend` pass;
  - the compose stack comes up;
  - the web image runs with `NGINX_RESOLVER=127.0.0.11` (Docker DNS) and with `PRERENDER_HOST` unset, and serves `/` with the CSP and HSTS headers present.

## 4. Foundation changes [infra repo] (PR)

- [ ] 4.1 Make the NAT gateway count a context parameter (`natGateways`, default 2 for now). Add a free S3 gateway endpoint on the private and public route tables.
- [ ] 4.2 Add the GitHub OIDC role `github-actions-ecs-deploy` with the permissions from design D10. Fix the `cdk-deploy` role's stack allow-list (`MosaicAuroraDatabaseStack`, plus the new `MosaicRdsStack` and `MosaicEcsRuntimeStack-*`).
- [ ] 4.3 Pass the EKS OIDC issuer as context only when `runtime=eks`. Stop requiring it for synth.
- [ ] 4.4 Gate: `cdk diff` shows only the endpoint and the IAM additions, then `cdk deploy`. Confirm EKS workloads are unaffected (pods Ready, site up).

## 5. Shared IAM permissions and runtime env config (PR)

- [ ] 5.1 Add `infra/cdk/lib/constructs/core-api-permissions.ts`:
  - S3 media and backups;
  - Bedrock invoke and stream, and `ApplyGuardrail`;
  - SES send on the `mosaiclife.me` identity;
  - env secrets read;
  - optional Neptune statements.

  Refactor `MosaicLifeStack` and `MosaicStagingResourcesStack` so their IRSA roles, now created only with `-c runtime=eks`, use it.
- [ ] 5.2 Add `infra/config/runtime-env/prod.yaml` and `staging.yaml`. Each holds the non-secret core-api and web env (copied from gitops `environments/*/values.yaml`, with `AI_LLM_PROVIDER=bedrock`, `AI_EMBEDDING_PROVIDER=bedrock`, `GRAPH_AUGMENTATION_ENABLED=false`, `RUN_MIGRATIONS_ON_START=false`), plus the secret-key → env-var mapping. Add a loader for CDK.
- [ ] 5.3 Gate: `cdk synth` with `runtime=ecs` and with `runtime=eks`. The diff against prod shows no IAM change to the live IRSA roles under `runtime=eks`.

## 6. RDS stack (PR)

- [ ] 6.1 Add `MosaicRdsStack`:
  - PostgreSQL 16 on `db.t4g.micro`, private subnets;
  - 20 GB gp3 with storage autoscaling to 50 GB, encrypted;
  - 7-day backups, deletion protection, snapshot removal policy;
  - parameter group with `statement_timeout`, `idle_in_transaction_session_timeout` and `rds.force_ssl=1`;
  - RDS-managed master secret;
  - security group allowing 5432 only from the ECS task and db-copy task security groups.
- [ ] 6.2 Add `infra/scripts/rds-bootstrap.sql`:
  - `CREATE DATABASE core`, `core_staging`;
  - roles `mosaic_prod` and `mosaic_staging` with `CONNECT` only on their own database;
  - `REVOKE CONNECT … FROM PUBLIC`;
  - `CREATE EXTENSION vector` in each database.
- [ ] 6.3 Add the `db-copy` one-off task definition (`postgres:16-alpine`, a `pg_dump -Fc | pg_restore --no-owner --role=<app role>` script, row-count report per table) and its security group, with temporary ingress on Aurora's security group.
- [ ] 6.4 Gate: `cdk synth` passes. Unit-test the bootstrap SQL by running it against the compose `pgvector/pgvector:pg16` container.

## 7. ECS runtime stack: compute and edge (PR)

- [ ] 7.1 Add `MosaicEcsRuntimeStack-{env}`:
  - ECS cluster `mosaic` (shared), cluster capacity providers FARGATE and FARGATE_SPOT;
  - task and execution roles using the `core-api-permissions` construct;
  - log groups with 30-day retention for prod and 7-day for staging;
  - container image tag from SSM `/mosaiclife/{env}/image-tag`.
- [ ] 7.2 Task definitions and services, per design D1:
  - core-api: 0.5 vCPU / 1 GB on FARGATE;
  - web: FARGATE_SPOT;
  - public subnets with `assignPublicIp`, `stopTimeout: 120`, circuit breaker with rollback, ECS Exec;
  - a `migrate` task definition with command override `alembic upgrade head`;
  - staging `desiredCount: 0`, with drift ignored.
- [ ] 7.3 ALB, shared across environments, in 2 public subnets:
  - idle timeout 3600 s, existing ACM cert, HTTP→HTTPS redirect;
  - HSTS listener attribute, or the core-api middleware fallback (design D2 / risk list);
  - access logs to `s3://mosaic-life-observability/alb/access/shared`;
  - host and path rules per D2;
  - target groups with 120 s deregistration delay and `/healthz` checks.
- [ ] 7.4 Route53 alias records behind a `-c manageDns=true` flag, so they can be enabled at cutover after the external-dns records are removed.
- [ ] 7.5 Gate: `cdk synth` and `cdk diff`, reviewed. `cfn-lint` / `cdk-nag` has no high findings.

## 8. Observability construct (PR)

- [ ] 8.1 Add the SNS topic `mosaic-{env}-alerts` with an email subscription to `project.hewitt@gmail.com`, and the 9 prod alarms from design D9 (none for staging).
- [ ] 8.2 Add the `AppErrorCount` log metric filter, the `mosaic-prod` dashboard (ALB requests, 5xx, latency p95, ECS CPU and memory, RDS CPU, connections, storage, app errors), and saved Logs Insights queries ("request by id", "errors last 1h").
- [ ] 8.3 Gate: `cdk synth`. After deploying (group 11), use `aws cloudwatch set-alarm-state` on one alarm to confirm the email arrives.

## 9. Release workflow (PR)

- [ ] 9.1 Extend `.github/workflows/build-push.yml` with a `deploy-ecs` job per environment (`develop`→staging, `main`→prod) using the `github-actions-ecs-deploy` role. The job:
  1. clones the current task definitions with the new image and registers them;
  2. runs the migrate task and waits, failing the job on a non-zero exit;
  3. updates core-api then web and waits for stability;
  4. writes the SSM image tag;
  5. for staging, sets `desiredCount=1` and creates the one-time auto-stop schedule.
- [ ] 9.2 Put the existing gitops tag-bump step behind a repo variable `DEPLOY_TARGET` (`ecs` | `eks`). The default stays `eks` until cutover.
- [ ] 9.3 Gate: `actionlint` passes. Run the workflow via `workflow_dispatch` against staging once the stacks exist (group 11).

## 10. Staging on/off workflows and docs (PR)

- [ ] 10.1 Add `.github/workflows/staging-up.yml` (desiredCount 1 plus a one-time auto-stop schedule 2 h later) and `staging-down.yml` (desiredCount 0). Add the nightly 03:00 UTC backstop EventBridge Scheduler rule and its role to the staging runtime stack.
- [ ] 10.2 Write `infra/EKS-RETURN.md` (design "Return-to-EKS path") and `infra/LEAN-RUNTIME.md`:
  - architecture diagram, deploy flow, staging up/down;
  - ECS Exec usage and running backfill scripts with `aws ecs run-task`;
  - log queries, alarm runbook, cutover runbook and rollback.
- [ ] 10.3 Gate: `actionlint` passes. A docs link check passes.

## 11. [ops] Saturday: stand up and validate staging on ECS

- [ ] 11.1 Deploy the infra repo foundation (group 4), then `MosaicRdsStack`. Run `rds-bootstrap.sql`. Write the `mosaic/staging/rds/credentials` secret, including the `url` key.
- [ ] 11.2 Run `db-copy` for `core_staging` from Aurora to RDS. Record the row counts on both sides and confirm `vector` is present.
- [ ] 11.3 Scale external-dns to 0. Delete the `stage.*` and `stage-api.*` records and their external-dns TXT records. Deploy `MosaicEcsRuntimeStack-staging` with `manageDns=true`. Run the release workflow for `develop`.
- [ ] 11.4 Run the staging smoke tests and record the result of each:
  - Google login;
  - legacy and story create/edit;
  - media upload and view;
  - AI chat SSE held for 10 minutes;
  - story-evolution SSE;
  - embedding write followed by a similar-story search;
  - a guardrail intervention prompt;
  - an email send;
  - HSTS on `stage-api.*` responses.
- [ ] 11.5 Prerender spike (design D7). Run the sidecar on Fargate without `SYS_ADMIN` and decide keep or drop. Record the result and update `runtime-env` accordingly.
- [ ] 11.6 Rollback drill: deploy a deliberately unhealthy image and confirm the circuit breaker restores the prior revision. Run `staging-down`, confirm the 503, run `staging-up`, confirm it serves again.
- [ ] 11.7 Dry-run the prod copy into a scratch database `core_copytest`. Record the duration and row counts, then drop the scratch database.

## 12. [ops] Sunday: production cutover

- [ ] 12.1 Announce the window (no maintenance page; a brief 503 is accepted). Run `kubectl scale deploy/core-api -n mosaic-prod --replicas=0` and confirm no writes (Aurora `xact_commit` is flat).
- [ ] 12.2 Run `db-copy` for prod `core`, verify that the row counts match, and update `mosaic/prod/rds/credentials` to point at RDS.
- [ ] 12.3 Deploy `MosaicEcsRuntimeStack-prod` with `manageDns=false`. Run the migrate task (expect no-op) and confirm the services are healthy via the new ALB DNS name, sending a `Host` header.
- [ ] 12.4 Delete the external-dns prod records and TXT records. Redeploy with `manageDns=true` for apex, frontend, api and backend. Confirm with `dig` that they resolve to the new ALB.
- [ ] 12.5 Repeat the 11.4 smoke tests on prod. Set the repo variable `DEPLOY_TARGET=ecs`. Push a trivial commit to `main` and confirm the release workflow deploys it.
- [ ] 12.6 Keep the rollback ready for 48 h: add the EKS node security group to the RDS security group, and keep the rollback steps from design.md "Rollback during the soak" at hand.

## 13. [ops] Decommission after a 48 h soak, then finalize the docs (PR)

- [ ] 13.1 Take the final Aurora snapshot `mosaic-prod-aurora-final-2026-10`, disable deletion protection, and destroy `MosaicAuroraDatabaseStack` and `MosaicLiteLLMSharedStack`.
- [ ] 13.2 Delete the k8s ingresses (the controller removes the old ALB), then run `just delete-cluster`. Redeploy the foundation with `natGateways=0`. Confirm that no NAT gateways or extra EIPs remain.
- [ ] 13.3 Remove the leftovers: the Karpenter SQS queue and EventBridge rules, SNS/SQS events topics and queues, the Cognito pool, stale secrets, the redundant ACM cert, the pre-Aurora RDS snapshots, the `eso-validation-*` secrets, and the db-copy security group's ingress on Aurora.
- [ ] 13.4 Update `CLAUDE.md` (architecture, deploy, ops rules), `docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md` (with the cost table) and `infra/DEPLOYMENT.md`. Add an ADR for "Lean ECS runtime with EKS return path". Add a dormant notice to the README of `mosaic-stories/gitops`.
- [ ] 13.5 Add a calendar reminder or a scheduled cleanup to delete the `mosaic-neptune-final-2026-10` and `mosaic-prod-aurora-final-2026-10` snapshots 90 days after they were taken.
- [ ] 13.6 Gate: `just validate-all` and `cdk synth` (both `runtime` modes) pass.

## 14. End-to-end verification

- [ ] 14.1 In the running compose stack, with `AI_LLM_PROVIDER=bedrock`, `AI_EMBEDDING_PROVIDER=bedrock` and real Bedrock credentials, drive AI chat, story evolution and a story save that triggers embedding. Record that the aliases resolve (`bedrock.model_resolved` logs) and that the responses stream.
- [ ] 14.2 In production on ECS, drive the full user flow (login → legacy → story edit → media → AI chat). Record the observed latency and the health and alarm states, and confirm that the logs for the session's `request_id` appear in Logs Insights.
- [ ] 14.3 Seven days after cutover, pull Cost Explorer month-to-date by service. Confirm a daily run rate consistent with about $75–90/month and record the actual numbers in the ADR.

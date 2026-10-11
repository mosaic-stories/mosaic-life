# Return to EKS

How to move Mosaic Life from the lean ECS runtime ([LEAN-RUNTIME.md](LEAN-RUNTIME.md)) back to Kubernetes. The images, the env contract and the RDS database stay the same; only the compute and edge change. Plan on a few hours plus DNS propagation; there is no rehearsal environment, so read the whole thing first.

"Infrastructure repo" below means `mosaic-stories/infrastructure`.

## Steps

1. **Foundation with one NAT gateway.** In the infrastructure repo: `cd infra/cdk && npx cdk deploy -c natGateways=1` (`just deploy-foundation` does not pass context, and the default stack setting is 2). The private subnets regain an egress route; the RDS subnet group is pinned by subnet ID, so the database is unaffected. Set `eksOidcProviderArn` and `eksOidcIssuer` in `infra/cdk/cdk.context.json` to the new cluster's values after step 2, then redeploy the foundation so the Grafana and other IRSA roles trust the new cluster.
2. **Recreate the cluster.** Edit `version` in `infra/eksctl/cluster.yaml` to a currently supported Kubernetes version (it still says 1.33, which is in extended support), then `just create-cluster` and `just associate-oidc` (the repo's justfile uses cluster name `mosaiclife-eks`).
3. **Add-ons and ArgoCD.** Re-apply the Applications in `gitops/applications/` (aws-load-balancer-controller, external-secrets, external-dns, karpenter, observability, platform, ArgoCD itself), following the infrastructure repo's `docs/`. Confirm the `aws-secretsmanager` ClusterSecretStore exists.
4. **App IAM roles.** `eksRoles` defaults to `true`, so `mosaic-{prod,staging}-core-api-role` come back on the next deploy of `MosaicLifeStack` and `MosaicStagingResourcesStack` (`cd infra/cdk && npx cdk deploy MosaicLifeStack MosaicStagingResourcesStack -c leanRuntime=true -c manageDns=prod,staging`, keeping the ECS flags you currently run). **The new cluster has a new OIDC id**, and `clusterId = 'D491975E1999961E7BBAAE1A77332FBA'` is still hard-coded in `lib/mosaic-life-stack.ts` and `lib/staging-resources-stack.ts` (also in the Aurora, Neptune and LiteLLM stacks): update it before deploying. Add `-c graph=neptune` only if you also restore Neptune (below).
5. **Regenerate gitops values** from `infra/config/runtime-env/{prod,staging}.yaml` into `gitops` `environments/{env}/values.yaml`:
   - `coreApi.env` entries become `{name, value}` items in `coreApi.env`. Keep `AI_LLM_PROVIDER`, `AI_EMBEDDING_PROVIDER` and `GRAPH_AUGMENTATION_ENABLED` as in the file. Leave `RUN_MIGRATIONS_ON_START` unset (the Helm chart runs Alembic as a PreSync job; `false` is also fine).
   - **Do not copy `web.env`.** `NGINX_RESOLVER=169.254.169.253`, `CORE_API_UPSTREAM=127.0.0.1:8080` and empty `PRERENDER_HOST` are ECS-only; the Dockerfile defaults (kube-dns, `core-api:8080`) and the prerender service are right for Kubernetes.
   - `secrets:` maps to the chart's `externalSecrets.*.secretKey` values (`database` -> `mosaic/{env}/rds/credentials`, `session`, `internalApi`, `googleOAuth`). The chart builds `DB_URL` from `username/password/host/port/dbname`, which the lean secret keeps alongside `url`.
   - **LLM choice.** Default is direct Bedrock (`AI_LLM_PROVIDER=bedrock`, `AI_EMBEDDING_PROVIDER=bedrock`): the IRSA role already carries Bedrock and guardrail permissions and aliases resolve through `app/config/bedrock_models.yaml`. Going back to LiteLLM instead means redeploying `MosaicLiteLLMSharedStack` and the `aiservices` LiteLLM release (its database is gone), setting `AI_LLM_PROVIDER=litellm`, `LITELLM_BASE_URL`, and `externalSecrets.litellm.secretKey`.
   - Drop the `NEPTUNE_*` env entries and set `externalSecrets.neptune.secretKey: ""` unless Neptune is restored.
6. **Image tag.** `aws ssm get-parameter --name /mosaiclife/prod/image-tag` (and `staging`); set `global.imageTag` in the gitops values to that tag.
7. **Database access.** Allow the EKS node (or pod) security group on the RDS security group (`/mosaiclife/lean/rds/db-sg-id`, group `mosaic-lean-db-sg`) on 5432: `aws ec2 authorize-security-group-ingress --group-id <db-sg-id> --protocol tcp --port 5432 --source-group <eks-node-sg-id>`. This rule is manual (not in CDK); remove it again when leaving EKS. Keep RDS where it is.
8. **Optional: Neptune.** Only if graph features come back: restore snapshot `mosaic-neptune-final-2026-10` (kept 90 days from 2026-10-03), recreate `mosaic/{env}/neptune/connection`, use `-c graph=neptune`, and set `GRAPH_AUGMENTATION_ENABLED=true`.
9. **Sync and verify** via ArgoCD against the *new* ALB hostname before touching DNS.
10. **DNS handover.** Deploy the ECS env stacks without `manageDns` (`-c leanRuntime=true`, flag omitted or `-c manageDns=` for the envs being moved) so CDK deletes its Route53 aliases; external-dns (running again) creates records for the new ingress. Make sure ArgoCD sync is re-enabled and `external-dns` is scaled back to 1 first. Verify with `dig`. Edit `cdk.json` too if `manageDns` is set there, or the next merge puts the records back.
11. **Retire ECS.** Scale to zero: `aws ecs update-service --cluster mosaic --service mosaic-prod-core-api --desired-count 0` (and `-web`; the same for staging), then set the repo variable `DEPLOY_TARGET=eks` (`gh variable set DEPLOY_TARGET --body eks`). Remove the lean stacks (`leanRuntime: false` in `cdk.json`) only after a soak; `MosaicRdsStack` is deletion-protected and snapshots on removal.

## Keep these healthy while on ECS

- **CI `helm-template` job** (in `.github/workflows/ci.yml`) renders `infra/helm/mosaic-life` with default, staging and preview values. Keep it passing so the chart does not rot.
- **`eksRoles` construct** (`infra/cdk/lib/constructs/core-api-permissions.ts`) is shared by the ECS task role and the IRSA roles. Change permissions there once, never only on one principal. Keep `cdk synth -c eksRoles=true` working.
- **`infra/config/runtime-env/*.yaml` is the single source** of non-secret env and the secret-key map. Change env there (not by hand in task definitions) so regenerating gitops values stays correct.
- Move the hard-coded `clusterId` (step 4) into context when next touching those stacks.
- Keep the `mosaic/{env}/rds/credentials` key layout (`host`, `port`, `username`, `password`, `dbname`, `url`): the EKS ExternalSecret depends on all but `url`.
- Keep the infrastructure repo's `eksctl/cluster.yaml` and `gitops/applications/` current with its upgrade guidance, and test a Kubernetes upgrade path before you need it.

# Graph Explorer Production GitOps Design

## Goal

Deploy AWS Graph Explorer as a single ArgoCD-managed production application in the `observability` namespace, with runtime configuration coming from the GitOps repository and IAM access provided by a CDK-managed IRSA role.

## Current Problems

- The chart exists locally, but no ArgoCD Application points at it.
- The chart hard-codes a prod Neptune secret and a fixed role ARN.
- The IRSA trust is scoped to `observability/graph-explorer`, but the chart can currently deploy into any namespace.
- The current CI/CD flow updates GitOps values for existing apps, but nothing in this branch provisions Graph Explorer as a standalone deployment target.

## Chosen Approach

Use a single standalone production ArgoCD Application.

- `graph-explorer-prod` tracks the `main` branch of this repository and prod values from the GitOps repo.
- The application deploys to the `observability` namespace.
- The Helm chart keeps reusable defaults only. Production-specific items move to GitOps values.

## Data Flow

1. CDK deploy creates or updates the shared IRSA role `mosaic-shared-graph-explorer-role`.
2. GitOps values define the Neptune secret key, public endpoint, AWS region, and service-account annotation used by Graph Explorer.
3. ArgoCD renders the chart from this repo with values from the GitOps repo.
4. External Secrets reads the environment-specific Neptune connection secret from AWS Secrets Manager.
5. The `graph-explorer` service account in `observability` assumes the IRSA role and authenticates to Neptune with IAM.

## Repository Responsibilities

### Application repository

- Own the Graph Explorer chart.
- Own the ArgoCD Application manifests.
- Own the CDK IRSA role definition.
- Own validation for Helm and CDK configuration.

### GitOps repository

- Own production Graph Explorer values.
- Keep runtime settings out of the chart defaults.

## Helm Chart Design

The chart should keep only safe defaults.

- Keep the service account name as `graph-explorer`.
- Keep External Secrets enabled by default.
- Remove the hard-coded role ARN from base chart values.
- Remove the hard-coded prod secret key from base chart values.
- Allow `serviceAccount.annotations`, `neptune.secretKey`, and externally visible endpoint settings to be supplied from GitOps values.

This keeps the chart reusable while fixing the deployed namespace through the ArgoCD Application destination.

## ArgoCD Design

Add one new standalone ArgoCD Application manifest:

- `infra/argocd/applications/graph-explorer-prod.yaml`

It follows the existing multi-source pattern:

- Source 1: this repository, `infra/helm/graph-explorer`
- Source 2: `mosaic-stories/gitops`, production values

The application targets the `observability` namespace so runtime identity matches the IRSA trust policy.

## GitOps Values Design

Add a dedicated production Graph Explorer values file in the GitOps repo:

- `mosaic-life-gitops/environments/prod/graph-explorer-values.yaml`

That file provides:

- `serviceAccount.annotations.eks.amazonaws.com/role-arn`
- `env.AWS_REGION`
- `env.PUBLIC_OR_PROXY_ENDPOINT`
- `neptune.secretKey`

The Neptune secret remains `mosaic/prod/neptune/connection`.

## CI/CD Impact

The existing CDK deploy workflow already runs on pushes that touch `infra/cdk/**` on `develop` and `main`. That is sufficient for provisioning the Graph Explorer IRSA role as long as the stack change remains in `infra/cdk/lib/neptune-database-stack.ts`.

No new image build workflow is required because Graph Explorer uses a public upstream image. Deployment is driven by the ArgoCD Application plus the prod GitOps values, not an image-tag mutation step.

## Testing and Validation

- `helm lint infra/helm/graph-explorer`
- `helm template graph-explorer infra/helm/graph-explorer --namespace observability`
- `cd infra/cdk && npm run build`
- `cd infra/cdk && npx cdk synth -c environment=staging`
- Verify the rendered ServiceAccount annotation resolves from values, not chart defaults.
- Verify the ArgoCD application points to `observability`.

## Rollback

- Remove the Graph Explorer ArgoCD Application manifest.
- Remove the production Graph Explorer values file from the GitOps repo.
- Leave the CDK role in place if already deployed; it is safe but unused.

## Risks

- If the cluster does not already have an `observability` namespace or External Secrets access there, ArgoCD sync will fail until that dependency exists.
- If GitOps values drift from the role name exported by CDK, the service account will render but Neptune IAM auth will fail.
- If the Graph Explorer public endpoint is wrong for the ingress or access pattern, the UI may load with broken proxy behavior even though the pod is healthy.
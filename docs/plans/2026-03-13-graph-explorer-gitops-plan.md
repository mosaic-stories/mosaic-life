# Graph Explorer Production GitOps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy Graph Explorer as a single standalone production ArgoCD application in the `observability` namespace with prod values stored in the GitOps repository.

**Architecture:** Keep the Graph Explorer Helm chart in this repository, add a standalone production ArgoCD application that renders it, and move production runtime values into the GitOps repo. Reuse the existing CDK Neptune stack to provide the shared IRSA role trusted by `system:serviceaccount:observability:graph-explorer`.

**Tech Stack:** Helm 3, ArgoCD multi-source applications, AWS CDK v2, External Secrets, GitHub Actions, Markdown docs

---

### Task 1: Make Chart Values Environment-Neutral

**Files:**
- Modify: `infra/helm/graph-explorer/values.yaml`
- Verify: `infra/helm/graph-explorer/templates/deployment.yaml`
- Verify: `infra/helm/graph-explorer/templates/serviceaccount.yaml`
- Verify: `infra/helm/graph-explorer/templates/external-secret.yaml`

**Steps:**
1. Remove the hard-coded IRSA role ARN from the base chart values.
2. Remove the hard-coded prod Neptune secret key from the base chart values.
3. Keep only reusable defaults in the base chart, including safe non-secret defaults and the `graph-explorer` service-account name.
4. Run `helm lint infra/helm/graph-explorer`.
5. Run `helm template graph-explorer infra/helm/graph-explorer --namespace observability` and verify the templates still render cleanly.

### Task 2: Add Standalone ArgoCD Application

**Files:**
- Create: `infra/argocd/applications/graph-explorer-prod.yaml`
- Modify: `infra/argocd/README.md`
- Modify: `justfile`

**Steps:**
1. Create a prod ArgoCD Application that tracks `main`, reads prod values from the GitOps repo, and deploys to `observability`.
2. Mirror the existing multi-source pattern used by the mosaic-life applications.
3. Update repo docs and helper commands so applying ArgoCD config includes the new standalone application.

### Task 3: Add Production Graph Explorer Values To GitOps

**Files:**
- Create: `/apps/mosaic-life-gitops/environments/prod/graph-explorer-values.yaml`

**Steps:**
1. Add a production Graph Explorer values file with the shared IRSA role ARN, prod Neptune secret, region, and user-facing endpoint.
2. Keep values limited to production-specific settings so the chart remains reusable.

### Task 4: Align CDK and Docs

**Files:**
- Verify: `infra/cdk/lib/neptune-database-stack.ts`
- Modify: `docs/plans/2026-03-13-graph-explorer-integration-plan.md`
- Modify: `docs/plans/2026-03-13-graph-explorer-integration-design.md`
- Modify: `infra/argocd/README.md`

**Steps:**
1. Verify the Graph Explorer IRSA trust remains scoped to `system:serviceaccount:observability:graph-explorer`.
2. Update existing Graph Explorer planning docs so they reflect the standalone ArgoCD deployment model and GitOps-owned environment values.
3. Document that the CDK workflow is the mechanism that provisions the shared IRSA role on merges touching `infra/cdk/**`.

### Task 5: Validate End To End Configuration

**Files:**
- Verify only

**Steps:**
1. Run `helm lint infra/helm/graph-explorer`.
2. Run `helm template graph-explorer infra/helm/graph-explorer --namespace observability`.
3. Run `cd infra/cdk && npm run build`.
4. Run `cd infra/cdk && npx cdk synth -c environment=staging`.
5. Verify the rendered ServiceAccount uses the GitOps-provided IRSA role annotation.
6. Verify the ArgoCD application targets `observability` and references the Graph Explorer chart.

## Execution Status

- [x] Task 1: Make Chart Values Environment-Neutral
- [x] Task 2: Add Standalone ArgoCD Application
- [x] Task 3: Add Production Graph Explorer Values To GitOps
- [x] Task 4: Align CDK and Docs
- [x] Task 5: Validate End To End Configuration

Validation note: `helm lint infra/helm/graph-explorer -f /apps/mosaic-life-gitops/environments/prod/graph-explorer-values.yaml`, `helm template graph-explorer infra/helm/graph-explorer --namespace observability -f /apps/mosaic-life-gitops/environments/prod/graph-explorer-values.yaml`, `cd infra/cdk && npm run build`, and `cd infra/cdk && npx cdk synth -c environment=staging` all succeeded on 2026-03-13.
# Graph Explorer Integration Design

**Date:** 2026-03-13
**Status:** Approved
**Approach:** Minimal — Helm + Docker Compose + IRSA in existing Neptune CDK stack

## Overview

Integrate [AWS Graph Explorer](https://github.com/aws/graph-explorer) (v3.0.0) into the Mosaic Life platform to provide a visual interface for exploring data in the Neptune graph database. Locally it runs in the Docker Compose stack; in production it deploys to the `observability` namespace in EKS, accessed only via `kubectl port-forward`.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| IRSA | Dedicated role in `observability` namespace | Separate service account, different namespace from core-api |
| Local connection | Direct to Gremlin Server (no proxy) | Local dev doesn't need IAM/SigV4 |
| Query language | Gremlin everywhere | TinkerPop only speaks Gremlin; Neptune supports it too |
| Local port | 18080 | Follows `1xxxx` local port convention |
| Docker Compose | Profile-gated (`tools`) | Not needed for day-to-day development |
| Helm chart | Standalone under `infra/helm/graph-explorer/` | Deploys to `observability`, follows `litellm` pattern |
| CDK approach | Add IRSA role to existing `neptune-database-stack.ts` | Avoids new stack, no cross-stack deps, role is Neptune-scoped |
| Production access | `kubectl port-forward` only | No authentication built into Graph Explorer; no public exposure |

## Architecture

### Local Development

```
docker compose --profile tools up graph-explorer
  → public.ecr.aws/neptune/graph-explorer (port 18080)
  → connects directly to neptune-local:8182 (Gremlin)
  → HTTPS disabled, no proxy
  → http://localhost:18080/explorer
```

### Production (EKS)

```
observability namespace:
  graph-explorer (Deployment, 1 replica)
    → public.ecr.aws/neptune/graph-explorer:3.0.0
    → ServiceAccount: graph-explorer (IRSA → mosaic-shared-graph-explorer-role)
    → Built-in proxy handles SigV4 signing to Neptune
    → ExternalSecret pulls Neptune endpoint from mosaic/prod/neptune/connection
    → ClusterIP service (port 80), no Ingress

Access:
  kubectl port-forward svc/graph-explorer 18080:80 -n observability
  → http://localhost:18080/explorer
```

## Component Details

### 1. Docker Compose (`infra/compose/docker-compose.yml`)

Add `graph-explorer` service with `profiles: [tools]`:

- **Image:** `public.ecr.aws/neptune/graph-explorer:latest`
- **Port:** `18080:80`
- **HTTPS:** Disabled (`GRAPH_EXP_HTTPS_CONNECTION=false`, `PROXY_SERVER_HTTPS_CONNECTION=false`)
- **Connection:** Direct to `neptune-local:8182` (Docker network), no proxy
- **Query language:** Gremlin
- **Depends on:** `neptune-local` (healthy)

### 2. Helm Chart (`infra/helm/graph-explorer/`)

Standalone chart with 6 template files:

- `Chart.yaml` — metadata
- `values.yaml` — image, env vars, resources, service account config
- `templates/deployment.yaml` — single replica, env from values + external secret
- `templates/service.yaml` — ClusterIP on port 80
- `templates/serviceaccount.yaml` — IRSA annotation
- `templates/external-secret.yaml` — pulls from `mosaic/prod/neptune/connection`
- `templates/_helpers.tpl` — standard helpers

Key configuration:
- **Image:** `public.ecr.aws/neptune/graph-explorer:3.0.0` (pinned)
- **HTTPS:** Disabled (internal cluster traffic only)
- **IAM:** Enabled, proxy server handles SigV4
- **Service type:** ClusterIP, no Ingress
- **Resources:** 100m/256Mi requests, 500m/512Mi limits
- **IRSA role:** `mosaic-shared-graph-explorer-role`

### 3. CDK — IRSA Role (`infra/cdk/lib/neptune-database-stack.ts`)

Add after the per-environment loop (not inside it — this is a shared role):

- **Role name:** `mosaic-shared-graph-explorer-role`
- **Trust:** `system:serviceaccount:observability:graph-explorer`
- **Policy:** `neptune-db:connect` on the shared cluster
- **Output:** `mosaic-shared-graph-explorer-role-arn`

### 4. ArgoCD (GitOps repo)

Add Application resource for `graph-explorer`:
- **Source:** `infra/helm/graph-explorer/`
- **Destination namespace:** `observability`
- **Sync:** Automatic
- **Branch:** `main` only

### 5. CI/CD

No new GitHub Actions workflows. Existing `cdk-deploy.yml` triggers on `infra/cdk/**` changes.

## Files Changed

| Component | Files | Action |
|-----------|-------|--------|
| Docker Compose | `infra/compose/docker-compose.yml` | Modify — add service |
| Helm Chart | `infra/helm/graph-explorer/` (6 files) | Create |
| CDK | `infra/cdk/lib/neptune-database-stack.ts` | Modify — add IRSA role |
| ArgoCD | GitOps repo (external) | Add Application |
| Docs | `CLAUDE.md` | Update — add port 18080 |

## What's NOT Included

- No new GitHub Actions workflows
- No new CDK stacks
- No custom Docker image builds
- No Ingress/ALB/public exposure
- No NetworkPolicy (can add later)
- No staging instance (shared observability tool)

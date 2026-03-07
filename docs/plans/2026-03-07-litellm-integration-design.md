# LiteLLM Integration Design

**Date:** 2026-03-07
**Status:** Approved
**Approach:** Custom Helm chart (Approach A)

## Overview

Deploy LiteLLM as a centralized AI model proxy within the EKS cluster. It provides a unified OpenAI-compatible API for accessing multiple model providers, with built-in spend tracking, virtual key management, and budget controls. This abstraction allows seamless model swapping without application code changes.

## Architecture

```
                         EKS Cluster
  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐
  │ mosaic-prod  │  │mosaic-staging│  │     aiservices         │
  │              │  │              │  │                        │
  │  core-api ───┼──┼──────────────┼──┼──► litellm (4000)     │
  │              │  │  core-api ───┼──┼──►   │                │
  │              │  │              │  │      │ IRSA            │
  └──────────────┘  └──────────────┘  │      ▼                │
                                      │   AWS Bedrock          │
                                      │   (all models)         │
                                      └────────────────────────┘

  ┌──────────────────────────────────────┐
  │         Aurora PostgreSQL            │
  │  ┌──────────┐  ┌──────────────────┐  │
  │  │  mosaic  │  │     litellm      │  │
  │  │ (app db) │  │ (litellm proxy)  │  │
  │  └──────────┘  └──────────────────┘  │
  └──────────────────────────────────────┘
```

### Key Decisions

1. **Single deployment in `aiservices` namespace** — shared by both prod and staging namespaces. Stage traffic is low; virtual keys/tags differentiate usage in reporting.
2. **Separate database on shared Aurora instance** — dedicated `litellm` database with its own user. LiteLLM manages its own schema/migrations internally.
3. **Dedicated IRSA role** (`mosaic-shared-litellm-role`) — Bedrock invoke + guardrails + Secrets Manager, scoped tightly. Separate from core-api role.
4. **Credentials in AWS Secrets Manager** — master key, salt key, and DB credentials in `mosaic/shared/litellm/credentials`, pulled via ExternalSecret using the existing ClusterSecretStore.
5. **No Redis** — single instance with in-memory rate tracking. Redis added later only if scaling to multiple replicas.
6. **No ingress** — ClusterIP only, internal to the cluster. Access UI/API locally via `kubectl port-forward`.
7. **Custom Helm chart** — full control, consistent with existing patterns, no dependency on upstream beta chart.
8. **Docker image:** `ghcr.io/berriai/litellm-database:main-v<pinned>` (database-enabled, non-root variant, pinned version).

## Helm Chart Structure

```
infra/helm/litellm/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── _helpers.tpl
    ├── serviceaccount.yaml
    ├── external-secret.yaml
    ├── configmap.yaml
    ├── deployment.yaml
    ├── service.yaml
    └── networkpolicy.yaml
```

### Kubernetes Resources

| Resource | Name | Purpose |
|----------|------|---------|
| ServiceAccount | `litellm` | IRSA-annotated for Bedrock + Secrets Manager |
| ExternalSecret | `litellm-credentials` | Pulls credentials from `mosaic/shared/litellm/credentials` |
| ConfigMap | `litellm-config` | LiteLLM `config.yaml` with model definitions |
| Deployment | `litellm` | Single replica, non-root, health probes |
| Service | `litellm` | ClusterIP on port 4000 |
| NetworkPolicy | `litellm` | Restrict ingress/egress |

No HPA or PDB for initial deployment. Added later if scaling is needed.

### Security Context

Follows existing project patterns:

- `runAsNonRoot: true`
- `readOnlyRootFilesystem: true`
- `allowPrivilegeEscalation: false`
- `capabilities.drop: [ALL]`
- `seccompProfile.type: RuntimeDefault`

### Resource Sizing

| | CPU | Memory |
|---|-----|--------|
| Requests | 250m | 512Mi |
| Limits | 1 | 1Gi |

## AWS Secrets Manager

**Secret path:** `mosaic/shared/litellm/credentials`

```json
{
  "master_key": "sk-litellm-...",
  "salt_key": "sk-salt-...",
  "db_username": "litellm",
  "db_password": "<generated>",
  "db_host": "<aurora-cluster-endpoint>",
  "db_port": "5432",
  "db_name": "litellm"
}
```

The ExternalSecret template derives:

- `LITELLM_MASTER_KEY` from `master_key`
- `LITELLM_SALT_KEY` from `salt_key`
- `DATABASE_URL` as `postgresql://{{ .db_username }}:{{ .db_password }}@{{ .db_host }}:{{ .db_port }}/{{ .db_name }}?sslmode=require`

Uses the existing `aws-secretsmanager` ClusterSecretStore (IRSA-authenticated).

## IRSA Role & IAM Policy

**Role name:** `mosaic-shared-litellm-role`

**Trust policy:** EKS OIDC provider, scoped to ServiceAccount `litellm` in namespace `aiservices`.

**Permissions:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvoke",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:us-east-1::foundation-model/*"
    },
    {
      "Sid": "BedrockGuardrails",
      "Effect": "Allow",
      "Action": [
        "bedrock:ApplyGuardrail",
        "bedrock:GetGuardrail"
      ],
      "Resource": "arn:aws:bedrock:us-east-1:033691785857:guardrail/*"
    },
    {
      "Sid": "SecretsManagerRead",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:033691785857:secret:mosaic/shared/litellm/*"
    }
  ]
}
```

Bedrock uses wildcard on foundation models to avoid policy updates when adding new models. Guardrails scoped to account resources. Secrets Manager scoped to `mosaic/shared/litellm/` path.

## LiteLLM Configuration (config.yaml)

```yaml
model_list:
  # Anthropic Claude models via Bedrock
  - model_name: claude-sonnet-4-6
    litellm_params:
      model: bedrock/anthropic.claude-sonnet-4-6-20250514
  - model_name: claude-opus-4-6
    litellm_params:
      model: bedrock/anthropic.claude-opus-4-6-20250514
  - model_name: claude-haiku-4-5
    litellm_params:
      model: bedrock/anthropic.claude-haiku-4-5-20251001

  # Qwen via Bedrock
  - model_name: qwen3-next-80b
    litellm_params:
      model: bedrock/qwen.qwen3-next-80b-a3b-v1:0

  # Kimi via Bedrock
  - model_name: kimi-k2.5
    litellm_params:
      model: bedrock/moonshotai.kimi-k2-5-v1:0

  # Mistral models via Bedrock
  - model_name: voxtral-small-24b
    litellm_params:
      model: bedrock/mistral.voxtral-small-24b-2507-v1:0
  - model_name: voxtral-mini-3b
    litellm_params:
      model: bedrock/mistral.voxtral-mini-3b-2507-v1:0
  - model_name: magistral-small
    litellm_params:
      model: bedrock/mistral.magistral-small-2509-v1:0
  - model_name: mistral-large-3
    litellm_params:
      model: bedrock/mistral.mistral-large-2-v1:0

  # Amazon models via Bedrock
  - model_name: nova-multimodal-embeddings
    litellm_params:
      model: bedrock/amazon.nova-multimodal-embeddings-v1:0

  # Whisper via Bedrock
  - model_name: whisper-large-v3-turbo
    litellm_params:
      model: bedrock/openai.whisper-large-v3-turbo-v2:0

  # Meta Llama via Bedrock
  - model_name: llama4-maverick-17b
    litellm_params:
      model: bedrock/meta.llama4-maverick-17b-instruct-v1:0

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL
  store_model_in_db: false
  disable_spend_logs: false
  proxy_batch_write_at: 10

litellm_settings:
  drop_params: true
  request_timeout: 600
  num_retries: 2
```

Bedrock authentication handled by IRSA — no explicit AWS credentials in config. Model IDs to be validated against Bedrock availability during implementation.

## NetworkPolicy

```yaml
# Ingress: allow from mosaic-prod and mosaic-staging only
ingress:
  - from:
      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: mosaic-prod
      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: mosaic-staging
    ports:
      - protocol: TCP
        port: 4000

# Egress: DNS, AWS APIs, Aurora PostgreSQL
egress:
  - to:
      - namespaceSelector: {}
    ports:
      - protocol: TCP
        port: 53
      - protocol: UDP
        port: 53
  - to:
      - ipBlock:
          cidr: 0.0.0.0/0
    ports:
      - protocol: TCP
        port: 443
  - to:
      - ipBlock:
          cidr: 10.20.0.0/16
    ports:
      - protocol: TCP
        port: 5432
```

Uses `kubernetes.io/metadata.name` label (auto-applied by Kubernetes 1.21+).

## ArgoCD Application

New ArgoCD Application at `infra/argocd/applications/litellm.yaml`:

- Source: `infra/helm/litellm` from mosaic-life repo
- Destination namespace: `aiservices`
- Sync policy: automated, prune, self-heal, createNamespace
- Single-source (no gitops values repo needed — one shared instance)

## Core-API Connectivity Update

Update `LITELLM_BASE_URL` in core-api values from `http://litellm:4000` to `http://litellm.aiservices.svc.cluster.local:4000` for cross-namespace resolution. Applies to umbrella chart values and staging/preview overrides.

## Local Development (Docker Compose)

Add `litellm` service to `infra/compose/docker-compose.yml`:

- Image: `ghcr.io/berriai/litellm-database:main-v<pinned>`
- Port: `14000:4000`
- Environment: local dev master key, salt key, and DATABASE_URL pointing to local postgres
- Config: `infra/compose/litellm-config.yaml` mounted as `/app/config.yaml`
- Depends on: postgres (healthy)
- Postgres init script creates the `litellm` database alongside `mosaic`

Update core-api `.env` with `LITELLM_BASE_URL=http://litellm:4000`.

## Pre-requisites (One-Time Setup)

1. **Aurora:** Create `litellm` database and user with `CREATE DATABASE litellm; CREATE USER litellm WITH PASSWORD '...'; GRANT ALL ON DATABASE litellm TO litellm;`
2. **AWS Secrets Manager:** Create `mosaic/shared/litellm/credentials` with master key, salt key, and DB credentials
3. **IAM:** Create `mosaic-shared-litellm-role` with Bedrock + Secrets Manager policies and IRSA trust for `aiservices/litellm` ServiceAccount

## Future Considerations (Not Built Now)

### User-Provided API Keys (Pass-Through)
LiteLLM supports per-request API keys via the `api_key` header. Users provide their own provider keys; LiteLLM proxies and tracks usage without cost to us. Works out of the box with virtual keys.

### Virtual Keys with Tags for Usage Reporting
LiteLLM's `/key/generate` API creates temporary keys with metadata tags (e.g., `user_id`, `environment`, `team`). Spend tracked per key in the `litellm` database. Core-api calls `/key/generate` when issuing keys to users.

### Bedrock Guardrails
Add `guardrails:` section to `config.yaml` once guardrail IDs are provisioned. IRSA role already includes `bedrock:ApplyGuardrail`. LiteLLM tracks guardrail usage metrics per policy type.

### Additional Model Providers (OpenRouter, Anthropic, Google, OpenAI, etc.)
Additional providers are new entries in `model_list`. API keys for non-IRSA providers stored in AWS Secrets Manager (e.g., `mosaic/shared/litellm/provider-keys`), injected as environment variables via a second ExternalSecret. LiteLLM config references them as `os.environ/OPENAI_API_KEY`, `os.environ/ANTHROPIC_API_KEY`, etc. No IRSA or NetworkPolicy changes needed — external providers use HTTPS (443) which is already allowed.

### Scaling to Multiple Replicas
Add Redis (ElastiCache), increase `replicaCount`, add HPA and PDB. Single-instance design is additive — no rearchitecting needed.

### Core-API Migration from Direct Bedrock to LiteLLM
The existing `AIAdapter`/`LLMProvider` abstraction anticipates this. A `LiteLLMProvider` adapter calls LiteLLM's OpenAI-compatible endpoint instead of Bedrock directly. Not part of this deployment work.

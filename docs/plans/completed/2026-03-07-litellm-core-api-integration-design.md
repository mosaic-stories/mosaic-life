# LiteLLM Core-API Integration Design

**Date:** 2026-03-07
**Status:** Approved
**Approach:** Clean Swap (Approach 1)
**Depends on:** [LiteLLM Integration Design](2026-03-07-litellm-integration-design.md) (completed)

## Overview

Swap all direct AWS Bedrock calls in core-api to route through the already-deployed LiteLLM proxy. This provides centralized cost/usage tracking, budget controls, and model-agnostic aliases that decouple application code from specific provider model IDs.

## Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Route all calls through LiteLLM (chat + embeddings) | Full abstraction, unified cost tracking |
| Model IDs | Use LiteLLM alias names (e.g., `claude-sonnet-4-6`) | Decouples core-api from Bedrock IDs; model swaps become config-only |
| Model versions | Upgrade from Claude 4.5 to 4.6 | Already configured in LiteLLM; no 4.5 backward compat needed |
| Auth to LiteLLM | Separate virtual key for core-api | Clean separation of duties; enables per-service budget tracking |
| Adapter strategy | New `LiteLLMAdapter` class | Purpose-built for LiteLLM-specific features; keeps Bedrock/OpenAI as fallbacks |
| Guardrails | Wire plumbing, enable as follow-up | Guardrails may already be active; validate and re-enable after core integration |
| Migration strategy | Single cohesive change, old adapters retained | Early-stage project; clean cut with safety net |

## Model Mapping

### Models Used by Core-API

| LiteLLM Alias | Underlying Bedrock Model | Use Cases | Configured In |
|---------------|-------------------------|-----------|---------------|
| `claude-sonnet-4-6` | `bedrock/us.anthropic.claude-sonnet-4-6` | All 4 personas (biographer, friend, colleague, family), story evolution, rewriting, context extraction, memory summarization | `personas.yaml`, `settings.py` (`EVOLUTION_SUMMARIZATION_MODEL_ID`) |
| `claude-haiku-4-5` | `bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0` | Intent analysis, change summaries, entity extraction | `settings.py` (`CHANGE_SUMMARY_MODEL_ID`, `INTENT_ANALYSIS_MODEL_ID`, `ENTITY_EXTRACTION_MODEL_ID`) |
| `titan-embed-text-v2` | `bedrock/amazon.titan-embed-text-v2:0` | Vector embeddings for RAG retrieval | `bedrock.py` constant, `ai.py` protocol default |

### LiteLLM Configmap Additions

Add to `infra/helm/litellm/templates/configmap.yaml`:

```yaml
- model_name: titan-embed-text-v2
  litellm_params:
    model: bedrock/amazon.titan-embed-text-v2:0
```

## LiteLLMAdapter Design

### New File: `services/core-api/app/adapters/litellm.py`

Implements both `LLMProvider` and `EmbeddingProvider` protocols.

**HTTP client:** `httpx.AsyncClient` calling LiteLLM's OpenAI-compatible API.

**Endpoints used:**
- `POST /v1/chat/completions` (streaming) for `stream_generate()`
- `POST /v1/embeddings` for `embed_texts()`

**Authentication:** `Authorization: Bearer <LITELLM_API_KEY>` header (virtual key).

**Streaming:** Parses SSE `data: {...}` lines from streaming chat completions response, yields text deltas from `choices[0].delta.content`.

**Error mapping:**

| HTTP Status | AIProviderError Code | Retryable |
|-------------|---------------------|-----------|
| 429 | `rate_limit` | Yes |
| 503 | `provider_unavailable` | Yes |
| 401/403 | `auth_error` | No |
| 400 | `invalid_request` | No |
| Other | `unknown` | No |

**Observability:** Same OTel spans and Prometheus metrics as BedrockAdapter, with `provider="litellm"`.

**Singleton:** `get_litellm_adapter(base_url, api_key)` pattern matching existing adapters.

### Guardrail Support

The `stream_generate()` method accepts `guardrail_id` and `guardrail_version` parameters. When provided, they are passed via LiteLLM request metadata to trigger Bedrock guardrails on the LiteLLM side. This requires guardrails to be configured in the LiteLLM config:

```yaml
litellm_settings:
  guardrails:
    - guardrail_name: "bedrock-content-guard"
      litellm_params:
        guardrail: bedrock
        guardrailIdentifier: os.environ/BEDROCK_GUARDRAIL_ID
        guardrailVersion: os.environ/BEDROCK_GUARDRAIL_VERSION
```

**Follow-up required:** Validate whether Bedrock guardrails are currently active in production. If so, configure the LiteLLM guardrail config and verify end-to-end before considering integration complete.

## Configuration Changes

### New Settings (`settings.py`)

```python
# LiteLLM provider configuration
litellm_base_url: str = os.getenv("LITELLM_BASE_URL", "http://localhost:14000")
litellm_api_key: str | None = os.getenv("LITELLM_API_KEY")
```

### Updated Defaults (`settings.py`)

```python
# Provider selection — default changes from "bedrock" to "litellm"
ai_llm_provider: str = os.getenv("AI_LLM_PROVIDER", "litellm").lower()
ai_embedding_provider: str = os.getenv("AI_EMBEDDING_PROVIDER", "litellm").lower()

# Model IDs — change from Bedrock IDs to LiteLLM aliases
evolution_summarization_model_id: str = os.getenv(
    "EVOLUTION_SUMMARIZATION_MODEL_ID", "claude-sonnet-4-6"
)
change_summary_model_id: str = os.getenv(
    "CHANGE_SUMMARY_MODEL_ID", "claude-haiku-4-5"
)
intent_analysis_model_id: str = os.getenv(
    "INTENT_ANALYSIS_MODEL_ID", "claude-haiku-4-5"
)
entity_extraction_model_id: str = os.getenv(
    "ENTITY_EXTRACTION_MODEL_ID", "claude-haiku-4-5"
)
```

### Updated Personas (`personas.yaml`)

All 4 personas change `model_id` from `us.anthropic.claude-sonnet-4-5-20250929-v1:0` to `claude-sonnet-4-6`.

### Updated Protocol Default (`ai.py`)

`EmbeddingProvider.embed_texts()` default `model_id` changes from `amazon.titan-embed-text-v2:0` to `titan-embed-text-v2`.

### Updated Constant (`bedrock.py`)

`TITAN_EMBED_MODEL_ID` changes from `amazon.titan-embed-text-v2:0` to `titan-embed-text-v2` (for backward compat if Bedrock adapter is used directly).

## Provider Registry Changes

Add `"litellm"` branch in both `get_llm_provider()` and `get_embedding_provider()`:

```python
if provider == "litellm":
    return get_litellm_adapter(
        base_url=self._settings.litellm_base_url,
        api_key=self._settings.litellm_api_key or "",
    )
```

Update `_settings_signature()` to include `litellm_base_url` and `litellm_api_key`.

## Infrastructure Changes

### Core-API Helm Values (`infra/helm/core-api/values.yaml`)

```yaml
env:
  AI_LLM_PROVIDER: "litellm"
  AI_EMBEDDING_PROVIDER: "litellm"
  LITELLM_BASE_URL: "http://litellm.aiservices.svc.cluster.local:4000"
  EVOLUTION_SUMMARIZATION_MODEL_ID: "claude-sonnet-4-6"
  CHANGE_SUMMARY_MODEL_ID: "claude-haiku-4-5"
  INTENT_ANALYSIS_MODEL_ID: "claude-haiku-4-5"
  ENTITY_EXTRACTION_MODEL_ID: "claude-haiku-4-5"
```

### Virtual Key for Core-API

1. Create virtual key via `POST /key/generate` on LiteLLM proxy using the master key
2. Store in AWS Secrets Manager (new field in existing core-api secret, or dedicated secret)
3. Reference via External Secrets as `LITELLM_API_KEY` env var in core-api deployment

### Docker Compose (Local Dev)

Update core-api environment in `infra/compose/docker-compose.yml`:

```yaml
environment:
  AI_LLM_PROVIDER: "litellm"
  AI_EMBEDDING_PROVIDER: "litellm"
  LITELLM_BASE_URL: "http://litellm:4000"
  LITELLM_API_KEY: "sk-local-dev-key-1234"  # master key works locally
```

Add `titan-embed-text-v2` to `infra/compose/litellm-config.yaml`.

### LiteLLM Configmap

Add `titan-embed-text-v2` model entry (see Model Mapping section above).

## What Does NOT Change

- **Routes** — all API endpoints unchanged
- **Services** — story_evolution, context_extractor, memory, etc. call through protocols
- **StorytellingAgent** — orchestration layer unchanged
- **Frontend** — no changes
- **BedrockAdapter** — retained as fallback (`AI_LLM_PROVIDER=bedrock`)
- **OpenAIProvider** — retained as fallback (`AI_LLM_PROVIDER=openai`)
- **Protocol definitions** — `LLMProvider` and `EmbeddingProvider` interfaces unchanged (except embed default model_id)

## Testing

### New Tests: `tests/adapters/test_litellm.py`

- `stream_generate()` correctly parses SSE chunks from `/v1/chat/completions`
- `embed_texts()` returns vectors from `/v1/embeddings`
- Error mapping: 429 -> rate_limit, 401 -> auth_error, 503 -> provider_unavailable, 400 -> invalid_request
- Authorization header sent correctly
- Guardrail metadata passed when guardrail_id provided

### Updated Tests

- `test_provider_contracts.py` — add `"litellm"` provider to protocol conformance tests
- `test_ai_provider_selection.py` — verify registry returns `LiteLLMAdapter` when `AI_LLM_PROVIDER=litellm`

## Follow-Up Items

### Immediate (post-integration)

1. **Validate and re-enable Bedrock guardrails** — confirm whether guardrails are currently active in production, configure LiteLLM guardrail config, verify end-to-end
2. **Decommission core-api Bedrock IAM policies** — once LiteLLM path is validated and stable, remove direct Bedrock invoke permissions from core-api's IRSA role. Core-api should no longer need `bedrock:InvokeModel` or `bedrock:InvokeModelWithResponseStream` since all calls route through LiteLLM's own IRSA role.

### Future

3. **Tag-based routing** — route requests by tags (environment, feature, user tier) per [LiteLLM docs](https://docs.litellm.ai/docs/proxy/tag_routing)
4. **Customer groups** — track per-user usage via [LiteLLM customer groups](https://docs.litellm.ai/docs/proxy/customers)
5. **Per-user virtual keys** — short-lived keys for individual users with budget limits
6. **Budget controls** — set spending limits per key/customer/tag

## Documentation Deliverable

New file `docs/ai-models.md` documenting:

- Complete model inventory (alias, underlying ID, use cases, configuration location)
- How to swap a model (LiteLLM configmap change only, no code changes)
- Architecture diagram showing core-api -> LiteLLM -> Bedrock flow
- Future roadmap (tag routing, customer groups, virtual keys)

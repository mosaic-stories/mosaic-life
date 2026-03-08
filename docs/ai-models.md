# AI Models Reference

This document lists all AI models used by the Mosaic Life application, their configuration, and how to swap them.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│  core-api   │────►│  LiteLLM Proxy   │────►│  AWS Bedrock   │
│             │     │  (aiservices ns)  │     │               │
│  Uses alias │     │  Maps alias to   │     │  Foundation   │
│  model names│     │  provider model  │     │  models       │
└─────────────┘     └──────────────────┘     └───────────────┘
```

Core-api calls LiteLLM using **alias names** (e.g., `claude-sonnet-4-6`). LiteLLM maps these to the underlying provider model IDs. This means **model swaps require only a LiteLLM config change** — no application code changes.

## Models in Use

### Chat / Generation Models

| LiteLLM Alias | Underlying Model | Provider | Use Cases |
|---------------|-----------------|----------|-----------|
| `claude-sonnet-4-6` | `us.anthropic.claude-sonnet-4-6` | Bedrock (cross-region) | AI personas (biographer, friend, colleague, family), story evolution, story rewriting, context extraction, memory summarization |
| `claude-haiku-4-5` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Bedrock (cross-region) | Intent analysis, change summaries, entity extraction |

### Embedding Models

| LiteLLM Alias | Underlying Model | Provider | Use Cases |
|---------------|-----------------|----------|-----------|
| `titan-embed-text-v2` | `amazon.titan-embed-text-v2:0` | Bedrock | Vector embeddings for RAG retrieval (1024 dimensions) |

### Additional Models (Available but not used by core-api)

These models are configured in LiteLLM and available for future use:

| LiteLLM Alias | Underlying Model | Provider |
|---------------|-----------------|----------|
| `claude-opus-4-6` | `us.anthropic.claude-opus-4-6-v1` | Bedrock |
| `qwen3-next-80b` | `qwen.qwen3-next-80b-a3b` | Bedrock |
| `kimi-k2.5` | `moonshotai.kimi-k2.5` | Bedrock |
| `voxtral-small-24b` | `mistral.voxtral-small-24b-2507` | Bedrock |
| `voxtral-mini-3b` | `mistral.voxtral-mini-3b-2507` | Bedrock |
| `magistral-small` | `mistral.magistral-small-2509` | Bedrock |
| `mistral-large-3` | `mistral.mistral-large-3-675b-instruct` | Bedrock |
| `nova-multimodal-embeddings` | `amazon.nova-2-multimodal-embeddings-v1:0` | Bedrock |
| `llama4-maverick-17b` | `us.meta.llama4-maverick-17b-instruct-v1:0` | Bedrock |

## Configuration Locations

### Where model aliases are referenced in core-api

| Setting | Default | File | Env Var Override |
|---------|---------|------|------------------|
| Persona model IDs | `claude-sonnet-4-6` | `services/core-api/app/config/personas.yaml` | N/A (edit YAML) |
| Evolution summarization | `claude-sonnet-4-6` | `services/core-api/app/config/settings.py` | `EVOLUTION_SUMMARIZATION_MODEL_ID` |
| Change summaries | `claude-haiku-4-5` | `services/core-api/app/config/settings.py` | `CHANGE_SUMMARY_MODEL_ID` |
| Intent analysis | `claude-haiku-4-5` | `services/core-api/app/config/settings.py` | `INTENT_ANALYSIS_MODEL_ID` |
| Entity extraction | `claude-haiku-4-5` | `services/core-api/app/config/settings.py` | `ENTITY_EXTRACTION_MODEL_ID` |
| Embedding model | `titan-embed-text-v2` | `services/core-api/app/adapters/litellm.py` | N/A (protocol default) |

### Where model mappings are defined in LiteLLM

| Environment | File |
|-------------|------|
| Production | `infra/helm/litellm/templates/configmap.yaml` |
| Local dev | `infra/compose/litellm-config.yaml` |

## How to Swap a Model

### Scenario: Replace Claude Sonnet 4.6 with a different model

1. **Add the new model to LiteLLM config** (if not already present):

   ```yaml
   # In infra/helm/litellm/templates/configmap.yaml
   - model_name: claude-sonnet-4-6  # keep the same alias
     litellm_params:
       model: bedrock/us.anthropic.claude-sonnet-4-7  # new model
   ```

2. **Commit and deploy** — ArgoCD will sync the LiteLLM config automatically.

3. **No core-api changes needed** — the alias `claude-sonnet-4-6` now routes to the new model.

### Scenario: Add a completely new model

1. Add the model entry to both LiteLLM configs (production and local dev).
2. Reference the new alias in `settings.py` or `personas.yaml` as needed.
3. Deploy both LiteLLM and core-api changes.

## Provider Fallback

Core-api supports three AI providers, configured via `AI_LLM_PROVIDER` env var:

| Provider | Value | When to Use |
|----------|-------|-------------|
| **LiteLLM** (default) | `litellm` | Normal operation — all calls routed through proxy |
| **Bedrock** (fallback) | `bedrock` | Emergency bypass if LiteLLM is down |
| **OpenAI** (alternative) | `openai` | Testing with OpenAI models directly |

To fall back to direct Bedrock: set `AI_LLM_PROVIDER=bedrock` and `AI_EMBEDDING_PROVIDER=bedrock` in the core-api deployment. Note that model IDs must then use full Bedrock model IDs, not LiteLLM aliases.

## Future Roadmap

- **Tag-based routing** — route requests by environment, feature, or user tier ([docs](https://docs.litellm.ai/docs/proxy/tag_routing))
- **Customer groups** — track per-user usage ([docs](https://docs.litellm.ai/docs/proxy/customers))
- **Per-user virtual keys** — short-lived keys with budget limits
- **Budget controls** — spending limits per key/customer/tag
- **Bedrock guardrails** — validate and re-enable via LiteLLM guardrail config

## IAM Decommissioning Note

Once the LiteLLM integration is validated and stable in production, the following IAM permissions should be **removed from core-api's IRSA role** (`mosaic-prod-core-api-secrets-role`):

- `bedrock:InvokeModel`
- `bedrock:InvokeModelWithResponseStream`
- `bedrock:ApplyGuardrail`
- `bedrock:GetGuardrail`

These permissions are no longer needed because all Bedrock calls now route through LiteLLM's own IRSA role (`mosaic-shared-litellm-role`). Removing them follows the principle of least privilege.

**Do not remove these until:**
1. LiteLLM integration has been running in production for at least 1 week
2. No `AI_LLM_PROVIDER=bedrock` fallback is needed
3. The change is tracked in a separate PR with the IAM policy update in the infrastructure repo

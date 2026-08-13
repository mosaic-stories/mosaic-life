## Why

The LiteLLM proxy (`aiservices` namespace) is currently pinned to the floating `main-stable` image tag rather than a fixed version, so the running version (approximately v1.82.3) is not reproducible or recorded in git. Pinning to a specific release removes that drift and picks up several releases' worth of Bedrock reliability fixes (credential caching, context-caching correctness) and monitoring improvements. Separately, Claude Sonnet 5, Claude Opus 5, and GLM 5 are now available on Amazon Bedrock and should be added to the model catalog so core-api (and any persona/preference config that opts in later) can call them through the existing LiteLLM alias pattern.

## What Changes

- Replace the floating `tag: "main-stable"` on the `litellm-database` image (`infra/helm/litellm/values.yaml`) with a pinned `tag: "v1.96.0"`.
- Add three new Bedrock model catalog entries — `claude-sonnet-5`, `claude-opus-5`, `glm-5` — to the prod/staging LiteLLM config (`infra/helm/litellm/templates/configmap.yaml`) and mirror them in the local-dev config (`infra/compose/litellm-config.yaml`), following each file's existing per-environment ID convention.
- Update `docs/ai-models.md` model tables to reflect the new entries.
- **BREAKING**: none. This is additive (new model aliases) plus a proxy version bump; no existing `model_name` aliases, request/response contracts, or consumer-facing env vars change.

## Capabilities

### New Capabilities
- `ai-model-catalog`: the LiteLLM proxy's alias-based Bedrock model catalog — how a model becomes callable by core-api, and what must stay true (config-only extension, catalog/`/v1/models` visibility) as new aliases like `claude-sonnet-5`, `claude-opus-5`, and `glm-5` are added. This capability didn't previously have a spec of its own; this change is the natural point to capture it in scope, without retroactively documenting every existing model alias.

### Modified Capabilities
(none — no existing capability's requirements change. `ai-rate-limiting` and `ai-prompt-safety` operate on requests generically regardless of which model alias is targeted, and are unaffected by which models exist in the catalog or which proxy version serves them)

## Impact

- **Affected files**: `infra/helm/litellm/values.yaml`, `infra/helm/litellm/templates/configmap.yaml`, `infra/compose/litellm-config.yaml`, `docs/ai-models.md`.
- **Affected systems**: LiteLLM proxy deployment (`aiservices` namespace, ArgoCD-synced), local dev docker-compose stack. No changes to core-api code, IAM/IRSA policy (already wildcards Bedrock foundation-model and inference-profile ARNs), or frontend.
- **Out of scope**: frontend model picker (`apps/web/src/features/settings/components/AIPreferencesSettings.tsx`), any `default_*_model_id` settings in `services/core-api/app/config/settings.py`, and pre-existing config drift (model-alias naming inconsistencies, stale persona `model_id`, local-only `whisper-large-v3-turbo` entry) — none of these are touched by this change.

## Non-goals

- Not surfacing the new models in the frontend AI preferences picker.
- Not changing any default model selection for chat, summarization, intent analysis, or entity extraction.
- Not reconciling the pre-existing `claude-opus-4-6-v1` / `claude-sonnet-4.5` naming inconsistencies already present in the repo.
- Not adding per-team or per-user budget enforcement, even though v1.96.0 changes that subsystem's default behavior (mosaic doesn't configure team/user budgets today).
- Not deploying to production as part of `/opsx:apply` — ArgoCD sync of merged manifests is a separate, human-triggered GitOps step per CLAUDE.md.

## Open Questions

1. ~~Has Bedrock model access been explicitly enabled for `anthropic.claude-sonnet-5`, `anthropic.claude-opus-5`, and `zai.glm-5` in the target AWS account/region (`us-east-1`)?~~ — **RESOLVED 2026-08-13**: confirmed by the user, all three models are enabled in the Bedrock console for `us-east-1`.
2. ~~Confirm `ghcr.io/berriai/litellm-database:v1.96.0` is published (amd64 + arm64) before merging the version-tag change~~ — **RESOLVED 2026-08-13**: verified directly against the GHCR registry API. The manifest index for `v1.96.0` exists with both `linux/amd64` and `linux/arm64` image manifests plus signed attestations. No fallback to `main-stable` needed.

Both preconditions are now confirmed — no blockers remain before `/opsx:apply`.

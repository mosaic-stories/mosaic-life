# Feature 3 Wrap-Up Plan: Agent Framework Abstraction

**Date:** 2026-02-14  
**Scope Source:** `docs/plans/AI-MEMORY-START.md` (Feature 3)  
**Plan Type:** Independent completion plan based on current codebase state

---

## 1) Executive Summary

Feature 3 baseline scope (as recorded in `AI-MEMORY-START.md`) is complete, and this document tracks the **follow-on hardening** needed to make the abstraction layer operationally robust and fully extensible.

The current implementation already includes:

- Provider protocols for LLM and embeddings
- Runtime provider selection by config
- Two providers in production paths (Bedrock + OpenAI direct)
- Wiring of chat and RAG ingestion/retrieval through provider getters
- Core adapter tests and provider-selection tests

What remains is architectural hardening: explicit DI/registry wiring, full protocol surface (vector-store/memory/guardrails/storytelling), interface-boundary observability normalization, and cross-provider contract conformance tests.

This updated plan is now **execution-ready** with:
- Ordered slices and checklists
- Concrete file-by-file touch points
- Test migration impact notes
- Exit criteria and evidence required to mark done

---

## 2) Current State (Codebase-Verified)

### Implemented now

1. **Protocol-based provider interfaces (partial Feature 3 scope)**
   - `LLMProvider`, `EmbeddingProvider`, `AIProviderError`
   - File: `services/core-api/app/adapters/ai.py`

2. **Configuration-driven provider selection**
   - `AI_LLM_PROVIDER`, `AI_EMBEDDING_PROVIDER`
   - OpenAI settings support in backend config
   - File: `services/core-api/app/config/settings.py`

3. **Multiple provider implementations**
   - Bedrock adapter
   - OpenAI direct adapter
   - Files: `services/core-api/app/adapters/bedrock.py`, `services/core-api/app/adapters/openai.py`

4. **Business path integration via abstraction getters**
   - Chat route uses `get_llm_provider()`
   - Ingestion/retrieval use `get_embedding_provider()`
   - Files: `services/core-api/app/routes/ai.py`, `services/core-api/app/services/ingestion.py`, `services/core-api/app/services/retrieval.py`

5. **Provider-focused tests present**
   - Bedrock tests
   - OpenAI tests
   - Provider selection tests
   - Files under `services/core-api/tests/adapters/`

### Codebase reference map (verified 2026-02-14)

Use this section as the working map while implementing:

1. **Provider protocols + selector getters (current service-locator seam)**
   - `services/core-api/app/adapters/ai.py`
   - Contains `AIProviderError`, `LLMProvider`, `EmbeddingProvider`, and `get_llm_provider()/get_embedding_provider()`

2. **Provider implementations**
   - `services/core-api/app/adapters/openai.py`
   - `services/core-api/app/adapters/bedrock.py`
   - Both implement `stream_generate` and `embed_texts`; both currently set tracing attributes, but with non-normalized key names

3. **Business-path call sites that should migrate to registry-backed wiring**
   - `services/core-api/app/routes/ai.py` (chat path calls `get_llm_provider()` inside stream generator)
   - `services/core-api/app/services/ingestion.py` (calls `get_embedding_provider()`)
   - `services/core-api/app/services/retrieval.py` (calls `get_embedding_provider()`)

4. **Conversation persistence seam for memory adapter wrapper**
   - `services/core-api/app/services/ai.py`
   - Existing functions (`get_context_messages`, `save_message`, conversation CRUD) are the natural delegate methods for `ConversationMemoryAdapter`

5. **Vector-store seam for adapter extraction**
   - `services/core-api/app/services/retrieval.py`
   - Existing `store_chunks`, `delete_chunks_for_story`, and retrieval SQL are natural delegate targets for `PostgresVectorStoreAdapter`

6. **Tests coupled to current getter patch points (must be updated during migration)**
   - `services/core-api/tests/services/test_ingestion.py` patches `app.services.ingestion.get_embedding_provider`
   - `services/core-api/tests/integration/test_rag_flow.py` patches getter-based embedding calls
   - `services/core-api/tests/adapters/test_ai_provider_selection.py` validates config-driven provider selection behavior

### Not fully implemented yet

1. **Full abstraction surface from Feature 3 design**
   - Missing protocol interfaces and concrete adapters for:
     - `VectorStore`
     - `AgentMemory`
     - `ContentGuardrail`
     - `StorytellingAgent`

2. **Uniform provider contract coverage**
   - Tests exist but not yet a unified conformance suite applied equally across all providers

3. **Interface-boundary observability expansion beyond provider boundary**
   - Provider-boundary telemetry keys are standardized
   - Route/service-level contract expansion still pending

4. **Experimentation-ready provider metadata path**
   - Runtime selection exists, but feature-level metadata hooks needed for A/B and provider-quality comparisons are not formalized

### Scope boundary note

Per `docs/plans/AI-MEMORY-START.md`, this is **post-baseline hardening** work (not a contradiction of the original Feature 3 milestone status).

---

## 3) Definition of Done (Feature 3)

Feature 3 will be considered complete when all items below are true:

1. **Abstraction Surface Complete**
   - Protocols exist for LLM, Embedding, VectorStore, AgentMemory, ContentGuardrail, StorytellingAgent
   - Business services consume protocol interfaces, not provider-specific types

2. **DI/Wiring Complete**
   - Central provider registry/container resolves implementations from config
   - No business-path module directly imports provider implementations (`bedrock.py`, `openai.py`, etc.)

3. **Provider Multiplicity Operational**
   - At least two selectable providers for LLM and embeddings (already met in principle: Bedrock + OpenAI)
   - Consistent behavior under error/retry semantics

4. **Conformance Tests Complete**
   - Shared contract test suite verifies core behavior across providers
   - Includes streaming semantics, embedding shape, retryability mapping, auth/config failures

5. **Observability Contract Complete**
   - Standard provider-boundary telemetry fields emitted consistently
   - Example fields: `ai.provider`, `ai.operation`, `ai.model`, `ai.retryable`, `ai.error_type`, `ai.latency_ms`

6. **Operator Documentation Complete**
   - Local/deploy docs include provider selection matrix, required secrets, and fallback behavior

---

## 4) Executable Implementation Plan

The work is organized into two delivery slices to minimize regression risk.

## Slice 1 — Wiring + Error/Telemetry Normalization

### 4.1 Create provider registry (keep compatibility shims)

**Objective:** Introduce explicit runtime wiring without breaking existing call sites.

**Implementation tasks:**
1. Add `ProviderRegistry` with config-based resolver methods:
   - `get_llm_provider(region: str | None = None)`
   - `get_embedding_provider(region: str | None = None)`
2. Move provider-selection branching from free functions into registry implementation.
3. Keep existing free functions in `adapters/ai.py` as compatibility wrappers delegating to a singleton registry.
4. Add a lightweight dependency entrypoint for routes/services (module-level getter acceptable for MVP).

**Primary files:**
- `services/core-api/app/adapters/ai.py`
- `services/core-api/app/providers/registry.py` (new)

**Done checks:**
- No business path imports `openai.py` or `bedrock.py` directly.
- Existing provider-selection tests still pass (or pass after minimal import/patch path updates).

### 4.2 Migrate business-path call sites to registry-backed access

**Objective:** Remove service-locator leakage from routes/services while preserving behavior.

**Implementation tasks:**
1. Route migration:
   - Update `services/core-api/app/routes/ai.py` to resolve LLM via registry dependency (not direct adapter getter import).
2. Ingestion/retrieval migration:
   - Update `services/core-api/app/services/ingestion.py` and `services/core-api/app/services/retrieval.py` to consume embedding provider through registry-backed accessor.
3. Keep temporary compatibility wrappers only until all internal usages are migrated.

**Primary files:**
- `services/core-api/app/routes/ai.py`
- `services/core-api/app/services/ingestion.py`
- `services/core-api/app/services/retrieval.py`

**Done checks:**
- No direct import of `get_llm_provider`/`get_embedding_provider` in route/service modules (except approved compatibility module).
- Route + ingestion + retrieval tests green.

### 4.3 Normalize provider error envelope

**Objective:** Make provider failures comparable and easier to observe/route.

**Implementation tasks:**
1. Extend `AIProviderError` fields:
   - `message` (existing)
   - `retryable` (existing)
   - `code` (new, e.g., `rate_limit`, `auth_error`, `invalid_request`, `provider_unavailable`, `unknown`)
   - `provider` (new, e.g., `bedrock`, `openai`)
   - `operation` (new, e.g., `stream_generate`, `embed_texts`)
2. Map OpenAI and Bedrock exceptions into this normalized taxonomy.
3. Ensure route-level logging uses normalized fields instead of provider-specific branching.

**Primary files:**
- `services/core-api/app/adapters/ai.py`
- `services/core-api/app/adapters/openai.py`
- `services/core-api/app/adapters/bedrock.py`
- `services/core-api/app/routes/ai.py`

**Done checks:**
- Equivalent failures across providers produce comparable error envelope fields.
- Tests assert structured fields where appropriate.

### 4.4 Add provider-boundary telemetry key conventions

**Objective:** Standardize observability attributes across providers.

**Implementation tasks:**
1. Define shared telemetry attribute constants (single module):
   - `ai.provider`
   - `ai.operation`
   - `ai.model`
   - `ai.retryable`
   - `ai.error_type`
   - `ai.latency_ms`
2. Update both provider adapters to emit the same keys for equivalent operations.
3. Add minimal tests for telemetry attribute presence on success/failure paths (unit-level where feasible).

**Primary files:**
- `services/core-api/app/adapters/openai.py`
- `services/core-api/app/adapters/bedrock.py`
- `services/core-api/app/adapters/` (shared constants module, new)
- `services/core-api/tests/adapters/test_openai.py`
- `services/core-api/tests/adapters/test_bedrock.py`

**Done checks:**
- Both adapters emit the same telemetry attribute names for stream and embed operations.

### Slice 1 Status Update (2026-02-14)

**Status:** ✅ Completed

**Delivered in Slice 1:**
- `ProviderRegistry` introduced and used by chat, ingestion, and retrieval paths.
- Compatibility wrappers retained in `adapters/ai.py` to avoid breaking call sites.
- `AIProviderError` normalized with `code`, `provider`, and `operation` fields.
- Shared provider-boundary telemetry keys implemented and emitted by Bedrock + OpenAI adapters.
- Tests migrated from getter patch seams to registry patch seams where needed.

**Validation evidence captured:**
- `just validate-backend` ✅
- `cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_ai_provider_selection.py -q` ✅
- `cd /apps/mosaic-life/services/core-api && uv run pytest tests/routes/test_ai_routes.py -q` ✅
- `cd /apps/mosaic-life/services/core-api && uv run pytest tests/services/test_ingestion.py -q` ✅
- `cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_openai.py -q` ✅
- `cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_bedrock.py -q` ✅
- `cd /apps/mosaic-life/services/core-api && uv run pytest tests/integration/test_rag_flow.py -q` ✅

---

## Slice 2 — Full Protocol Surface + Contract Conformance

### 4.5 Add missing protocol interfaces

**Objective:** Complete abstraction surface defined in Feature 3 design.

**Implementation tasks:**
1. Add protocol definitions for:
   - `VectorStore`
   - `AgentMemory`
   - `ContentGuardrail`
   - `StorytellingAgent`
2. Keep signatures aligned with current MVP capabilities to avoid speculative over-design.

**Primary files:**
- `services/core-api/app/adapters/ai.py` (or `services/core-api/app/adapters/interfaces.py`)

**Done checks:**
- Mypy passes with protocol definitions.
- Protocols are importable and used by at least one implementation or orchestrator path.

### 4.6 Add thin adapter shells over existing logic

**Objective:** Use wrappers first; avoid behavior rewrites.

**Implementation tasks:**
1. `PostgresVectorStoreAdapter` delegates to retrieval/storage service functions.
2. `ConversationMemoryAdapter` delegates to existing conversation/message service functions in `services/ai.py`.
3. `BedrockGuardrailAdapter` wraps current Bedrock guardrail invocation semantics.
4. `DefaultStorytellingAgent` orchestrates:
   - context retrieval
   - prompt assembly
   - LLM streaming call
   - memory persistence handoff

**Primary files:**
- `services/core-api/app/services/retrieval.py`
- `services/core-api/app/services/ai.py`
- `services/core-api/app/routes/ai.py`
- `services/core-api/app/adapters/` (new adapter shell modules)

**Done checks:**
- At least one end-to-end chat path uses the new storytelling orchestration shell.
- Existing behavior and API responses remain unchanged.

### 4.7 Build contract conformance suite

**Objective:** Validate abstraction parity across providers.

**Implementation tasks:**
1. Create shared provider contract test module + fixtures.
2. Cover required cases:
   - stream success with incremental chunks
   - embed shape/length guarantees
   - retryable vs non-retryable mapping
   - config/auth failure behavior
   - malformed stream payload handling
3. Run each provider through the same assertions where feasible.

**Primary files:**
- `services/core-api/tests/adapters/test_provider_contracts.py` (new)
- `services/core-api/tests/adapters/test_openai.py`
- `services/core-api/tests/adapters/test_bedrock.py`
- `services/core-api/tests/adapters/test_ai_provider_selection.py`

**Done checks:**
- Contract suite passes for all configured providers.
- Existing provider-specific tests still pass.

### Slice 2 Status Update (2026-02-14)

**Status:** ✅ Completed

**Delivered in Slice 2:**
- Added missing protocols: `VectorStore`, `AgentMemory`, `ContentGuardrail`, `StorytellingAgent`.
- Added thin adapter shells: `PostgresVectorStoreAdapter`, `ConversationMemoryAdapter`, `BedrockGuardrailAdapter`.
- Added `DefaultStorytellingAgent` orchestration shell for context retrieval, prompt assembly, provider streaming, and assistant-memory persistence handoff.
- Wired chat route through registry-backed storytelling agent path.
- Added shared provider contract conformance suite covering stream success, embedding shape/length, retryable mapping, config/auth failure behavior, and malformed stream handling.

**Validation evidence captured:**
- `just validate-backend` ✅
- `cd services/core-api && uv run pytest tests/adapters -q` ✅
- `cd services/core-api && uv run pytest tests/integration/test_rag_flow.py -q` ✅
- `cd services/core-api && uv run pytest -q` ✅

---

## 5) Suggested File Targets

- `services/core-api/app/adapters/ai.py` (protocols/error contracts)
- `services/core-api/app/adapters/openai.py` (telemetry/error normalization)
- `services/core-api/app/adapters/bedrock.py` (telemetry/error normalization)
- `services/core-api/app/providers/registry.py` (new, if introduced)
- `services/core-api/app/services/ai.py` (orchestration migration)
- `services/core-api/app/routes/ai.py` (dependency wiring)
- `services/core-api/tests/adapters/test_ai_provider_selection.py`
- `services/core-api/tests/adapters/test_openai.py`
- `services/core-api/tests/adapters/test_bedrock.py`
- `services/core-api/tests/adapters/test_provider_contracts.py` (new)

### Additional likely touch points (based on current test seams)

- `services/core-api/tests/services/test_ingestion.py`
- `services/core-api/tests/integration/test_rag_flow.py`
- `services/core-api/tests/routes/test_ai_routes.py`

These tests currently patch getter-based imports and will likely need import/patch target updates once registry-backed wiring lands.

---

## 6) Validation Gates

Run at end of each phase:

```bash
just validate-backend
```

And feature-focused suites:

```bash
cd services/core-api
uv run pytest tests/adapters -q
uv run pytest tests/routes/test_ai_routes.py -q
uv run pytest tests/integration/test_rag_flow.py -q
```

### Execution order for validation (required)

1. After Slice 1 wiring/error/telemetry changes:
   - `just validate-backend`
   - `cd services/core-api && uv run pytest tests/adapters/test_ai_provider_selection.py -q`
   - `cd services/core-api && uv run pytest tests/routes/test_ai_routes.py -q`
   - `cd services/core-api && uv run pytest tests/services/test_ingestion.py -q`

2. After Slice 2 protocol/contract changes:
   - `just validate-backend`
   - `cd services/core-api && uv run pytest tests/adapters -q`
   - `cd services/core-api && uv run pytest tests/integration/test_rag_flow.py -q`

3. Final gate:
   - `just validate-backend`
   - `cd services/core-api && uv run pytest -q`

---

## 7) Risks and Mitigations

1. **Regression risk from wiring changes**
   - Mitigation: compatibility wrappers and incremental migration by entrypoint

2. **Over-scoping with new abstractions**
   - Mitigation: use thin wrappers over existing behavior first; avoid behavior rewrites

3. **Provider behavior drift (Bedrock vs OpenAI)**
   - Mitigation: contract tests + normalized error/telemetry mapping

4. **Observability inconsistency**
   - Mitigation: shared telemetry attribute constants and lint/check in tests

5. **Test fragility during DI migration (patch target drift)**
   - Mitigation: migrate tests in lockstep with wiring changes; prefer fixture-level provider injection over monkeypatching deep import paths where possible

---

## 8) Completion Recommendation

Given current progress, Feature 3 can realistically be completed in **2 focused implementation slices**:

- **Slice 1:** DI/container + error/telemetry normalization (Phase A + C1)
- **Slice 2:** Remaining protocol surface + contract tests (Phase B + C2)

Once both slices are complete and validated:

1. Update `docs/plans/PLAN-AUDIT-REPORT.md` to reflect this follow-on hardening completion.
2. Record evidence in this section before closing:
   - Commit/PR references
   - Final validation command outputs
   - Notes on any deferred sub-items

### Completion checklist (must all be true)

- [x] Registry/container wiring merged and used by chat + ingestion + retrieval paths
- [x] `AIProviderError` normalized fields implemented and asserted in tests
- [x] Shared telemetry keys implemented for OpenAI + Bedrock providers
- [x] Missing protocols (`VectorStore`, `AgentMemory`, `ContentGuardrail`, `StorytellingAgent`) added and type-checked
- [x] Thin adapter shells integrated into at least one orchestration path
- [x] Provider contract test suite implemented and passing
- [x] `just validate-backend` passing on final branch state

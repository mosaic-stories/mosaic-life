# LiteLLM Core-API Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Swap all direct AWS Bedrock calls in core-api to route through the LiteLLM proxy, using LiteLLM alias names for model IDs.

**Architecture:** A new `LiteLLMAdapter` class implements the existing `LLMProvider` and `EmbeddingProvider` protocols using `httpx` against LiteLLM's OpenAI-compatible API. The provider registry gains a `"litellm"` option (new default). All model ID references change from Bedrock-specific IDs to LiteLLM aliases. Old adapters are retained as fallbacks.

**Tech Stack:** Python, httpx, FastAPI, pytest, Helm, Docker Compose

**Design Doc:** `docs/plans/2026-03-07-litellm-core-api-integration-design.md`

---

### Task 1: Add LiteLLM settings to configuration

**Files:**
- Modify: `services/core-api/app/config/settings.py`

**Step 1: Add LiteLLM settings fields**

Add after the OpenAI settings block (after line 69):

```python
# LiteLLM provider configuration
litellm_base_url: str = os.getenv("LITELLM_BASE_URL", "http://localhost:14000")
litellm_api_key: str | None = os.getenv("LITELLM_API_KEY")
```

**Step 2: Update default provider to litellm**

Change line 60-61 from:

```python
ai_llm_provider: str = os.getenv("AI_LLM_PROVIDER", "bedrock").lower()
ai_embedding_provider: str = os.getenv("AI_EMBEDDING_PROVIDER", "bedrock").lower()
```

To:

```python
ai_llm_provider: str = os.getenv("AI_LLM_PROVIDER", "litellm").lower()
ai_embedding_provider: str = os.getenv("AI_EMBEDDING_PROVIDER", "litellm").lower()
```

**Step 3: Update model ID defaults to LiteLLM aliases**

Change the 4 model ID defaults:

```python
evolution_summarization_model_id: str = os.getenv(
    "EVOLUTION_SUMMARIZATION_MODEL_ID",
    "claude-sonnet-4-6",
)

change_summary_model_id: str = os.getenv(
    "CHANGE_SUMMARY_MODEL_ID",
    "claude-haiku-4-5",
)

intent_analysis_model_id: str = os.getenv(
    "INTENT_ANALYSIS_MODEL_ID",
    "claude-haiku-4-5",
)

entity_extraction_model_id: str = os.getenv(
    "ENTITY_EXTRACTION_MODEL_ID",
    "claude-haiku-4-5",
)
```

**Step 4: Verify settings load**

Run: `cd services/core-api && uv run python -c "from app.config.settings import Settings; s = Settings(); print(s.ai_llm_provider, s.litellm_base_url)"`

Expected: `litellm http://localhost:14000`

**Step 5: Commit**

```bash
git add services/core-api/app/config/settings.py
git commit -m "feat: add LiteLLM settings and change default provider to litellm"
```

---

### Task 2: Update model IDs in personas.yaml and protocol defaults

**Files:**
- Modify: `services/core-api/app/config/personas.yaml`
- Modify: `services/core-api/app/adapters/ai.py`
- Modify: `services/core-api/app/adapters/bedrock.py`

**Step 1: Update all 4 persona model_ids**

In `personas.yaml`, change all 4 occurrences of `model_id` from `us.anthropic.claude-sonnet-4-5-20250929-v1:0` to `claude-sonnet-4-6`:

- Line 19 (biographer): `model_id: "claude-sonnet-4-6"`
- Line 53 (friend): `model_id: "claude-sonnet-4-6"`
- Line 86 (colleague): `model_id: "claude-sonnet-4-6"`
- Line 118 (family): `model_id: "claude-sonnet-4-6"`

**Step 2: Update EmbeddingProvider protocol default**

In `adapters/ai.py` line 59, change the default `model_id` parameter:

From: `model_id: str = "amazon.titan-embed-text-v2:0"`
To: `model_id: str = "titan-embed-text-v2"`

**Step 3: Update Bedrock adapter constant**

In `adapters/bedrock.py` line 34, change:

From: `TITAN_EMBED_MODEL_ID = "amazon.titan-embed-text-v2:0"`
To: `TITAN_EMBED_MODEL_ID = "titan-embed-text-v2"`

**Step 4: Commit**

```bash
git add services/core-api/app/config/personas.yaml services/core-api/app/adapters/ai.py services/core-api/app/adapters/bedrock.py
git commit -m "feat: update model IDs to LiteLLM aliases"
```

---

### Task 3: Write failing tests for LiteLLMAdapter

**Files:**
- Create: `services/core-api/tests/adapters/test_litellm.py`

**Step 1: Write the test file**

```python
"""Tests for LiteLLM adapter."""

import json
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.adapters.ai import AIProviderError


class TestLiteLLMAdapter:
    """Tests for LiteLLMAdapter."""

    def _make_adapter(self):
        from app.adapters.litellm import LiteLLMAdapter

        return LiteLLMAdapter(
            base_url="http://litellm:4000",
            api_key="sk-test-key",
        )

    def test_adapter_initializes(self) -> None:
        """Test adapter initializes with base_url and api_key."""
        adapter = self._make_adapter()
        assert adapter.base_url == "http://litellm:4000"
        assert adapter.api_key == "sk-test-key"

    @pytest.mark.asyncio
    async def test_stream_generate_yields_chunks(self) -> None:
        """Test stream_generate yields content chunks from SSE."""
        adapter = self._make_adapter()

        async def mock_lines():
            for line in [
                'data: {"choices":[{"delta":{"content":"Hello"}}]}',
                'data: {"choices":[{"delta":{"content":" world"}}]}',
                "data: [DONE]",
            ]:
                yield line

        response = Mock(status_code=200)
        response.aiter_lines = mock_lines

        stream_cm = AsyncMock()
        stream_cm.__aenter__ = AsyncMock(return_value=response)
        stream_cm.__aexit__ = AsyncMock(return_value=None)

        client = Mock()
        client.stream = Mock(return_value=stream_cm)

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=client)
        client_cm.__aexit__ = AsyncMock(return_value=None)

        with patch.object(adapter, "_client", return_value=client_cm):
            chunks = []
            async for chunk in adapter.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="claude-sonnet-4-6",
            ):
                chunks.append(chunk)

        assert chunks == ["Hello", " world"]

    @pytest.mark.asyncio
    async def test_stream_generate_sends_auth_header(self) -> None:
        """Test stream_generate sends Authorization header."""
        from app.adapters.litellm import LiteLLMAdapter

        adapter = LiteLLMAdapter(
            base_url="http://litellm:4000",
            api_key="sk-my-key",
        )

        # Capture the headers used to create the client
        captured_headers = {}

        async def mock_lines():
            yield "data: [DONE]"

        response = Mock(status_code=200)
        response.aiter_lines = mock_lines

        stream_cm = AsyncMock()
        stream_cm.__aenter__ = AsyncMock(return_value=response)
        stream_cm.__aexit__ = AsyncMock(return_value=None)

        client = Mock()
        client.stream = Mock(return_value=stream_cm)

        import httpx

        original_init = httpx.AsyncClient.__init__

        def capture_init(self_client, *args, **kwargs):
            nonlocal captured_headers
            captured_headers = kwargs.get("headers", {})
            original_init(self_client, *args, **kwargs)

        with patch.object(httpx.AsyncClient, "__init__", capture_init):
            with patch.object(
                httpx.AsyncClient, "__aenter__", AsyncMock(return_value=client)
            ):
                with patch.object(
                    httpx.AsyncClient, "__aexit__", AsyncMock(return_value=None)
                ):
                    async for _ in adapter.stream_generate(
                        messages=[{"role": "user", "content": "Hi"}],
                        system_prompt="You are helpful.",
                        model_id="claude-sonnet-4-6",
                    ):
                        pass

        assert captured_headers.get("Authorization") == "Bearer sk-my-key"

    @pytest.mark.asyncio
    async def test_stream_generate_malformed_json_skipped(self) -> None:
        """Test malformed SSE lines are skipped."""
        adapter = self._make_adapter()

        async def mock_lines():
            for line in [
                "data: not-json",
                'data: {"choices":[{"delta":{"content":"OK"}}]}',
                "data: [DONE]",
            ]:
                yield line

        response = Mock(status_code=200)
        response.aiter_lines = mock_lines

        stream_cm = AsyncMock()
        stream_cm.__aenter__ = AsyncMock(return_value=response)
        stream_cm.__aexit__ = AsyncMock(return_value=None)

        client = Mock()
        client.stream = Mock(return_value=stream_cm)

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=client)
        client_cm.__aexit__ = AsyncMock(return_value=None)

        with patch.object(adapter, "_client", return_value=client_cm):
            chunks = []
            async for chunk in adapter.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="claude-sonnet-4-6",
            ):
                chunks.append(chunk)

        assert chunks == ["OK"]

    @pytest.mark.asyncio
    async def test_stream_generate_rate_limit_error(self) -> None:
        """Test 429 maps to retryable rate_limit error."""
        adapter = self._make_adapter()

        error_response = Mock(status_code=429, text="Rate limited")
        error_response.json.return_value = {"error": {"message": "Rate limited"}}

        stream_cm = AsyncMock()
        stream_cm.__aenter__ = AsyncMock(return_value=error_response)
        stream_cm.__aexit__ = AsyncMock(return_value=None)

        client = Mock()
        client.stream = Mock(return_value=stream_cm)

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=client)
        client_cm.__aexit__ = AsyncMock(return_value=None)

        with patch.object(adapter, "_client", return_value=client_cm):
            with pytest.raises(AIProviderError) as exc:
                async for _ in adapter.stream_generate(
                    messages=[{"role": "user", "content": "Hi"}],
                    system_prompt="You are helpful.",
                    model_id="claude-sonnet-4-6",
                ):
                    pass

        assert exc.value.code == "rate_limit"
        assert exc.value.retryable is True
        assert exc.value.provider == "litellm"

    @pytest.mark.asyncio
    async def test_stream_generate_auth_error(self) -> None:
        """Test 401 maps to non-retryable auth_error."""
        adapter = self._make_adapter()

        error_response = Mock(status_code=401, text="Unauthorized")
        error_response.json.return_value = {"error": {"message": "Bad key"}}

        stream_cm = AsyncMock()
        stream_cm.__aenter__ = AsyncMock(return_value=error_response)
        stream_cm.__aexit__ = AsyncMock(return_value=None)

        client = Mock()
        client.stream = Mock(return_value=stream_cm)

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=client)
        client_cm.__aexit__ = AsyncMock(return_value=None)

        with patch.object(adapter, "_client", return_value=client_cm):
            with pytest.raises(AIProviderError) as exc:
                async for _ in adapter.stream_generate(
                    messages=[{"role": "user", "content": "Hi"}],
                    system_prompt="You are helpful.",
                    model_id="claude-sonnet-4-6",
                ):
                    pass

        assert exc.value.code == "auth_error"
        assert exc.value.retryable is False

    @pytest.mark.asyncio
    async def test_embed_texts_returns_embeddings(self) -> None:
        """Test embed_texts returns list of embedding vectors."""
        adapter = self._make_adapter()

        response = Mock(status_code=200)
        response.json.return_value = {
            "data": [
                {"embedding": [0.1, 0.2, 0.3]},
                {"embedding": [0.4, 0.5, 0.6]},
            ]
        }

        client = AsyncMock()
        client.post = AsyncMock(return_value=response)

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=client)
        client_cm.__aexit__ = AsyncMock(return_value=None)

        with patch.object(adapter, "_client", return_value=client_cm):
            result = await adapter.embed_texts(["Hello", "World"])

        assert len(result) == 2
        assert result[0] == [0.1, 0.2, 0.3]
        assert result[1] == [0.4, 0.5, 0.6]

    @pytest.mark.asyncio
    async def test_embed_texts_error_mapping(self) -> None:
        """Test embed_texts maps HTTP errors correctly."""
        adapter = self._make_adapter()

        error_response = Mock(status_code=429, text="Rate limited")
        error_response.json.return_value = {"error": {"message": "Rate limited"}}

        client = AsyncMock()
        client.post = AsyncMock(return_value=error_response)

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=client)
        client_cm.__aexit__ = AsyncMock(return_value=None)

        with patch.object(adapter, "_client", return_value=client_cm):
            with pytest.raises(AIProviderError) as exc:
                await adapter.embed_texts(["Hello"])

        assert exc.value.code == "rate_limit"
        assert exc.value.retryable is True
        assert exc.value.provider == "litellm"


class TestGetLiteLLMAdapter:
    """Tests for singleton getter."""

    def test_get_adapter_returns_instance(self) -> None:
        """Test get_litellm_adapter returns an instance."""
        import app.adapters.litellm as litellm_module

        litellm_module._adapter = None

        from app.adapters.litellm import LiteLLMAdapter, get_litellm_adapter

        adapter = get_litellm_adapter(
            base_url="http://litellm:4000",
            api_key="sk-test",
        )
        assert isinstance(adapter, LiteLLMAdapter)

    def test_get_adapter_returns_same_instance(self) -> None:
        """Test get_litellm_adapter returns singleton."""
        import app.adapters.litellm as litellm_module

        litellm_module._adapter = None

        from app.adapters.litellm import get_litellm_adapter

        adapter1 = get_litellm_adapter(
            base_url="http://litellm:4000",
            api_key="sk-test",
        )
        adapter2 = get_litellm_adapter(
            base_url="http://litellm:4000",
            api_key="sk-test",
        )
        assert adapter1 is adapter2

    def test_get_adapter_recreates_on_config_change(self) -> None:
        """Test get_litellm_adapter creates new instance when config changes."""
        import app.adapters.litellm as litellm_module

        litellm_module._adapter = None

        from app.adapters.litellm import get_litellm_adapter

        adapter1 = get_litellm_adapter(
            base_url="http://litellm:4000",
            api_key="sk-test",
        )
        adapter2 = get_litellm_adapter(
            base_url="http://litellm:5000",
            api_key="sk-test",
        )
        assert adapter1 is not adapter2
```

**Step 2: Run tests to verify they fail**

Run: `cd services/core-api && uv run pytest tests/adapters/test_litellm.py -v 2>&1 | head -30`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.adapters.litellm'`

**Step 3: Commit**

```bash
git add services/core-api/tests/adapters/test_litellm.py
git commit -m "test: add failing tests for LiteLLMAdapter"
```

---

### Task 4: Implement LiteLLMAdapter

**Files:**
- Create: `services/core-api/app/adapters/litellm.py`

**Step 1: Write the adapter implementation**

```python
"""LiteLLM proxy adapter for AI chat and embeddings."""

import json
import logging
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import httpx
from opentelemetry import trace

from .ai import AIProviderError
from .telemetry import (
    AI_ERROR_TYPE,
    AI_LATENCY_MS,
    AI_MODEL,
    AI_OPERATION,
    AI_PROVIDER,
    AI_RETRYABLE,
)
from ..observability.metrics import (
    AI_EMBEDDING_DURATION,
    AI_REQUEST_DURATION,
    AI_TOKENS,
)

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.litellm")


def _http_status_to_error(status_code: int) -> tuple[str, bool]:
    if status_code == 429:
        return "rate_limit", True
    if status_code in {500, 502, 503, 504}:
        return "provider_unavailable", True
    if status_code in {401, 403}:
        return "auth_error", False
    if status_code == 400:
        return "invalid_request", False
    return "unknown", False


class LiteLLMAdapter:
    """Adapter for LiteLLM proxy using OpenAI-compatible API."""

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    @asynccontextmanager
    async def _client(self) -> AsyncGenerator[httpx.AsyncClient, None]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            timeout=httpx.Timeout(600.0),
        ) as client:
            yield client

    async def _read_error_message(self, response: httpx.Response) -> str:
        try:
            payload = response.json()
            error = payload.get("error", {})
            message = error.get("message")
            if isinstance(message, str) and message:
                return message
        except Exception:
            pass
        return response.text or "LiteLLM request failed"

    async def stream_generate(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model_id: str,
        max_tokens: int = 1024,
        guardrail_id: str | None = None,
        guardrail_version: str | None = None,
    ) -> AsyncGenerator[str, None]:
        started = time.perf_counter()

        with tracer.start_as_current_span("ai.litellm.stream") as span:
            span.set_attribute(AI_PROVIDER, "litellm")
            span.set_attribute(AI_OPERATION, "stream_generate")
            span.set_attribute(AI_MODEL, model_id)
            span.set_attribute("message_count", len(messages))

            openai_messages: list[dict[str, Any]] = [
                {"role": "system", "content": system_prompt},
                *messages,
            ]

            payload: dict[str, Any] = {
                "model": model_id,
                "messages": openai_messages,
                "stream": True,
                "max_tokens": max_tokens,
            }

            # Pass guardrail metadata if configured
            if guardrail_id and guardrail_version:
                payload["metadata"] = {
                    "guardrail_name": "bedrock-content-guard",
                    "guardrail_id": guardrail_id,
                    "guardrail_version": guardrail_version,
                }

            logger.info(
                "litellm.request",
                extra={
                    "model_id": model_id,
                    "message_count": len(openai_messages),
                    "max_tokens": max_tokens,
                },
            )

            try:
                async with self._client() as client:
                    async with client.stream(
                        "POST",
                        "/v1/chat/completions",
                        json=payload,
                    ) as response:
                        if response.status_code >= 400:
                            message = await self._read_error_message(response)
                            code, retryable = _http_status_to_error(
                                response.status_code
                            )
                            raise AIProviderError(
                                message=message,
                                retryable=retryable,
                                code=code,
                                provider="litellm",
                                operation="stream_generate",
                            )

                        total_tokens = 0
                        async for line in response.aiter_lines():
                            if not line or not line.startswith("data: "):
                                continue

                            chunk_data = line[6:].strip()
                            if chunk_data == "[DONE]":
                                break

                            try:
                                event = json.loads(chunk_data)
                            except json.JSONDecodeError:
                                continue

                            # Extract usage from streaming chunks if present
                            usage = event.get("usage")
                            if usage:
                                total_tokens = usage.get(
                                    "completion_tokens", total_tokens
                                )

                            choices = event.get("choices", [])
                            if not choices:
                                continue

                            delta = choices[0].get("delta", {})
                            content = delta.get("content")
                            if isinstance(content, str) and content:
                                yield content

                        if total_tokens:
                            span.set_attribute("output_tokens", total_tokens)
                            AI_TOKENS.labels(
                                provider="litellm",
                                model=model_id,
                                direction="output",
                            ).inc(total_tokens)

            except AIProviderError as e:
                span.set_attribute(AI_RETRYABLE, e.retryable)
                span.set_attribute(AI_ERROR_TYPE, e.code)
                raise
            except httpx.HTTPError as e:
                span.set_attribute("error", True)
                span.record_exception(e)
                span.set_attribute(AI_RETRYABLE, True)
                span.set_attribute(AI_ERROR_TYPE, "provider_unavailable")
                raise AIProviderError(
                    message="LiteLLM request failed",
                    retryable=True,
                    code="provider_unavailable",
                    provider="litellm",
                    operation="stream_generate",
                ) from e
            except Exception as e:
                span.set_attribute("error", True)
                span.record_exception(e)
                span.set_attribute(AI_RETRYABLE, False)
                span.set_attribute(AI_ERROR_TYPE, "unknown")
                raise AIProviderError(
                    message="An error occurred while generating response.",
                    retryable=False,
                    code="unknown",
                    provider="litellm",
                    operation="stream_generate",
                ) from e
            finally:
                elapsed = time.perf_counter() - started
                span.set_attribute(AI_LATENCY_MS, int(elapsed * 1000))
                AI_REQUEST_DURATION.labels(
                    provider="litellm",
                    model=model_id,
                    operation="stream_generate",
                    persona_id="",
                ).observe(elapsed)

    async def embed_texts(
        self,
        texts: list[str],
        model_id: str = "titan-embed-text-v2",
        dimensions: int = 1024,
    ) -> list[list[float]]:
        started = time.perf_counter()

        with tracer.start_as_current_span("ai.litellm.embed") as span:
            span.set_attribute(AI_PROVIDER, "litellm")
            span.set_attribute(AI_OPERATION, "embed_texts")
            span.set_attribute(AI_MODEL, model_id)
            span.set_attribute("text_count", len(texts))

            payload: dict[str, Any] = {
                "model": model_id,
                "input": texts,
            }

            if dimensions != 1024:
                payload["dimensions"] = dimensions

            try:
                async with self._client() as client:
                    response = await client.post("/v1/embeddings", json=payload)
                    if response.status_code >= 400:
                        message = await self._read_error_message(response)
                        code, retryable = _http_status_to_error(response.status_code)
                        raise AIProviderError(
                            message=message,
                            retryable=retryable,
                            code=code,
                            provider="litellm",
                            operation="embed_texts",
                        )

                    data = response.json()
                    rows = data.get("data", [])
                    embeddings = [row.get("embedding", []) for row in rows]

                    logger.info(
                        "litellm.embed_complete",
                        extra={
                            "model_id": model_id,
                            "text_count": len(texts),
                            "dimensions": dimensions,
                        },
                    )

                    return [e for e in embeddings if isinstance(e, list)]

            except AIProviderError as e:
                span.set_attribute(AI_RETRYABLE, e.retryable)
                span.set_attribute(AI_ERROR_TYPE, e.code)
                raise
            except httpx.HTTPError as e:
                span.set_attribute("error", True)
                span.record_exception(e)
                span.set_attribute(AI_RETRYABLE, True)
                span.set_attribute(AI_ERROR_TYPE, "provider_unavailable")
                raise AIProviderError(
                    message="LiteLLM embedding request failed",
                    retryable=True,
                    code="provider_unavailable",
                    provider="litellm",
                    operation="embed_texts",
                ) from e
            except Exception as e:
                span.set_attribute("error", True)
                span.record_exception(e)
                span.set_attribute(AI_RETRYABLE, False)
                span.set_attribute(AI_ERROR_TYPE, "unknown")
                raise AIProviderError(
                    message="Embedding generation failed",
                    retryable=False,
                    code="unknown",
                    provider="litellm",
                    operation="embed_texts",
                ) from e
            finally:
                elapsed = time.perf_counter() - started
                span.set_attribute(AI_LATENCY_MS, int(elapsed * 1000))
                AI_EMBEDDING_DURATION.labels(
                    provider="litellm",
                    model=model_id,
                ).observe(elapsed)


# Global adapter instance
_adapter: LiteLLMAdapter | None = None


def get_litellm_adapter(base_url: str, api_key: str) -> LiteLLMAdapter:
    """Get or create the LiteLLM adapter singleton."""
    global _adapter
    if (
        _adapter is None
        or _adapter.base_url != base_url.rstrip("/")
        or _adapter.api_key != api_key
    ):
        _adapter = LiteLLMAdapter(base_url=base_url, api_key=api_key)
    return _adapter
```

**Step 2: Run tests to verify they pass**

Run: `cd services/core-api && uv run pytest tests/adapters/test_litellm.py -v`

Expected: All tests PASS

**Step 3: Run linting and type checking**

Run: `cd /apps/mosaic-life && just validate-backend`

Expected: PASS (fix any issues before continuing)

**Step 4: Commit**

```bash
git add services/core-api/app/adapters/litellm.py
git commit -m "feat: implement LiteLLMAdapter for chat streaming and embeddings"
```

---

### Task 5: Wire LiteLLM into the provider registry

**Files:**
- Modify: `services/core-api/app/providers/registry.py`

**Step 1: Add litellm branch to `get_llm_provider()`**

In `get_llm_provider()` (around line 60), add a new branch before the `raise` at the end:

```python
if provider == "litellm":
    from ..adapters.litellm import get_litellm_adapter

    return get_litellm_adapter(
        base_url=self._settings.litellm_base_url,
        api_key=self._settings.litellm_api_key or "",
    )
```

**Step 2: Add litellm branch to `get_embedding_provider()`**

In `get_embedding_provider()` (around line 81), add a new branch before the `raise`:

```python
if provider == "litellm":
    from ..adapters.litellm import get_litellm_adapter

    return get_litellm_adapter(
        base_url=self._settings.litellm_base_url,
        api_key=self._settings.litellm_api_key or "",
    )
```

**Step 3: Update `_settings_signature()` to include litellm fields**

In `_settings_signature()` (line 174), add litellm fields to the signature tuple:

```python
def _settings_signature(settings: Settings) -> tuple[str, ...]:
    return (
        settings.ai_llm_provider,
        settings.ai_embedding_provider,
        settings.aws_region,
        settings.openai_api_key or "",
        settings.openai_base_url,
        settings.openai_chat_model,
        settings.openai_embedding_model,
        settings.litellm_base_url,
        settings.litellm_api_key or "",
    )
```

**Step 4: Commit**

```bash
git add services/core-api/app/providers/registry.py
git commit -m "feat: add litellm provider to registry"
```

---

### Task 6: Update provider selection and contract tests

**Files:**
- Modify: `services/core-api/tests/adapters/test_ai_provider_selection.py`
- Modify: `services/core-api/tests/adapters/test_provider_contracts.py`

**Step 1: Update test_ai_provider_selection.py**

Add litellm fields to ALL existing `SimpleNamespace` mocks (every `patch` call in the file needs `litellm_base_url` and `litellm_api_key` added). Then add new test methods:

Add to all existing SimpleNamespace instances:
```python
litellm_base_url="http://litellm:4000",
litellm_api_key="sk-test",
```

Add new test methods to `TestProviderSelection`:

```python
def test_litellm_llm_provider_selected(self) -> None:
    """LiteLLM should be selected for LLM provider when configured."""
    import app.adapters.litellm as litellm_module

    litellm_module._adapter = None

    with patch(
        "app.providers.registry.get_settings",
        return_value=SimpleNamespace(
            ai_llm_provider="litellm",
            ai_embedding_provider="bedrock",
            aws_region="us-east-1",
            openai_api_key=None,
            openai_base_url="https://api.openai.com/v1",
            openai_chat_model="gpt-4o-mini",
            openai_embedding_model="text-embedding-3-small",
            litellm_base_url="http://litellm:4000",
            litellm_api_key="sk-test",
        ),
    ):
        from app.adapters.litellm import LiteLLMAdapter

        llm_provider = get_llm_provider()

    assert isinstance(llm_provider, LiteLLMAdapter)

def test_litellm_embedding_provider_selected(self) -> None:
    """LiteLLM should be selected for embedding provider when configured."""
    import app.adapters.litellm as litellm_module

    litellm_module._adapter = None

    with patch(
        "app.providers.registry.get_settings",
        return_value=SimpleNamespace(
            ai_llm_provider="bedrock",
            ai_embedding_provider="litellm",
            aws_region="us-east-1",
            openai_api_key=None,
            openai_base_url="https://api.openai.com/v1",
            openai_chat_model="gpt-4o-mini",
            openai_embedding_model="text-embedding-3-small",
            litellm_base_url="http://litellm:4000",
            litellm_api_key="sk-test",
        ),
    ):
        from app.adapters.litellm import LiteLLMAdapter

        embedding_provider = get_embedding_provider()

    assert isinstance(embedding_provider, LiteLLMAdapter)

def test_defaults_to_litellm(self) -> None:
    """Default provider settings should resolve to LiteLLM."""
    import app.adapters.litellm as litellm_module

    litellm_module._adapter = None

    with patch(
        "app.providers.registry.get_settings",
        return_value=SimpleNamespace(
            ai_llm_provider="litellm",
            ai_embedding_provider="litellm",
            aws_region="us-east-1",
            openai_api_key=None,
            openai_base_url="https://api.openai.com/v1",
            openai_chat_model="gpt-4o-mini",
            openai_embedding_model="text-embedding-3-small",
            litellm_base_url="http://litellm:4000",
            litellm_api_key="sk-test",
        ),
    ):
        from app.adapters.litellm import LiteLLMAdapter

        llm_provider = get_llm_provider()
        embedding_provider = get_embedding_provider()

    assert isinstance(llm_provider, LiteLLMAdapter)
    assert isinstance(embedding_provider, LiteLLMAdapter)
```

**Step 2: Add litellm to provider contract tests**

In `test_provider_contracts.py`, add `"litellm"` to the parametrize lists and add litellm branches to each test function. Add a helper:

```python
def _litellm_provider():
    from app.adapters.litellm import LiteLLMAdapter
    return LiteLLMAdapter(base_url="http://litellm:4000", api_key="sk-test")
```

Add `"litellm"` to the `@pytest.mark.parametrize("provider_kind", ["openai", "bedrock", "litellm"])` decorators for: `test_stream_success_yields_incremental_chunks`, `test_embed_shape_and_length_contract`, `test_retryable_vs_non_retryable_error_mapping`, and `test_malformed_stream_payload_handling`.

Add litellm branches following the same mock pattern as the openai branches (since both use httpx/SSE).

Also add litellm fields to the `test_openai_auth_config_failure_contract` SimpleNamespace:
```python
litellm_base_url="http://litellm:4000",
litellm_api_key="sk-test",
```

**Step 3: Run all adapter tests**

Run: `cd services/core-api && uv run pytest tests/adapters/ -v`

Expected: All tests PASS

**Step 4: Run full validation**

Run: `cd /apps/mosaic-life && just validate-backend`

Expected: PASS

**Step 5: Commit**

```bash
git add services/core-api/tests/adapters/test_ai_provider_selection.py services/core-api/tests/adapters/test_provider_contracts.py
git commit -m "test: add litellm to provider selection and contract tests"
```

---

### Task 7: Update infrastructure configs

**Files:**
- Modify: `infra/helm/litellm/templates/configmap.yaml`
- Modify: `infra/helm/core-api/values.yaml`
- Modify: `infra/compose/litellm-config.yaml`
- Modify: `infra/compose/.env`

**Step 1: Add titan-embed-text-v2 to production LiteLLM configmap**

In `infra/helm/litellm/templates/configmap.yaml`, add after the `nova-multimodal-embeddings` entry (after line 49):

```yaml
      # Amazon Titan Embeddings via Bedrock
      - model_name: titan-embed-text-v2
        litellm_params:
          model: bedrock/amazon.titan-embed-text-v2:0
```

**Step 2: Update core-api Helm values**

In `infra/helm/core-api/values.yaml`, update the `env:` section. Add new env vars and update existing ones:

```yaml
env:
  # ... existing entries ...
  AI_LLM_PROVIDER: "litellm"
  AI_EMBEDDING_PROVIDER: "litellm"
  LITELLM_BASE_URL: "http://litellm.aiservices.svc.cluster.local:4000"
  EVOLUTION_SUMMARIZATION_MODEL_ID: "claude-sonnet-4-6"
  CHANGE_SUMMARY_MODEL_ID: "claude-haiku-4-5"
  INTENT_ANALYSIS_MODEL_ID: "claude-haiku-4-5"
  ENTITY_EXTRACTION_MODEL_ID: "claude-haiku-4-5"
```

Note: `LITELLM_API_KEY` will be injected via External Secrets (separate operational step).

**Step 3: Add titan-embed-text-v2 to local LiteLLM config**

In `infra/compose/litellm-config.yaml`, add after the llama4 entry (after line 41):

```yaml
  - model_name: titan-embed-text-v2
    litellm_params:
      model: bedrock/amazon.titan-embed-text-v2:0
```

**Step 4: Add LiteLLM env vars to docker compose .env**

In `infra/compose/.env`, add a new section:

```
# ============================================================================
# LiteLLM Configuration (for AI proxy)
# ============================================================================
AI_LLM_PROVIDER=litellm
AI_EMBEDDING_PROVIDER=litellm
LITELLM_BASE_URL=http://litellm:4000
LITELLM_API_KEY=sk-local-dev-key-1234
```

**Step 5: Commit**

```bash
git add infra/helm/litellm/templates/configmap.yaml infra/helm/core-api/values.yaml infra/compose/litellm-config.yaml infra/compose/.env
git commit -m "feat: update infrastructure configs for LiteLLM integration"
```

---

### Task 8: Create AI models documentation

**Files:**
- Create: `docs/ai-models.md`

**Step 1: Write the documentation**

```markdown
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
```

**Step 2: Commit**

```bash
git add docs/ai-models.md
git commit -m "docs: add AI models reference with LiteLLM integration details"
```

---

### Task 9: Run full test suite and validate

**Files:** None (validation only)

**Step 1: Run full backend validation**

Run: `cd /apps/mosaic-life && just validate-backend`

Expected: PASS (ruff + mypy)

**Step 2: Run all tests**

Run: `cd services/core-api && uv run pytest -v`

Expected: All tests PASS

**Step 3: Verify no regressions in adapter tests specifically**

Run: `cd services/core-api && uv run pytest tests/adapters/ -v`

Expected: All adapter tests PASS including new litellm tests

**Step 4: Final commit if any fixes were needed**

If fixes were required, commit them with an appropriate message.

---

### Operational Follow-Up (Not Code Tasks)

These are manual operational steps to complete after the code changes are merged:

1. **Create virtual key for core-api:**
   ```bash
   # Port-forward to LiteLLM
   kubectl port-forward -n aiservices svc/litellm 4000:4000

   # Generate virtual key
   curl -X POST http://localhost:4000/key/generate \
     -H "Authorization: Bearer <MASTER_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"key_alias": "core-api-prod"}'
   ```

2. **Store virtual key in AWS Secrets Manager** — add to core-api's existing secret or create a new one.

3. **Configure External Secrets** — ensure `LITELLM_API_KEY` is injected into core-api pods.

4. **Validate Bedrock guardrails status** — check if `BEDROCK_GUARDRAIL_ID` is currently set in production. If so, configure the LiteLLM guardrail config and verify end-to-end.

5. **Decommission core-api Bedrock IAM policies** — after 1 week of stable operation, remove direct Bedrock permissions from core-api's IRSA role (tracked in infrastructure repo).

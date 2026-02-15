"""Shared contract tests for AI provider implementations."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from botocore.exceptions import ClientError  # type: ignore[import-untyped]

from app.adapters.ai import AIProviderError
from app.adapters.bedrock import BedrockAdapter
from app.adapters.openai import OpenAIProvider
from app.adapters.openai import _http_status_to_error
from app.adapters.openai import _is_bedrock_model_id
from app.providers.registry import ProviderRegistry


async def _collect_chunks(async_generator):
    chunks: list[str] = []
    async for chunk in async_generator:
        chunks.append(chunk)
    return chunks


def _openai_provider() -> OpenAIProvider:
    return OpenAIProvider(
        api_key="test-key",
        base_url="https://api.openai.com/v1",
        default_chat_model="gpt-4o-mini",
        default_embedding_model="text-embedding-3-small",
    )


def _bedrock_provider() -> BedrockAdapter:
    return BedrockAdapter(region="us-east-1")


@pytest.mark.parametrize("provider_kind", ["openai", "bedrock"])
@pytest.mark.asyncio
async def test_stream_success_yields_incremental_chunks(provider_kind: str) -> None:
    """All providers should emit incremental stream chunks."""
    if provider_kind == "openai":
        provider = _openai_provider()

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

        with patch.object(provider, "_client", return_value=client_cm):
            chunks = await _collect_chunks(
                provider.stream_generate(
                    messages=[{"role": "user", "content": "Hi"}],
                    system_prompt="You are helpful",
                    model_id="gpt-4o-mini",
                )
            )

    else:
        provider = _bedrock_provider()

        async def stream_events():
            for event in [
                {"contentBlockDelta": {"delta": {"text": "Hello"}}},
                {"contentBlockDelta": {"delta": {"text": " world"}}},
                {"messageStop": {"stopReason": "end_turn"}},
            ]:
                yield event

        response = {"stream": stream_events()}

        with patch.object(provider, "_get_client") as mock_get_client:
            client = AsyncMock()
            client.converse_stream = AsyncMock(return_value=response)

            context = AsyncMock()
            context.__aenter__ = AsyncMock(return_value=client)
            context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = context

            chunks = await _collect_chunks(
                provider.stream_generate(
                    messages=[{"role": "user", "content": "Hi"}],
                    system_prompt="You are helpful",
                    model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                )
            )

    assert chunks == ["Hello", " world"]


@pytest.mark.parametrize("provider_kind", ["openai", "bedrock"])
@pytest.mark.asyncio
async def test_embed_shape_and_length_contract(provider_kind: str) -> None:
    """All providers should return one embedding vector per input text."""
    texts = ["one", "two"]

    if provider_kind == "openai":
        provider = _openai_provider()

        response = Mock(status_code=200)
        response.json.return_value = {
            "data": [
                {"embedding": [0.1, 0.2]},
                {"embedding": [0.3, 0.4]},
            ]
        }

        client = AsyncMock()
        client.post = AsyncMock(return_value=response)

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=client)
        client_cm.__aexit__ = AsyncMock(return_value=None)

        with patch.object(provider, "_client", return_value=client_cm):
            embeddings = await provider.embed_texts(texts)

    else:
        provider = _bedrock_provider()

        invoke_results = [
            {
                "body": AsyncMock(
                    read=AsyncMock(return_value=b'{"embedding":[0.1,0.2]}')
                )
            },
            {
                "body": AsyncMock(
                    read=AsyncMock(return_value=b'{"embedding":[0.3,0.4]}')
                )
            },
        ]

        client = AsyncMock()
        client.invoke_model = AsyncMock(side_effect=invoke_results)

        with patch.object(provider, "_get_client") as mock_get_client:
            context = AsyncMock()
            context.__aenter__ = AsyncMock(return_value=client)
            context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = context

            embeddings = await provider.embed_texts(texts)

    assert len(embeddings) == len(texts)
    assert all(isinstance(v, list) for v in embeddings)
    assert all(len(v) > 0 for v in embeddings)


@pytest.mark.parametrize("provider_kind", ["openai", "bedrock"])
@pytest.mark.asyncio
async def test_retryable_vs_non_retryable_error_mapping(provider_kind: str) -> None:
    """Providers should map transient and auth errors to consistent retry flags."""
    if provider_kind == "openai":
        provider = _openai_provider()

        transient = Mock(status_code=429, text="")
        transient.json.return_value = {"error": {"message": "Rate limited"}}
        auth = Mock(status_code=401, text="")
        auth.json.return_value = {"error": {"message": "Bad key"}}

        client = AsyncMock()
        client.post = AsyncMock(side_effect=[transient, auth])

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=client)
        client_cm.__aexit__ = AsyncMock(return_value=None)

        with patch.object(provider, "_client", return_value=client_cm):
            with pytest.raises(AIProviderError) as transient_exc:
                await provider.embed_texts(["one"])

            with pytest.raises(AIProviderError) as auth_exc:
                await provider.embed_texts(["one"])

        assert transient_exc.value.retryable is True
        assert transient_exc.value.code == "rate_limit"
        assert auth_exc.value.retryable is False
        assert auth_exc.value.code == "auth_error"

    else:
        provider = _bedrock_provider()

        transient_error = ClientError(
            error_response={"Error": {"Code": "ThrottlingException", "Message": "x"}},
            operation_name="InvokeModel",
        )
        auth_error = ClientError(
            error_response={"Error": {"Code": "AccessDeniedException", "Message": "x"}},
            operation_name="InvokeModel",
        )

        client = AsyncMock()
        client.invoke_model = AsyncMock(side_effect=[transient_error, auth_error])

        with patch.object(provider, "_get_client") as mock_get_client:
            context = AsyncMock()
            context.__aenter__ = AsyncMock(return_value=client)
            context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = context

            with pytest.raises(AIProviderError) as transient_exc:
                await provider.embed_texts(["one"])

            with pytest.raises(AIProviderError) as auth_exc:
                await provider.embed_texts(["one"])

        assert transient_exc.value.retryable is True
        assert transient_exc.value.code == "rate_limit"
        assert auth_exc.value.retryable is False
        assert auth_exc.value.code == "auth_error"


@pytest.mark.parametrize("provider_kind", ["openai", "bedrock"])
@pytest.mark.asyncio
async def test_malformed_stream_payload_handling(provider_kind: str) -> None:
    """Malformed stream payloads should not crash providers when valid data follows."""
    if provider_kind == "openai":
        provider = _openai_provider()

        async def mock_lines():
            for line in [
                "data: not-json",
                'data: {"choices":[{"delta":{"content":"Hello"}}]}',
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

        with patch.object(provider, "_client", return_value=client_cm):
            chunks = await _collect_chunks(
                provider.stream_generate(
                    messages=[{"role": "user", "content": "Hi"}],
                    system_prompt="You are helpful",
                    model_id="gpt-4o-mini",
                )
            )

        assert chunks == ["Hello"]

    else:
        provider = _bedrock_provider()

        async def stream_events():
            for event in [
                {"contentBlockDelta": {"delta": {}}},
                {"unexpected": {"shape": True}},
                {"contentBlockDelta": {"delta": {"text": "Hello"}}},
                {"messageStop": {"stopReason": "end_turn"}},
            ]:
                yield event

        response = {"stream": stream_events()}

        with patch.object(provider, "_get_client") as mock_get_client:
            client = AsyncMock()
            client.converse_stream = AsyncMock(return_value=response)

            context = AsyncMock()
            context.__aenter__ = AsyncMock(return_value=client)
            context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = context

            chunks = await _collect_chunks(
                provider.stream_generate(
                    messages=[{"role": "user", "content": "Hi"}],
                    system_prompt="You are helpful",
                    model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                )
            )

        assert chunks == ["Hello"]


def test_openai_auth_config_failure_contract() -> None:
    """OpenAI selection should fail with normalized auth_error when API key is missing."""
    registry = ProviderRegistry(
        settings=SimpleNamespace(
            ai_llm_provider="openai",
            ai_embedding_provider="openai",
            aws_region="us-east-1",
            openai_api_key=None,
            openai_base_url="https://api.openai.com/v1",
            openai_chat_model="gpt-4o-mini",
            openai_embedding_model="text-embedding-3-small",
            bedrock_guardrail_id=None,
            bedrock_guardrail_version=None,
        )
    )

    with pytest.raises(AIProviderError) as exc:
        registry.get_llm_provider()

    assert exc.value.code == "auth_error"
    assert exc.value.provider == "openai"


def test_openai_internal_error_mapping_helpers() -> None:
    """Sanity-check helper mappings used by OpenAI contract behavior."""
    assert _http_status_to_error(429) == ("rate_limit", True)
    assert _http_status_to_error(401) == ("auth_error", False)
    assert _is_bedrock_model_id("amazon.titan-embed-text-v2:0") is True
    assert _is_bedrock_model_id("gpt-4o-mini") is False

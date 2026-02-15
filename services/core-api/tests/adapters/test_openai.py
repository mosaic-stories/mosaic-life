"""Tests for OpenAI provider adapter."""

from unittest.mock import AsyncMock, patch

from unittest.mock import Mock

import pytest

from app.adapters.ai import AIProviderError
from app.adapters.openai import OpenAIProvider
from app.adapters.telemetry import AI_MODEL, AI_OPERATION, AI_PROVIDER


class TestOpenAIProvider:
    """Tests for OpenAIProvider."""

    @pytest.fixture
    def provider(self) -> OpenAIProvider:
        return OpenAIProvider(
            api_key="test-key",
            base_url="https://api.openai.com/v1",
            default_chat_model="gpt-4o-mini",
            default_embedding_model="text-embedding-3-small",
        )

    @pytest.mark.asyncio
    async def test_stream_generate_yields_chunks(
        self, provider: OpenAIProvider
    ) -> None:
        """Streaming response should yield content deltas."""

        async def mock_lines():
            lines = [
                'data: {"choices":[{"delta":{"content":"Hello"}}]}',
                'data: {"choices":[{"delta":{"content":" world"}}]}',
                "data: [DONE]",
            ]
            for line in lines:
                yield line

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.aiter_lines = mock_lines

        mock_stream_cm = AsyncMock()
        mock_stream_cm.__aenter__ = AsyncMock(return_value=mock_response)
        mock_stream_cm.__aexit__ = AsyncMock(return_value=None)

        mock_client = Mock()
        mock_client.stream = Mock(return_value=mock_stream_cm)

        mock_client_cm = AsyncMock()
        mock_client_cm.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cm.__aexit__ = AsyncMock(return_value=None)

        with patch.object(provider, "_client", return_value=mock_client_cm):
            chunks = []
            async for chunk in provider.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful",
                model_id="gpt-4o-mini",
            ):
                chunks.append(chunk)

        assert chunks == ["Hello", " world"]

    @pytest.mark.asyncio
    async def test_embed_texts_returns_embeddings(
        self, provider: OpenAIProvider
    ) -> None:
        """Embeddings endpoint response should parse into vectors."""

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [
                {"embedding": [0.1, 0.2, 0.3]},
                {"embedding": [0.4, 0.5, 0.6]},
            ]
        }

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        mock_client_cm = AsyncMock()
        mock_client_cm.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cm.__aexit__ = AsyncMock(return_value=None)

        with patch.object(provider, "_client", return_value=mock_client_cm):
            vectors = await provider.embed_texts(["one", "two"])

        assert vectors == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]

    @pytest.mark.asyncio
    async def test_embed_texts_raises_provider_error_on_http_failure(
        self,
        provider: OpenAIProvider,
    ) -> None:
        """HTTP failure should raise AIProviderError."""

        mock_response = Mock()
        mock_response.status_code = 429
        mock_response.json.return_value = {"error": {"message": "Rate limited"}}
        mock_response.text = ""

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        mock_client_cm = AsyncMock()
        mock_client_cm.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cm.__aexit__ = AsyncMock(return_value=None)

        with patch.object(provider, "_client", return_value=mock_client_cm):
            with pytest.raises(AIProviderError) as exc:
                await provider.embed_texts(["one"])

        assert exc.value.retryable is True
        assert "Rate limited" in exc.value.message
        assert exc.value.code == "rate_limit"
        assert exc.value.provider == "openai"
        assert exc.value.operation == "embed_texts"

    @pytest.mark.asyncio
    async def test_stream_generate_emits_normalized_telemetry(
        self, provider: OpenAIProvider
    ) -> None:
        """Streaming path should emit shared telemetry keys."""

        async def mock_lines():
            lines = [
                'data: {"choices":[{"delta":{"content":"Hello"}}]}',
                "data: [DONE]",
            ]
            for line in lines:
                yield line

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.aiter_lines = mock_lines

        mock_stream_cm = AsyncMock()
        mock_stream_cm.__aenter__ = AsyncMock(return_value=mock_response)
        mock_stream_cm.__aexit__ = AsyncMock(return_value=None)

        mock_client = Mock()
        mock_client.stream = Mock(return_value=mock_stream_cm)

        mock_client_cm = AsyncMock()
        mock_client_cm.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cm.__aexit__ = AsyncMock(return_value=None)

        mock_span = Mock()
        mock_span_cm = Mock()
        mock_span_cm.__enter__ = Mock(return_value=mock_span)
        mock_span_cm.__exit__ = Mock(return_value=None)

        with (
            patch.object(provider, "_client", return_value=mock_client_cm),
            patch(
                "app.adapters.openai.tracer.start_as_current_span",
                return_value=mock_span_cm,
            ),
        ):
            chunks = []
            async for chunk in provider.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful",
                model_id="gpt-4o-mini",
            ):
                chunks.append(chunk)

        assert chunks == ["Hello"]
        mock_span.set_attribute.assert_any_call(AI_PROVIDER, "openai")
        mock_span.set_attribute.assert_any_call(AI_OPERATION, "stream_generate")
        mock_span.set_attribute.assert_any_call(AI_MODEL, "gpt-4o-mini")


class TestOpenAIMetricsRecording:
    """Tests for Prometheus metrics recording in OpenAI adapter."""

    @pytest.fixture
    def provider(self) -> OpenAIProvider:
        return OpenAIProvider(api_key="test-key")

    @pytest.mark.asyncio
    async def test_stream_generate_records_duration_metric(
        self, provider: OpenAIProvider
    ) -> None:
        """Test that stream_generate records AI request duration metric."""

        async def mock_lines():
            lines = [
                'data: {"choices":[{"delta":{"content":"Hi"}}]}',
                "data: [DONE]",
            ]
            for line in lines:
                yield line

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.aiter_lines = mock_lines

        mock_stream_cm = AsyncMock()
        mock_stream_cm.__aenter__ = AsyncMock(return_value=mock_response)
        mock_stream_cm.__aexit__ = AsyncMock(return_value=None)

        mock_client = Mock()
        mock_client.stream = Mock(return_value=mock_stream_cm)

        mock_client_cm = AsyncMock()
        mock_client_cm.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cm.__aexit__ = AsyncMock(return_value=None)

        with (
            patch.object(provider, "_client", return_value=mock_client_cm),
            patch("app.adapters.openai.AI_REQUEST_DURATION") as mock_hist,
        ):
            async for _ in provider.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="gpt-4o-mini",
            ):
                pass

            mock_hist.labels.assert_called_once_with(
                provider="openai",
                model="gpt-4o-mini",
                operation="stream_generate",
                persona_id="",
            )
            mock_hist.labels.return_value.observe.assert_called_once()

    @pytest.mark.asyncio
    async def test_embed_texts_records_embedding_duration(
        self, provider: OpenAIProvider
    ) -> None:
        """Test that embed_texts records embedding duration metric."""

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": [{"embedding": [0.1] * 1024}]}

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        mock_client_cm = AsyncMock()
        mock_client_cm.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cm.__aexit__ = AsyncMock(return_value=None)

        with (
            patch.object(provider, "_client", return_value=mock_client_cm),
            patch("app.adapters.openai.AI_EMBEDDING_DURATION") as mock_hist,
        ):
            await provider.embed_texts(["Hello"])

            mock_hist.labels.assert_called_once_with(
                provider="openai",
                model="text-embedding-3-small",
            )
            mock_hist.labels.return_value.observe.assert_called_once()

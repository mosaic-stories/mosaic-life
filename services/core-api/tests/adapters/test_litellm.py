"""Tests for LiteLLM adapter."""

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

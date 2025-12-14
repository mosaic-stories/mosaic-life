"""Tests for Bedrock adapter."""

from unittest.mock import AsyncMock, patch

import pytest

from app.adapters.bedrock import BedrockAdapter, BedrockError, get_bedrock_adapter


class TestBedrockError:
    """Tests for BedrockError exception class."""

    def test_error_with_message(self) -> None:
        """Test error contains message."""
        error = BedrockError("Test error message")
        assert error.message == "Test error message"
        assert str(error) == "Test error message"

    def test_error_default_not_retryable(self) -> None:
        """Test error is not retryable by default."""
        error = BedrockError("Test error")
        assert error.retryable is False

    def test_error_retryable_flag(self) -> None:
        """Test error retryable flag can be set."""
        error = BedrockError("Rate limited", retryable=True)
        assert error.retryable is True


class TestBedrockAdapter:
    """Tests for BedrockAdapter."""

    @pytest.fixture
    def adapter(self) -> BedrockAdapter:
        """Create adapter instance."""
        return BedrockAdapter(region="us-east-1")

    def test_adapter_initializes(self, adapter: BedrockAdapter) -> None:
        """Test adapter initializes with region."""
        assert adapter.region == "us-east-1"

    def test_adapter_default_region(self) -> None:
        """Test adapter uses default region."""
        adapter = BedrockAdapter()
        assert adapter.region == "us-east-1"

    def test_format_messages(self, adapter: BedrockAdapter) -> None:
        """Test message formatting for Bedrock Converse API."""
        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
            {"role": "user", "content": "How are you?"},
        ]

        formatted = adapter._format_messages(messages)

        assert len(formatted) == 3
        assert formatted[0]["role"] == "user"
        assert formatted[0]["content"][0]["text"] == "Hello"
        assert formatted[1]["role"] == "assistant"
        assert formatted[1]["content"][0]["text"] == "Hi there!"
        assert formatted[2]["role"] == "user"
        assert formatted[2]["content"][0]["text"] == "How are you?"

    def test_format_messages_empty_list(self, adapter: BedrockAdapter) -> None:
        """Test formatting empty message list."""
        formatted = adapter._format_messages([])
        assert formatted == []

    @pytest.mark.asyncio
    async def test_stream_generate_yields_chunks(self, adapter: BedrockAdapter) -> None:
        """Test stream_generate yields content chunks."""

        # Create a mock async iterator for converse_stream events
        async def mock_stream_iterator():
            events = [
                {"messageStart": {"role": "assistant"}},
                {"contentBlockStart": {"start": {}}},
                {"contentBlockDelta": {"delta": {"text": "Hello"}}},
                {"contentBlockDelta": {"delta": {"text": " world"}}},
                {"contentBlockStop": {}},
                {"messageStop": {"stopReason": "end_turn"}},
                {"metadata": {"usage": {"outputTokens": 10}}},
            ]
            for event in events:
                yield event

        mock_response = {"stream": mock_stream_iterator()}

        with patch.object(adapter, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.converse_stream = AsyncMock(return_value=mock_response)

            # Set up context manager
            mock_context = AsyncMock()
            mock_context.__aenter__ = AsyncMock(return_value=mock_client)
            mock_context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = mock_context

            chunks = []
            async for chunk in adapter.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            ):
                chunks.append(chunk)

            assert "Hello" in chunks
            assert " world" in chunks
            assert len(chunks) == 2

    @pytest.mark.asyncio
    async def test_stream_generate_with_metadata(self, adapter: BedrockAdapter) -> None:
        """Test stream_generate handles metadata events."""

        async def mock_stream_iterator():
            events = [
                {"messageStart": {"role": "assistant"}},
                {"contentBlockDelta": {"delta": {"text": "Test"}}},
                {"messageStop": {"stopReason": "end_turn"}},
                {"metadata": {"usage": {"outputTokens": 42}}},
            ]
            for event in events:
                yield event

        mock_response = {"stream": mock_stream_iterator()}

        with patch.object(adapter, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.converse_stream = AsyncMock(return_value=mock_response)

            mock_context = AsyncMock()
            mock_context.__aenter__ = AsyncMock(return_value=mock_client)
            mock_context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = mock_context

            chunks = []
            async for chunk in adapter.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            ):
                chunks.append(chunk)

            # Should only yield text chunks, not metadata
            assert chunks == ["Test"]

    @pytest.mark.asyncio
    async def test_stream_generate_custom_max_tokens(
        self, adapter: BedrockAdapter
    ) -> None:
        """Test stream_generate uses custom max_tokens."""

        async def mock_stream_iterator():
            events = [
                {"contentBlockDelta": {"delta": {"text": "OK"}}},
                {"messageStop": {"stopReason": "end_turn"}},
            ]
            for event in events:
                yield event

        mock_response = {"stream": mock_stream_iterator()}
        captured_kwargs: dict = {}

        async def capture_converse(*args, **kwargs):
            nonlocal captured_kwargs
            captured_kwargs = kwargs
            return mock_response

        with patch.object(adapter, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.converse_stream = capture_converse

            mock_context = AsyncMock()
            mock_context.__aenter__ = AsyncMock(return_value=mock_client)
            mock_context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = mock_context

            chunks = []
            async for chunk in adapter.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                max_tokens=2048,
            ):
                chunks.append(chunk)

            # Verify max_tokens was included in inferenceConfig
            assert "inferenceConfig" in captured_kwargs
            assert captured_kwargs["inferenceConfig"]["maxTokens"] == 2048


class TestGetBedrockAdapter:
    """Tests for singleton getter."""

    def test_get_adapter_returns_instance(self) -> None:
        """Test get_bedrock_adapter returns an instance."""
        # Reset singleton for test
        import app.adapters.bedrock as bedrock_module

        bedrock_module._adapter = None

        adapter = get_bedrock_adapter()
        assert isinstance(adapter, BedrockAdapter)
        assert adapter.region == "us-east-1"

    def test_get_adapter_returns_same_instance(self) -> None:
        """Test get_bedrock_adapter returns singleton."""
        import app.adapters.bedrock as bedrock_module

        bedrock_module._adapter = None

        adapter1 = get_bedrock_adapter()
        adapter2 = get_bedrock_adapter()
        assert adapter1 is adapter2

    def test_get_adapter_with_custom_region(self) -> None:
        """Test get_bedrock_adapter with custom region."""
        import app.adapters.bedrock as bedrock_module

        bedrock_module._adapter = None

        adapter = get_bedrock_adapter(region="us-west-2")
        assert adapter.region == "us-west-2"


class TestGuardrailIntegration:
    """Tests for guardrail integration."""

    @pytest.fixture
    def adapter(self) -> BedrockAdapter:
        """Create adapter instance."""
        return BedrockAdapter(region="us-east-1")

    @pytest.mark.asyncio
    async def test_stream_generate_with_guardrail(
        self, adapter: BedrockAdapter
    ) -> None:
        """Test stream_generate passes guardrail config with async mode."""

        async def mock_stream_iterator():
            events = [
                {"contentBlockDelta": {"delta": {"text": "OK"}}},
                {"messageStop": {"stopReason": "end_turn"}},
            ]
            for event in events:
                yield event

        mock_response = {"stream": mock_stream_iterator()}
        captured_kwargs: dict = {}

        async def capture_converse(*args, **kwargs):
            nonlocal captured_kwargs
            captured_kwargs = kwargs
            return mock_response

        with patch.object(adapter, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.converse_stream = capture_converse

            mock_context = AsyncMock()
            mock_context.__aenter__ = AsyncMock(return_value=mock_client)
            mock_context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = mock_context

            chunks = []
            async for chunk in adapter.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                guardrail_id="gr-abc123",
                guardrail_version="1",
            ):
                chunks.append(chunk)

            # Verify guardrail config was passed with async mode
            assert "guardrailConfig" in captured_kwargs
            guardrail_config = captured_kwargs["guardrailConfig"]
            assert guardrail_config["guardrailIdentifier"] == "gr-abc123"
            assert guardrail_config["guardrailVersion"] == "1"
            assert guardrail_config["streamProcessingMode"] == "async"
            assert guardrail_config["trace"] == "enabled"

    @pytest.mark.asyncio
    async def test_stream_generate_without_guardrail(
        self, adapter: BedrockAdapter
    ) -> None:
        """Test stream_generate works without guardrail params."""

        async def mock_stream_iterator():
            events = [
                {"contentBlockDelta": {"delta": {"text": "OK"}}},
                {"messageStop": {"stopReason": "end_turn"}},
            ]
            for event in events:
                yield event

        mock_response = {"stream": mock_stream_iterator()}
        captured_kwargs: dict = {}

        async def capture_converse(*args, **kwargs):
            nonlocal captured_kwargs
            captured_kwargs = kwargs
            return mock_response

        with patch.object(adapter, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.converse_stream = capture_converse

            mock_context = AsyncMock()
            mock_context.__aenter__ = AsyncMock(return_value=mock_client)
            mock_context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = mock_context

            chunks = []
            async for chunk in adapter.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                # No guardrail params
            ):
                chunks.append(chunk)

            # Verify guardrailConfig was NOT passed
            assert "guardrailConfig" not in captured_kwargs

    @pytest.mark.asyncio
    async def test_stream_generate_guardrail_intervention(
        self, adapter: BedrockAdapter
    ) -> None:
        """Test stream_generate raises error when guardrail intervenes."""

        async def mock_stream_iterator():
            events = [
                # Some content may have streamed before intervention
                {"contentBlockDelta": {"delta": {"text": "I"}}},
                # Guardrail intervention via stopReason
                {"messageStop": {"stopReason": "guardrail_intervened"}},
            ]
            for event in events:
                yield event

        mock_response = {"stream": mock_stream_iterator()}

        with patch.object(adapter, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.converse_stream = AsyncMock(return_value=mock_response)

            mock_context = AsyncMock()
            mock_context.__aenter__ = AsyncMock(return_value=mock_client)
            mock_context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = mock_context

            with pytest.raises(BedrockError) as exc_info:
                async for _ in adapter.stream_generate(
                    messages=[{"role": "user", "content": "Harmful content"}],
                    system_prompt="You are helpful.",
                    model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                    guardrail_id="gr-abc123",
                    guardrail_version="1",
                ):
                    pass

            assert "filtered for safety" in exc_info.value.message
            assert exc_info.value.retryable is False

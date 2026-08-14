"""Tests for change summary generation."""

import asyncio
from uuid import uuid4

import pytest
from unittest.mock import MagicMock, patch

from app.services.ai_concurrency import ai_concurrency_guard
from app.services.change_summary import CHANGE_SUMMARY_CONCURRENCY


class TestGenerateChangeSummary:
    @pytest.mark.asyncio
    async def test_returns_ai_generated_summary(self):
        from app.services.change_summary import generate_change_summary

        # Mock the stream_generate to yield tokens
        async def mock_stream(*args, **kwargs):
            yield "Updated the "
            yield "introduction paragraph"

        mock_provider = MagicMock()
        mock_provider.stream_generate = MagicMock(return_value=mock_stream())

        with patch(
            "app.services.change_summary.get_provider_registry"
        ) as mock_registry:
            mock_registry.return_value.get_llm_provider.return_value = mock_provider

            result = await generate_change_summary(
                old_content="Hello world",
                new_content="Hello wonderful world",
                user_id=uuid4(),
                story_id=uuid4(),
                version_id=uuid4(),
            )
            assert result == "Updated the introduction paragraph"

    @pytest.mark.asyncio
    async def test_fallback_on_failure(self):
        """If AI fails, fall back to generic summary."""
        from app.services.change_summary import generate_change_summary

        mock_provider = MagicMock()
        mock_provider.stream_generate = MagicMock(side_effect=Exception("API error"))

        with patch(
            "app.services.change_summary.get_provider_registry"
        ) as mock_registry:
            mock_registry.return_value.get_llm_provider.return_value = mock_provider

            result = await generate_change_summary(
                old_content="Hello",
                new_content="World",
                user_id=uuid4(),
                story_id=uuid4(),
                version_id=uuid4(),
                source="manual_edit",
            )
            assert result == "Manual edit"

    @pytest.mark.asyncio
    async def test_fallback_for_ai_source(self):
        from app.services.change_summary import generate_change_summary

        mock_provider = MagicMock()
        mock_provider.stream_generate = MagicMock(side_effect=Exception("timeout"))

        with patch(
            "app.services.change_summary.get_provider_registry"
        ) as mock_registry:
            mock_registry.return_value.get_llm_provider.return_value = mock_provider

            result = await generate_change_summary(
                old_content="Hello",
                new_content="World",
                user_id=uuid4(),
                story_id=uuid4(),
                version_id=uuid4(),
                source="ai_enhancement",
            )
            assert result == "AI enhancement"

    @pytest.mark.asyncio
    async def test_fallback_for_restoration(self):
        from app.services.change_summary import generate_change_summary

        mock_provider = MagicMock()
        mock_provider.stream_generate = MagicMock(side_effect=Exception("timeout"))

        with patch(
            "app.services.change_summary.get_provider_registry"
        ) as mock_registry:
            mock_registry.return_value.get_llm_provider.return_value = mock_provider

            result = await generate_change_summary(
                old_content="Hello",
                new_content="World",
                user_id=uuid4(),
                story_id=uuid4(),
                version_id=uuid4(),
                source="restoration",
                source_version=3,
            )
            assert result == "Restored from version 3"

    @pytest.mark.asyncio
    async def test_strips_whitespace_from_result(self):
        from app.services.change_summary import generate_change_summary

        async def mock_stream(*args, **kwargs):
            yield "  Updated content  \n"

        mock_provider = MagicMock()
        mock_provider.stream_generate = MagicMock(return_value=mock_stream())

        with patch(
            "app.services.change_summary.get_provider_registry"
        ) as mock_registry:
            mock_registry.return_value.get_llm_provider.return_value = mock_provider

            result = await generate_change_summary(
                old_content="Hello",
                new_content="World",
                user_id=uuid4(),
                story_id=uuid4(),
                version_id=uuid4(),
            )
            assert result == "Updated content"

    @pytest.mark.asyncio
    async def test_fallback_for_unknown_source(self):
        """Unknown source types should fall back to 'Content updated'."""
        from app.services.change_summary import generate_change_summary

        mock_provider = MagicMock()
        mock_provider.stream_generate = MagicMock(side_effect=Exception("fail"))

        with patch(
            "app.services.change_summary.get_provider_registry"
        ) as mock_registry:
            mock_registry.return_value.get_llm_provider.return_value = mock_provider

            result = await generate_change_summary(
                old_content="Hello",
                new_content="World",
                user_id=uuid4(),
                story_id=uuid4(),
                version_id=uuid4(),
                source="unknown_source",
            )
            assert result == "Content updated"

    @pytest.mark.asyncio
    async def test_empty_ai_result_uses_fallback(self):
        """If AI returns empty string, fall back to generic summary."""
        from app.services.change_summary import generate_change_summary

        async def mock_stream(*args, **kwargs):
            yield "   "
            yield "  "

        mock_provider = MagicMock()
        mock_provider.stream_generate = MagicMock(return_value=mock_stream())

        with patch(
            "app.services.change_summary.get_provider_registry"
        ) as mock_registry:
            mock_registry.return_value.get_llm_provider.return_value = mock_provider

            result = await generate_change_summary(
                old_content="Hello",
                new_content="World",
                user_id=uuid4(),
                story_id=uuid4(),
                version_id=uuid4(),
                source="manual_edit",
            )
            assert result == "Manual edit"

    @pytest.mark.asyncio
    async def test_timeout_falls_back_without_raising(self):
        """A provider that never finishes within the configured timeout must
        fall back rather than hang or raise."""
        from app.services.change_summary import generate_change_summary

        async def mock_stream(*args, **kwargs):
            # Sleep far longer than the (patched, tiny) timeout before ever
            # yielding a token.
            await asyncio.sleep(5)
            yield "too late"

        mock_provider = MagicMock()
        mock_provider.stream_generate = MagicMock(return_value=mock_stream())

        with (
            patch("app.services.change_summary.get_settings") as mock_settings,
            patch("app.services.change_summary.get_provider_registry") as mock_registry,
        ):
            mock_settings.return_value.change_summary_timeout_seconds = 0.05
            mock_settings.return_value.change_summary_model_id = "test-model"
            mock_registry.return_value.get_llm_provider.return_value = mock_provider

            result = await generate_change_summary(
                old_content="Hello",
                new_content="World",
                user_id=uuid4(),
                story_id=uuid4(),
                version_id=uuid4(),
                source="manual_edit",
            )
            assert result == "Manual edit"

    @pytest.mark.asyncio
    async def test_concurrency_limit_falls_back_without_raising(self):
        """When the per-user concurrency guard is already saturated for the
        change_summary bucket, generate_change_summary must fall back rather
        than raise AIConcurrencyLimitError -- there is no client here to
        reject with a 429."""
        from app.services.change_summary import generate_change_summary

        user_id = uuid4()

        mock_provider = MagicMock()

        async def mock_stream(*args, **kwargs):
            yield "should never be reached"

        mock_provider.stream_generate = MagicMock(return_value=mock_stream())

        # Saturate every slot for this user's change_summary bucket before
        # calling generate_change_summary, so its internal guard acquire
        # rejects immediately.
        guards = [
            ai_concurrency_guard(
                user_id, bucket="change_summary", limit=CHANGE_SUMMARY_CONCURRENCY
            )
            for _ in range(CHANGE_SUMMARY_CONCURRENCY)
        ]
        for guard in guards:
            await guard.__aenter__()

        try:
            with patch(
                "app.services.change_summary.get_provider_registry"
            ) as mock_registry:
                mock_registry.return_value.get_llm_provider.return_value = mock_provider

                result = await generate_change_summary(
                    old_content="Hello",
                    new_content="World",
                    user_id=user_id,
                    story_id=uuid4(),
                    version_id=uuid4(),
                    source="manual_edit",
                )
                assert result == "Manual edit"
        finally:
            for guard in guards:
                await guard.__aexit__(None, None, None)


class TestFallbackSummary:
    def test_manual_edit(self):
        from app.services.change_summary import _fallback_summary

        assert _fallback_summary("manual_edit") == "Manual edit"

    def test_ai_enhancement(self):
        from app.services.change_summary import _fallback_summary

        assert _fallback_summary("ai_enhancement") == "AI enhancement"

    def test_ai_interview(self):
        from app.services.change_summary import _fallback_summary

        assert _fallback_summary("ai_interview") == "AI interview update"

    def test_restoration_with_version(self):
        from app.services.change_summary import _fallback_summary

        assert (
            _fallback_summary("restoration", source_version=5)
            == "Restored from version 5"
        )

    def test_restoration_without_version(self):
        from app.services.change_summary import _fallback_summary

        result = _fallback_summary("restoration")
        assert "Restored from version" in result

    def test_unknown_source(self):
        from app.services.change_summary import _fallback_summary

        assert _fallback_summary("totally_new_thing") == "Content updated"

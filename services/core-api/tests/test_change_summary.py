"""Tests for change summary generation."""

import pytest
from unittest.mock import MagicMock, patch


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
                source="manual_edit",
            )
            assert result == "Manual edit"


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

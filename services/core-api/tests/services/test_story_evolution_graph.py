"""Tests for Phase 6: Story Evolution graph integration.

Tests cover:
- Task 18: Graph-enriched opening message
- Task 19: Graph suggestion directive in build_system_prompt
- Task 20: Pre-summarization graph enrichment
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.config.personas import _reset_cache, build_system_prompt
from app.services.graph_context import AssembledContext, ContextMetadata


def _make_context_metadata(**overrides: object) -> ContextMetadata:
    """Return a ContextMetadata with sensible defaults."""
    defaults = dict(
        intent="general",
        intent_confidence=0.8,
        embedding_count=2,
        graph_count=1,
        filtered_count=1,
        total_latency_ms=50.0,
        graph_latency_ms=15.0,
        circuit_breaker_state="closed",
        sources=["embedding", "graph"],
    )
    defaults.update(overrides)
    return ContextMetadata(**defaults)  # type: ignore[arg-type]


def _make_assembled_context(
    formatted_context: str = "## Relevant Stories\n\n### Story excerpt 1\nA story about Uncle Jim.",
) -> AssembledContext:
    return AssembledContext(
        formatted_context=formatted_context,
        embedding_results=[],
        graph_results=[],
        metadata=_make_context_metadata(),
    )


# ---------------------------------------------------------------------------
# Task 19: Graph suggestion directive in build_system_prompt
# ---------------------------------------------------------------------------


class TestGraphSuggestionsDirective:
    """Tests for the include_graph_suggestions parameter in build_system_prompt."""

    def setup_method(self) -> None:
        _reset_cache()

    def teardown_method(self) -> None:
        _reset_cache()

    def test_graph_suggestions_not_included_by_default(self) -> None:
        """When include_graph_suggestions is False, directive is absent."""
        prompt = build_system_prompt(
            "biographer",
            "Jane",
            elicitation_mode=True,
        )
        assert prompt is not None
        assert "GRAPH CONTEXT SUGGESTIONS" not in prompt

    def test_graph_suggestions_included_when_enabled(self) -> None:
        """When include_graph_suggestions is True and elicitation_mode is True."""
        prompt = build_system_prompt(
            "biographer",
            "Jane",
            elicitation_mode=True,
            include_graph_suggestions=True,
        )
        assert prompt is not None
        assert "GRAPH CONTEXT SUGGESTIONS" in prompt
        assert "naturally weave brief" in prompt

    def test_graph_suggestions_ignored_without_elicitation_mode(self) -> None:
        """include_graph_suggestions has no effect without elicitation_mode."""
        prompt = build_system_prompt(
            "biographer",
            "Jane",
            elicitation_mode=False,
            include_graph_suggestions=True,
        )
        assert prompt is not None
        assert "GRAPH CONTEXT SUGGESTIONS" not in prompt

    def test_graph_suggestions_after_elicitation_before_story(self) -> None:
        """Graph suggestions appear after elicitation directive, before story text."""
        prompt = build_system_prompt(
            "biographer",
            "Jane",
            elicitation_mode=True,
            include_graph_suggestions=True,
            original_story_text="The summer of 1985.",
        )
        assert prompt is not None
        elicitation_pos = prompt.index("ELICITATION MODE")
        graph_pos = prompt.index("GRAPH CONTEXT SUGGESTIONS")
        story_pos = prompt.index("## Story Being Evolved")
        assert elicitation_pos < graph_pos < story_pos


# ---------------------------------------------------------------------------
# Task 18: Graph-enriched opening message
# ---------------------------------------------------------------------------


class TestGenerateOpeningMessageGraphContext:
    """Tests for generate_opening_message() with graph_context_service."""

    def _make_session(self) -> MagicMock:
        session = MagicMock()
        session.id = uuid4()
        session.story_id = uuid4()
        session.conversation_id = uuid4()
        session.created_by = uuid4()
        return session

    def _make_db_mocks(
        self, *, story_content: str = "A story about Uncle Jim."
    ) -> AsyncMock:
        """Build a mock db that returns story, legacy, and conversation objects."""
        mock_db = AsyncMock()

        story_mock = MagicMock()
        story_mock.content = story_content

        legacy_id = uuid4()
        primary_mock = MagicMock()
        primary_mock.legacy_id = legacy_id

        legacy_mock = MagicMock()
        legacy_mock.name = "John Doe"

        conv_mock = MagicMock()
        conv_mock.persona_id = "biographer"

        # Each db.execute call returns different results in sequence
        results = []
        for obj in [story_mock, primary_mock, legacy_mock, conv_mock]:
            result = MagicMock()
            result.scalar_one_or_none.return_value = obj
            results.append(result)

        mock_db.execute = AsyncMock(side_effect=results)
        return mock_db

    @pytest.mark.asyncio
    async def test_passes_graph_context_to_system_prompt(self) -> None:
        """When graph_context_service is provided, its context is used."""
        mock_graph_svc = AsyncMock()
        mock_graph_svc.assemble_context.return_value = _make_assembled_context(
            "## Graph context for opening"
        )

        mock_llm = AsyncMock()

        async def mock_stream(**kwargs: object):  # type: ignore[return]
            yield "Hello! I noticed some connections."

        mock_llm.stream_generate = mock_stream
        mock_memory = AsyncMock()

        session = self._make_session()
        mock_db = self._make_db_mocks()

        with (
            patch("app.config.personas.get_persona") as mock_get_persona,
            patch("app.config.personas.build_system_prompt") as mock_build,
        ):
            persona = MagicMock()
            persona.model_id = "test-model"
            persona.max_tokens = 1024
            mock_get_persona.return_value = persona

            mock_build.return_value = "system prompt"

            from app.services.story_evolution import generate_opening_message

            await generate_opening_message(
                db=mock_db,
                session=session,
                llm_provider=mock_llm,
                memory=mock_memory,
                graph_context_service=mock_graph_svc,
            )

            # Graph service was called
            mock_graph_svc.assemble_context.assert_called_once()

            # build_system_prompt was called with story_context and graph suggestions
            call_kwargs = mock_build.call_args
            assert call_kwargs is not None
            assert (
                call_kwargs.kwargs.get("story_context")
                == "## Graph context for opening"
            )
            assert call_kwargs.kwargs.get("include_graph_suggestions") is True

    @pytest.mark.asyncio
    async def test_works_without_graph_context_service(self) -> None:
        """When graph_context_service is None, proceeds without graph context."""
        mock_llm = AsyncMock()

        async def mock_stream(**kwargs: object):  # type: ignore[return]
            yield "Hello! Let's explore this story."

        mock_llm.stream_generate = mock_stream
        mock_memory = AsyncMock()

        session = self._make_session()
        mock_db = self._make_db_mocks()

        with (
            patch("app.config.personas.get_persona") as mock_get_persona,
            patch("app.config.personas.build_system_prompt") as mock_build,
        ):
            persona = MagicMock()
            persona.model_id = "test-model"
            persona.max_tokens = 1024
            mock_get_persona.return_value = persona

            mock_build.return_value = "system prompt"

            from app.services.story_evolution import generate_opening_message

            await generate_opening_message(
                db=mock_db,
                session=session,
                llm_provider=mock_llm,
                memory=mock_memory,
                # No graph_context_service
            )

            # build_system_prompt was called with empty story_context
            call_kwargs = mock_build.call_args
            assert call_kwargs is not None
            assert call_kwargs.kwargs.get("story_context") == ""
            assert call_kwargs.kwargs.get("include_graph_suggestions") is False

    @pytest.mark.asyncio
    async def test_graph_context_failure_does_not_block_opening(self) -> None:
        """When graph_context_service raises, opening still generates."""
        mock_graph_svc = AsyncMock()
        mock_graph_svc.assemble_context.side_effect = Exception("Neptune down")

        mock_llm = AsyncMock()

        async def mock_stream(**kwargs: object):  # type: ignore[return]
            yield "Hello!"

        mock_llm.stream_generate = mock_stream
        mock_memory = AsyncMock()

        session = self._make_session()
        mock_db = self._make_db_mocks()

        with (
            patch("app.config.personas.get_persona") as mock_get_persona,
            patch("app.config.personas.build_system_prompt") as mock_build,
        ):
            persona = MagicMock()
            persona.model_id = "test-model"
            persona.max_tokens = 1024
            mock_get_persona.return_value = persona

            mock_build.return_value = "system prompt"

            from app.services.story_evolution import generate_opening_message

            # Should not raise
            await generate_opening_message(
                db=mock_db,
                session=session,
                llm_provider=mock_llm,
                memory=mock_memory,
                graph_context_service=mock_graph_svc,
            )

            # build_system_prompt was called with empty story_context (fallback)
            call_kwargs = mock_build.call_args
            assert call_kwargs is not None
            assert call_kwargs.kwargs.get("story_context") == ""


# ---------------------------------------------------------------------------
# Task 20: Pre-summarization graph enrichment
# ---------------------------------------------------------------------------


class TestSummarizeConversationGraphContext:
    """Tests for summarize_conversation() with graph_context_service."""

    @pytest.mark.asyncio
    async def test_appends_graph_context_to_user_message(self) -> None:
        """When graph_context_service returns context, it's appended to the summary input."""
        mock_graph_svc = AsyncMock()
        mock_graph_svc.assemble_context.return_value = _make_assembled_context(
            "Connected story about the lake house."
        )

        mock_llm = AsyncMock()
        summary_text = "**New Details**\n- Uncle Jim visited the lake house."

        async def mock_stream(**kwargs: object):  # type: ignore[return]
            yield summary_text

        mock_llm.stream_generate = mock_stream

        session_id = uuid4()
        story_id = uuid4()
        user_id = uuid4()
        legacy_id = uuid4()

        # Build mock db that returns needed objects in sequence
        mock_db = AsyncMock()

        session_mock = MagicMock()
        session_mock.id = session_id
        session_mock.story_id = story_id
        session_mock.conversation_id = uuid4()
        session_mock.created_by = user_id
        session_mock.phase = "elicitation"

        story_mock = MagicMock()
        story_mock.content = "Original story content"

        primary_mock = MagicMock()
        primary_mock.legacy_id = legacy_id

        legacy_mock = MagicMock()
        legacy_mock.name = "John Doe"

        session_result = MagicMock()
        session_result.scalar_one_or_none.return_value = session_mock

        story_result = MagicMock()
        story_result.scalar_one_or_none.return_value = story_mock

        primary_result = MagicMock()
        primary_result.scalar_one_or_none.return_value = primary_mock

        legacy_result = MagicMock()
        legacy_result.scalar_one_or_none.return_value = legacy_mock

        mock_db.execute = AsyncMock(
            side_effect=[session_result, story_result, primary_result, legacy_result]
        )
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        messages = [
            {"role": "user", "content": "Tell me about Uncle Jim"},
            {"role": "assistant", "content": "What do you remember about him?"},
        ]

        with (
            patch(
                "app.services.ai.get_context_messages",
                new_callable=AsyncMock,
                return_value=messages,
            ),
            patch("app.config.settings.get_settings") as mock_settings,
        ):
            settings = MagicMock()
            settings.evolution_summarization_model_id = "test-model"
            mock_settings.return_value = settings

            from app.services.story_evolution import summarize_conversation

            result = await summarize_conversation(
                db=mock_db,
                session_id=session_id,
                story_id=story_id,
                user_id=user_id,
                llm_provider=mock_llm,
                graph_context_service=mock_graph_svc,
            )

        # Graph service was called
        mock_graph_svc.assemble_context.assert_called_once()
        # Summary was still generated
        assert result.summary_text == summary_text

    @pytest.mark.asyncio
    async def test_graph_failure_does_not_block_summarization(self) -> None:
        """When graph_context_service raises, summarization still completes."""
        mock_graph_svc = AsyncMock()
        mock_graph_svc.assemble_context.side_effect = Exception("Graph unavailable")

        mock_llm = AsyncMock()
        summary_text = "**New Details**\n- Some details."

        async def mock_stream(**kwargs: object):  # type: ignore[return]
            yield summary_text

        mock_llm.stream_generate = mock_stream

        session_id = uuid4()
        story_id = uuid4()
        user_id = uuid4()

        mock_db = AsyncMock()

        session_mock = MagicMock()
        session_mock.id = session_id
        session_mock.story_id = story_id
        session_mock.conversation_id = uuid4()
        session_mock.created_by = user_id
        session_mock.phase = "elicitation"

        story_mock = MagicMock()
        story_mock.content = "Original story"

        session_result = MagicMock()
        session_result.scalar_one_or_none.return_value = session_mock

        story_result = MagicMock()
        story_result.scalar_one_or_none.return_value = story_mock

        # The graph enrichment block will query StoryLegacy
        primary_result = MagicMock()
        primary_result.scalar_one_or_none.return_value = None  # No primary = skip graph

        mock_db.execute = AsyncMock(
            side_effect=[session_result, story_result, primary_result]
        )
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi"},
        ]

        with (
            patch(
                "app.services.ai.get_context_messages",
                new_callable=AsyncMock,
                return_value=messages,
            ),
            patch("app.config.settings.get_settings") as mock_settings,
        ):
            settings = MagicMock()
            settings.evolution_summarization_model_id = "test-model"
            mock_settings.return_value = settings

            from app.services.story_evolution import summarize_conversation

            # Should not raise
            result = await summarize_conversation(
                db=mock_db,
                session_id=session_id,
                story_id=story_id,
                user_id=user_id,
                llm_provider=mock_llm,
                graph_context_service=mock_graph_svc,
            )

        assert result.summary_text == summary_text

    @pytest.mark.asyncio
    async def test_works_without_graph_context_service(self) -> None:
        """When no graph_context_service is provided, summarization works normally."""
        mock_llm = AsyncMock()
        summary_text = "**New Details**\n- Normal summary."

        async def mock_stream(**kwargs: object):  # type: ignore[return]
            yield summary_text

        mock_llm.stream_generate = mock_stream

        session_id = uuid4()
        story_id = uuid4()
        user_id = uuid4()

        mock_db = AsyncMock()

        session_mock = MagicMock()
        session_mock.id = session_id
        session_mock.story_id = story_id
        session_mock.conversation_id = uuid4()
        session_mock.created_by = user_id
        session_mock.phase = "elicitation"

        story_mock = MagicMock()
        story_mock.content = "Original story"

        session_result = MagicMock()
        session_result.scalar_one_or_none.return_value = session_mock

        story_result = MagicMock()
        story_result.scalar_one_or_none.return_value = story_mock

        mock_db.execute = AsyncMock(side_effect=[session_result, story_result])
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        messages = [{"role": "user", "content": "Hello"}]

        with (
            patch(
                "app.services.ai.get_context_messages",
                new_callable=AsyncMock,
                return_value=messages,
            ),
            patch("app.config.settings.get_settings") as mock_settings,
        ):
            settings = MagicMock()
            settings.evolution_summarization_model_id = "test-model"
            mock_settings.return_value = settings

            from app.services.story_evolution import summarize_conversation

            result = await summarize_conversation(
                db=mock_db,
                session_id=session_id,
                story_id=story_id,
                user_id=user_id,
                llm_provider=mock_llm,
                # No graph_context_service
            )

        assert result.summary_text == summary_text

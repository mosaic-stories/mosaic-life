"""Tests for storytelling agent memory integration."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.adapters.storytelling import DefaultStorytellingAgent


class TestPrepareTurnWithMemory:
    """Tests for prepare_turn with facts and conversation memory."""

    @pytest.mark.asyncio
    async def test_includes_facts_in_system_prompt(self):
        """Test that prepare_turn fetches facts and passes them to build_system_prompt."""
        mock_llm = MagicMock()
        mock_vector_store = AsyncMock()
        mock_vector_store.retrieve_context.return_value = []
        mock_memory = AsyncMock()
        mock_memory.get_context_messages.return_value = []
        mock_guardrail = MagicMock()
        mock_guardrail.get_bedrock_guardrail.return_value = (None, None)

        agent = DefaultStorytellingAgent(
            llm_provider=mock_llm,
            vector_store=mock_vector_store,
            memory=mock_memory,
            guardrail=mock_guardrail,
        )

        mock_db = AsyncMock()
        mock_fact = MagicMock()
        mock_fact.category = "hobby"
        mock_fact.content = "Loved fishing"
        mock_fact.visibility = "private"

        with patch(
            "app.adapters.storytelling.memory_service.get_facts_for_context",
            new_callable=AsyncMock,
            return_value=[mock_fact],
        ) as mock_get_facts:
            turn = await agent.prepare_turn(
                db=mock_db,
                conversation_id=uuid4(),
                user_id=uuid4(),
                user_query="Tell me about their hobbies",
                legacy_id=uuid4(),
                persona_id="biographer",
                legacy_name="John",
            )

            mock_get_facts.assert_called_once()
            assert "Loved fishing" in turn.system_prompt


class TestPrepareTurnTracing:
    """Tests for tracing in prepare_turn."""

    @pytest.mark.asyncio
    async def test_prepare_turn_creates_span(self):
        """Test that prepare_turn creates a storytelling.prepare_turn span."""
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import (
            SimpleSpanProcessor,
            SpanExportResult,
            SpanExporter,
        )

        class _InMemoryExporter(SpanExporter):
            def __init__(self) -> None:
                self.spans: list = []

            def export(self, spans):  # type: ignore[override]
                self.spans.extend(spans)
                return SpanExportResult.SUCCESS

            def get_finished_spans(self) -> list:
                return list(self.spans)

        exporter = _InMemoryExporter()
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exporter))

        mock_llm = MagicMock()
        mock_vector_store = AsyncMock()
        mock_vector_store.retrieve_context.return_value = []
        mock_memory = AsyncMock()
        mock_memory.get_context_messages.return_value = []
        mock_guardrail = MagicMock()
        mock_guardrail.get_bedrock_guardrail.return_value = (None, None)

        agent = DefaultStorytellingAgent(
            llm_provider=mock_llm,
            vector_store=mock_vector_store,
            memory=mock_memory,
            guardrail=mock_guardrail,
        )

        mock_db = AsyncMock()
        user_id = uuid4()
        legacy_id = uuid4()

        with (
            patch(
                "app.adapters.storytelling.memory_service.get_facts_for_context",
                new_callable=AsyncMock,
                return_value=[],
            ),
            patch(
                "app.adapters.storytelling.tracer",
                provider.get_tracer("test"),
            ),
        ):
            await agent.prepare_turn(
                db=mock_db,
                conversation_id=uuid4(),
                user_id=user_id,
                user_query="Tell me about them",
                legacy_id=legacy_id,
                persona_id="biographer",
                legacy_name="John",
            )

        spans = exporter.get_finished_spans()
        span_names = [s.name for s in spans]
        assert "storytelling.prepare_turn" in span_names

        pt_span = next(s for s in spans if s.name == "storytelling.prepare_turn")
        attrs = dict(pt_span.attributes)
        assert attrs["user_id"] == str(user_id)
        assert attrs["legacy_id"] == str(legacy_id)
        assert attrs["persona_id"] == "biographer"

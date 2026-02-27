"""Tests for DefaultStorytellingAgent.prepare_turn() with graph-augmented context."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.adapters.storytelling import DefaultStorytellingAgent
from app.services.graph_context import AssembledContext, ContextMetadata


def _make_context_metadata() -> ContextMetadata:
    """Return a ContextMetadata instance with sensible defaults for testing."""
    return ContextMetadata(
        intent="biographical",
        intent_confidence=0.9,
        embedding_count=0,
        graph_count=0,
        filtered_count=0,
        total_latency_ms=42.0,
        graph_latency_ms=10.0,
        circuit_breaker_state="closed",
        sources=[],
    )


def _make_agent(
    *,
    graph_context_service: object | None = None,
) -> tuple[DefaultStorytellingAgent, AsyncMock, AsyncMock]:
    """Construct a DefaultStorytellingAgent with standard mocked dependencies.

    Returns
    -------
    agent:
        The constructed agent.
    mock_vector_store:
        The mocked VectorStore injected into the agent.
    mock_memory:
        The mocked AgentMemory injected into the agent.
    """
    mock_llm = MagicMock()
    mock_vector_store = AsyncMock()
    mock_vector_store.retrieve_context.return_value = []
    mock_memory = AsyncMock()
    mock_memory.get_context_messages.return_value = []
    mock_guardrail = MagicMock()
    mock_guardrail.get_bedrock_guardrail.return_value = (None, None)

    kwargs: dict = dict(
        llm_provider=mock_llm,
        vector_store=mock_vector_store,
        memory=mock_memory,
        guardrail=mock_guardrail,
    )
    if graph_context_service is not None:
        kwargs["graph_context_service"] = graph_context_service

    agent = DefaultStorytellingAgent(**kwargs)
    return agent, mock_vector_store, mock_memory


def _make_db() -> AsyncMock:
    """Return a mocked AsyncSession that satisfies the evolution-session query."""
    mock_db = AsyncMock()
    mock_execute_result = MagicMock()
    mock_execute_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_execute_result
    return mock_db


class TestPrepareTurnWithGraphContext:
    """Tests for prepare_turn() with optional graph_context_service integration."""

    @pytest.mark.asyncio
    async def test_uses_graph_context_when_available(self) -> None:
        """When graph_context_service is provided it is called instead of vector_store."""
        formatted = "## Graph-augmented context"
        assembled = AssembledContext(
            formatted_context=formatted,
            embedding_results=[],
            graph_results=[],
            metadata=_make_context_metadata(),
        )

        mock_graph_svc = AsyncMock()
        mock_graph_svc.assemble_context.return_value = assembled

        agent, mock_vector_store, _ = _make_agent(graph_context_service=mock_graph_svc)
        mock_db = _make_db()

        with patch(
            "app.adapters.storytelling.memory_service.get_facts_for_context",
            new_callable=AsyncMock,
            return_value=[],
        ):
            turn = await agent.prepare_turn(
                db=mock_db,
                conversation_id=uuid4(),
                user_id=uuid4(),
                user_query="Tell me about their childhood",
                legacy_id=uuid4(),
                persona_id="biographer",
                legacy_name="Jane",
            )

        # Graph service was called; vector store was NOT.
        mock_graph_svc.assemble_context.assert_called_once()
        mock_vector_store.retrieve_context.assert_not_called()

        # The formatted context from the graph service appears in the system prompt.
        assert formatted in turn.system_prompt

    @pytest.mark.asyncio
    async def test_falls_back_to_vector_store_when_no_graph_service(self) -> None:
        """When no graph_context_service is given, vector_store.retrieve_context is called."""
        agent, mock_vector_store, _ = (
            _make_agent()
        )  # graph_context_service defaults to None
        mock_db = _make_db()

        with patch(
            "app.adapters.storytelling.memory_service.get_facts_for_context",
            new_callable=AsyncMock,
            return_value=[],
        ):
            turn = await agent.prepare_turn(
                db=mock_db,
                conversation_id=uuid4(),
                user_id=uuid4(),
                user_query="What were their hobbies?",
                legacy_id=uuid4(),
                persona_id="friend",
                legacy_name="Bob",
            )

        mock_vector_store.retrieve_context.assert_called_once()
        # Turn is still successfully prepared.
        assert turn.system_prompt

    @pytest.mark.asyncio
    async def test_graph_context_failure_falls_back_to_vector_store(self) -> None:
        """When assemble_context raises, prepare_turn falls back to vector_store."""
        mock_graph_svc = AsyncMock()
        mock_graph_svc.assemble_context.side_effect = Exception("Neptune down")

        agent, mock_vector_store, _ = _make_agent(graph_context_service=mock_graph_svc)
        mock_db = _make_db()

        with patch(
            "app.adapters.storytelling.memory_service.get_facts_for_context",
            new_callable=AsyncMock,
            return_value=[],
        ):
            turn = await agent.prepare_turn(
                db=mock_db,
                conversation_id=uuid4(),
                user_id=uuid4(),
                user_query="Tell me about their travels",
                legacy_id=uuid4(),
                persona_id="biographer",
                legacy_name="Alice",
            )

        # Attempted graph service, failed, fell back to vector store.
        mock_graph_svc.assemble_context.assert_called_once()
        mock_vector_store.retrieve_context.assert_called_once()

        # Turn is still prepared successfully despite the graph failure.
        assert turn.system_prompt

    @pytest.mark.asyncio
    async def test_graph_context_passes_conversation_history(self) -> None:
        """assemble_context receives the conversation history from memory."""
        history: list[dict[str, str]] = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
        ]

        assembled = AssembledContext(
            formatted_context="## Context with history",
            embedding_results=[],
            graph_results=[],
            metadata=_make_context_metadata(),
        )

        mock_graph_svc = AsyncMock()
        mock_graph_svc.assemble_context.return_value = assembled

        agent, _, mock_memory = _make_agent(graph_context_service=mock_graph_svc)
        # Override memory to return the pre-defined conversation history.
        mock_memory.get_context_messages.return_value = history
        mock_db = _make_db()

        with patch(
            "app.adapters.storytelling.memory_service.get_facts_for_context",
            new_callable=AsyncMock,
            return_value=[],
        ):
            await agent.prepare_turn(
                db=mock_db,
                conversation_id=uuid4(),
                user_id=uuid4(),
                user_query="Tell me more",
                legacy_id=uuid4(),
                persona_id="biographer",
                legacy_name="Carol",
            )

        # Confirm assemble_context was invoked with the conversation history.
        call_kwargs = mock_graph_svc.assemble_context.call_args
        assert call_kwargs is not None

        # Support both positional and keyword argument conventions.
        passed_history = call_kwargs.kwargs.get(
            "conversation_history",
            call_kwargs.args[5] if len(call_kwargs.args) > 5 else None,
        )
        assert passed_history == history

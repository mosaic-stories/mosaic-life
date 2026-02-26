"""Tests for GraphContextService orchestrator."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from app.schemas.retrieval import ChunkResult
from app.services.circuit_breaker import CircuitBreaker
from app.services.graph_context import (
    AssembledContext,
    ContextMetadata,
    GraphContextService,
)
from app.services.graph_traversal import GraphResult
from app.services.intent_analyzer import QueryIntent


# ---------------------------------------------------------------------------
# Helpers / factories
# ---------------------------------------------------------------------------


def _make_query_intent(
    intent: str = "general",
    confidence: float = 0.85,
) -> QueryIntent:
    return QueryIntent(
        intent=intent,
        entities={
            "people": [],
            "places": [],
            "time_periods": [],
            "events": [],
            "objects": [],
        },
        confidence=confidence,
    )


def _make_chunk_result(
    story_id: UUID | None = None,
    content: str = "Some story content about a person.",
    similarity: float = 0.9,
) -> ChunkResult:
    return ChunkResult(
        chunk_id=uuid4(),
        story_id=story_id or uuid4(),
        content=content,
        similarity=similarity,
    )


def _make_graph_result(
    story_id: str | None = None,
    source_legacy_id: str | None = None,
    relevance_score: float = 0.8,
    source_type: str = "FAMILY_OF",
    hop_distance: int = 1,
) -> GraphResult:
    return GraphResult(
        story_id=story_id or str(uuid4()),
        source_legacy_id=source_legacy_id or str(uuid4()),
        relevance_score=relevance_score,
        source_type=source_type,
        hop_distance=hop_distance,
    )


def _make_llm_provider() -> MagicMock:
    """Build a mock LLMProvider."""
    provider = MagicMock()
    provider.stream_generate = MagicMock(return_value=_async_gen_chunks())
    return provider


async def _async_gen_chunks():
    """Async generator that yields JSON intent response."""
    yield '{"intent": "general", "entities": {"people": [], "places": [], "time_periods": [], "events": [], "objects": []}, "confidence": 0.85}'


def _make_graph_adapter() -> AsyncMock:
    """Build a mock GraphAdapter."""
    adapter = AsyncMock()
    adapter.get_connections = AsyncMock(return_value=[])
    adapter.get_related_stories = AsyncMock(return_value=[])
    adapter.query = AsyncMock(return_value=[])
    adapter.health_check = AsyncMock(return_value=True)
    return adapter


def _make_db_session() -> AsyncMock:
    return AsyncMock()


def _make_circuit_breaker(state: str = "closed") -> MagicMock:
    """Build a mock CircuitBreaker with configurable state."""
    cb = MagicMock(spec=CircuitBreaker)
    cb.state = state
    cb.allow_request = MagicMock(return_value=(state != "open"))
    cb.record_success = MagicMock()
    cb.record_failure = MagicMock()
    return cb


def _make_service(
    graph_adapter: AsyncMock | None = None,
    circuit_breaker: MagicMock | None = None,
    llm_provider: MagicMock | None = None,
    intent_model_id: str = "claude-haiku",
) -> GraphContextService:
    return GraphContextService(
        graph_adapter=graph_adapter,
        llm_provider=llm_provider or _make_llm_provider(),
        intent_model_id=intent_model_id,
        circuit_breaker=circuit_breaker,
    )


# ---------------------------------------------------------------------------
# Dataclass tests
# ---------------------------------------------------------------------------


class TestContextMetadataDataclass:
    """Tests for the ContextMetadata dataclass."""

    def test_create_with_all_fields(self) -> None:
        meta = ContextMetadata(
            intent="relational",
            intent_confidence=0.9,
            embedding_count=3,
            graph_count=2,
            filtered_count=2,
            total_latency_ms=150.0,
            graph_latency_ms=50.0,
            circuit_breaker_state="closed",
            sources=["embedding", "graph"],
        )
        assert meta.intent == "relational"
        assert meta.intent_confidence == 0.9
        assert meta.embedding_count == 3
        assert meta.graph_count == 2
        assert meta.filtered_count == 2
        assert meta.total_latency_ms == 150.0
        assert meta.graph_latency_ms == 50.0
        assert meta.circuit_breaker_state == "closed"
        assert meta.sources == ["embedding", "graph"]

    def test_sources_can_include_cross_legacy(self) -> None:
        meta = ContextMetadata(
            intent="cross_legacy",
            intent_confidence=0.7,
            embedding_count=2,
            graph_count=1,
            filtered_count=1,
            total_latency_ms=200.0,
            graph_latency_ms=80.0,
            circuit_breaker_state="closed",
            sources=["embedding", "graph", "cross_legacy"],
        )
        assert "cross_legacy" in meta.sources

    def test_create_with_na_circuit_breaker_state(self) -> None:
        meta = ContextMetadata(
            intent="general",
            intent_confidence=0.0,
            embedding_count=0,
            graph_count=0,
            filtered_count=0,
            total_latency_ms=10.0,
            graph_latency_ms=0.0,
            circuit_breaker_state="N/A",
            sources=[],
        )
        assert meta.circuit_breaker_state == "N/A"


class TestAssembledContextDataclass:
    """Tests for the AssembledContext dataclass."""

    def test_create_with_all_fields(self) -> None:
        chunk = _make_chunk_result()
        gr = _make_graph_result()
        meta = ContextMetadata(
            intent="general",
            intent_confidence=0.85,
            embedding_count=1,
            graph_count=1,
            filtered_count=1,
            total_latency_ms=100.0,
            graph_latency_ms=30.0,
            circuit_breaker_state="closed",
            sources=["embedding", "graph"],
        )
        ctx = AssembledContext(
            formatted_context="## Relevant Stories\n### Story excerpt 1\nContent.",
            embedding_results=[chunk],
            graph_results=[gr],
            metadata=meta,
        )
        assert isinstance(ctx.formatted_context, str)
        assert ctx.embedding_results == [chunk]
        assert ctx.graph_results == [gr]
        assert ctx.metadata is meta

    def test_empty_results_allowed(self) -> None:
        meta = ContextMetadata(
            intent="general",
            intent_confidence=0.0,
            embedding_count=0,
            graph_count=0,
            filtered_count=0,
            total_latency_ms=5.0,
            graph_latency_ms=0.0,
            circuit_breaker_state="N/A",
            sources=[],
        )
        ctx = AssembledContext(
            formatted_context="",
            embedding_results=[],
            graph_results=[],
            metadata=meta,
        )
        assert ctx.embedding_results == []
        assert ctx.graph_results == []
        assert ctx.formatted_context == ""


# ---------------------------------------------------------------------------
# assemble_context() integration tests
# ---------------------------------------------------------------------------


class TestAssembleContextParallelExecution:
    """Test that intent analysis and embedding search run in parallel."""

    @pytest.mark.asyncio
    async def test_assemble_context_calls_intent_analysis(self) -> None:
        """assemble_context() should call the intent analyzer."""
        intent = _make_query_intent()
        chunks = [_make_chunk_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        service = _make_service()

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
        ):
            result = await service.assemble_context(
                query="Tell me about grandma",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        assert isinstance(result, AssembledContext)

    @pytest.mark.asyncio
    async def test_assemble_context_calls_embedding_search(self) -> None:
        """assemble_context() should call retrieve_context for embeddings."""
        intent = _make_query_intent()
        chunks = [_make_chunk_result(), _make_chunk_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        service = _make_service()

        mock_retrieve = AsyncMock(return_value=chunks)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=mock_retrieve,
            ),
        ):
            result = await service.assemble_context(
                query="What did grandma do in Chicago?",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        mock_retrieve.assert_called_once()
        assert result.embedding_results == chunks

    @pytest.mark.asyncio
    async def test_assemble_context_intent_passed_to_metadata(self) -> None:
        """The analyzed intent should appear in the result metadata."""
        intent = _make_query_intent(intent="relational", confidence=0.92)
        chunks: list[ChunkResult] = []
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        service = _make_service()

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
        ):
            result = await service.assemble_context(
                query="Who did grandpa work with?",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        assert result.metadata.intent == "relational"
        assert result.metadata.intent_confidence == pytest.approx(0.92)


class TestAssembleContextGraphTraversal:
    """Test graph traversal integration."""

    @pytest.mark.asyncio
    async def test_assemble_context_calls_graph_traversal(self) -> None:
        """assemble_context() should call graph traversal when adapter is present."""
        intent = _make_query_intent()
        chunks: list[ChunkResult] = []
        graph_results = [_make_graph_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        service = _make_service(graph_adapter=graph_adapter)

        mock_traverse = AsyncMock(return_value=graph_results)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=mock_traverse,
            ),
            patch(
                "app.services.graph_context.GraphAccessFilter.filter_story_ids",
                new=AsyncMock(return_value=[(UUID(graph_results[0].story_id), 0.8)]),
            ),
        ):
            await service.assemble_context(
                query="Who are grandpa's colleagues?",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
                person_id="person-123",
            )

        mock_traverse.assert_called_once()

    @pytest.mark.asyncio
    async def test_assemble_context_graph_traversal_receives_intent(self) -> None:
        """Graph traversal should receive the analyzed intent."""
        intent = _make_query_intent(intent="temporal", confidence=0.88)
        chunks: list[ChunkResult] = []
        graph_results = [_make_graph_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        service = _make_service(graph_adapter=graph_adapter)

        captured_intent: list[QueryIntent] = []

        async def capturing_traverse(
            self_arg: object,
            graph_adapter_arg: object,
            intent_arg: QueryIntent,
            *args: object,
            **kwargs: object,
        ) -> list[GraphResult]:
            captured_intent.append(intent_arg)
            return graph_results

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=AsyncMock(return_value=graph_results),
            ),
            patch(
                "app.services.graph_context.GraphAccessFilter.filter_story_ids",
                new=AsyncMock(return_value=[(UUID(graph_results[0].story_id), 0.8)]),
            ),
        ):
            result = await service.assemble_context(
                query="What happened in the 1970s?",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        # The metadata intent should reflect the analyzed temporal intent
        assert result.metadata.intent == "temporal"


class TestAssembleContextAccessFilter:
    """Test access filter integration."""

    @pytest.mark.asyncio
    async def test_assemble_context_calls_access_filter_on_graph_results(
        self,
    ) -> None:
        """Access filter should be called with graph results."""
        intent = _make_query_intent()
        chunks: list[ChunkResult] = []
        graph_results = [_make_graph_result(), _make_graph_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        service = _make_service(graph_adapter=graph_adapter)

        # Filter allows first story, blocks second
        allowed_id = UUID(graph_results[0].story_id)
        mock_filter = AsyncMock(return_value=[(allowed_id, 0.8)])

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=AsyncMock(return_value=graph_results),
            ),
            patch(
                "app.services.graph_context.GraphAccessFilter.filter_story_ids",
                new=mock_filter,
            ),
        ):
            await service.assemble_context(
                query="Tell me about the family",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        mock_filter.assert_called_once()

    @pytest.mark.asyncio
    async def test_access_filter_removes_unauthorized_graph_results(self) -> None:
        """Graph results not in the filtered list should be excluded."""
        intent = _make_query_intent()
        chunks: list[ChunkResult] = []
        story_id_allowed = str(uuid4())
        story_id_blocked = str(uuid4())
        graph_results = [
            _make_graph_result(story_id=story_id_allowed),
            _make_graph_result(story_id=story_id_blocked),
        ]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        service = _make_service(graph_adapter=graph_adapter)

        # Only first story passes filtering
        mock_filter = AsyncMock(return_value=[(UUID(story_id_allowed), 0.8)])

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=AsyncMock(return_value=graph_results),
            ),
            patch(
                "app.services.graph_context.GraphAccessFilter.filter_story_ids",
                new=mock_filter,
            ),
        ):
            result = await service.assemble_context(
                query="Tell me about the family",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        result_story_ids = {gr.story_id for gr in result.graph_results}
        assert story_id_allowed in result_story_ids
        assert story_id_blocked not in result_story_ids
        assert len(result.graph_results) == 1


class TestAssembleContextMergeAndDedup:
    """Test result merging and deduplication."""

    @pytest.mark.asyncio
    async def test_results_merged_from_both_sources(self) -> None:
        """Both embedding and graph results should appear in the assembled context."""
        intent = _make_query_intent()
        chunks = [_make_chunk_result(), _make_chunk_result()]
        graph_results = [_make_graph_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        service = _make_service(graph_adapter=graph_adapter)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=AsyncMock(return_value=graph_results),
            ),
            patch(
                "app.services.graph_context.GraphAccessFilter.filter_story_ids",
                new=AsyncMock(return_value=[(UUID(graph_results[0].story_id), 0.8)]),
            ),
        ):
            result = await service.assemble_context(
                query="Any stories?",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        assert len(result.embedding_results) == 2
        assert len(result.graph_results) == 1
        assert result.metadata.embedding_count == 2
        assert result.metadata.graph_count == 1

    @pytest.mark.asyncio
    async def test_metadata_sources_includes_both_when_present(self) -> None:
        """sources list should contain both 'embedding' and 'graph' when both present."""
        intent = _make_query_intent()
        chunks = [_make_chunk_result()]
        graph_results = [_make_graph_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        service = _make_service(graph_adapter=graph_adapter)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=AsyncMock(return_value=graph_results),
            ),
            patch(
                "app.services.graph_context.GraphAccessFilter.filter_story_ids",
                new=AsyncMock(return_value=[(UUID(graph_results[0].story_id), 0.8)]),
            ),
        ):
            result = await service.assemble_context(
                query="Any stories?",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        assert "embedding" in result.metadata.sources
        assert "graph" in result.metadata.sources

    @pytest.mark.asyncio
    async def test_metadata_sources_only_embedding_when_no_graph(self) -> None:
        """sources list should only contain 'embedding' when graph returns nothing."""
        intent = _make_query_intent()
        chunks = [_make_chunk_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        service = _make_service(graph_adapter=graph_adapter)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.services.graph_context.GraphAccessFilter.filter_story_ids",
                new=AsyncMock(return_value=[]),
            ),
        ):
            result = await service.assemble_context(
                query="Any stories?",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        assert "embedding" in result.metadata.sources
        assert "graph" not in result.metadata.sources


class TestCircuitBreakerBehavior:
    """Test circuit breaker gating of graph operations."""

    @pytest.mark.asyncio
    async def test_circuit_breaker_open_prevents_graph_calls(self) -> None:
        """When circuit breaker is open, graph traversal should not be called."""
        intent = _make_query_intent()
        chunks: list[ChunkResult] = []
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        cb = _make_circuit_breaker(state="open")
        service = _make_service(graph_adapter=graph_adapter, circuit_breaker=cb)

        mock_traverse = AsyncMock(return_value=[])

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=mock_traverse,
            ),
        ):
            result = await service.assemble_context(
                query="What happened?",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        # Graph traversal should NOT have been called
        mock_traverse.assert_not_called()
        assert result.graph_results == []
        assert result.metadata.circuit_breaker_state == "open"

    @pytest.mark.asyncio
    async def test_circuit_breaker_closed_allows_graph_calls(self) -> None:
        """When circuit breaker is closed, graph traversal should proceed."""
        intent = _make_query_intent()
        chunks: list[ChunkResult] = []
        graph_results = [_make_graph_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        cb = _make_circuit_breaker(state="closed")
        service = _make_service(graph_adapter=graph_adapter, circuit_breaker=cb)

        mock_traverse = AsyncMock(return_value=graph_results)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=mock_traverse,
            ),
            patch(
                "app.services.graph_context.GraphAccessFilter.filter_story_ids",
                new=AsyncMock(return_value=[(UUID(graph_results[0].story_id), 0.8)]),
            ),
        ):
            result = await service.assemble_context(
                query="What happened?",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        mock_traverse.assert_called_once()
        assert result.metadata.circuit_breaker_state == "closed"

    @pytest.mark.asyncio
    async def test_circuit_breaker_records_success_on_successful_graph_call(
        self,
    ) -> None:
        """record_success() should be called after a successful graph traversal."""
        intent = _make_query_intent()
        chunks: list[ChunkResult] = []
        graph_results = [_make_graph_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        cb = _make_circuit_breaker(state="closed")
        service = _make_service(graph_adapter=graph_adapter, circuit_breaker=cb)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=AsyncMock(return_value=graph_results),
            ),
            patch(
                "app.services.graph_context.GraphAccessFilter.filter_story_ids",
                new=AsyncMock(return_value=[(UUID(graph_results[0].story_id), 0.8)]),
            ),
        ):
            await service.assemble_context(
                query="Tell me about grandpa.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        cb.record_success.assert_called_once()
        cb.record_failure.assert_not_called()

    @pytest.mark.asyncio
    async def test_circuit_breaker_records_failure_on_graph_exception(self) -> None:
        """record_failure() should be called when graph traversal raises an exception."""
        intent = _make_query_intent()
        chunks: list[ChunkResult] = []
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        cb = _make_circuit_breaker(state="closed")
        service = _make_service(graph_adapter=graph_adapter, circuit_breaker=cb)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=AsyncMock(side_effect=Exception("Neptune connection refused")),
            ),
        ):
            result = await service.assemble_context(
                query="Tell me about grandpa.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        cb.record_failure.assert_called_once()
        cb.record_success.assert_not_called()
        # Should gracefully fall back to embedding-only
        assert result.graph_results == []


class TestEmbeddingOnlyFallback:
    """Test graceful fallback to embedding-only when graph_adapter is None."""

    @pytest.mark.asyncio
    async def test_no_graph_adapter_returns_embedding_only(self) -> None:
        """With no graph adapter, graph_results should be empty."""
        intent = _make_query_intent()
        chunks = [_make_chunk_result(), _make_chunk_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        # graph_adapter=None → embedding-only
        service = _make_service(graph_adapter=None)

        mock_traverse = AsyncMock(return_value=[])

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=mock_traverse,
            ),
        ):
            result = await service.assemble_context(
                query="Tell me about grandpa.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        mock_traverse.assert_not_called()
        assert result.graph_results == []
        assert result.embedding_results == chunks

    @pytest.mark.asyncio
    async def test_no_graph_adapter_circuit_breaker_state_is_na(self) -> None:
        """Without a circuit breaker, metadata.circuit_breaker_state should be 'N/A'."""
        intent = _make_query_intent()
        chunks = [_make_chunk_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        service = _make_service(graph_adapter=None, circuit_breaker=None)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
        ):
            result = await service.assemble_context(
                query="Tell me about grandpa.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        assert result.metadata.circuit_breaker_state == "N/A"

    @pytest.mark.asyncio
    async def test_graph_exception_falls_back_to_embedding_only(self) -> None:
        """When graph traversal throws, result should still have embedding results."""
        intent = _make_query_intent()
        chunks = [_make_chunk_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        service = _make_service(graph_adapter=graph_adapter, circuit_breaker=None)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=AsyncMock(side_effect=TimeoutError("Graph timeout")),
            ),
        ):
            result = await service.assemble_context(
                query="Tell me about grandpa.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        assert result.graph_results == []
        assert result.embedding_results == chunks


class TestTokenBudgeting:
    """Test token-budgeted context formatting."""

    @pytest.mark.asyncio
    async def test_token_budget_respected_for_embedding_content(self) -> None:
        """Formatted context should not drastically exceed the token budget."""
        intent = _make_query_intent()
        # Large content that would exceed a small budget
        large_content = "A" * 2000
        chunks = [_make_chunk_result(content=large_content) for _ in range(10)]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        service = _make_service(graph_adapter=None)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
        ):
            # Very small budget (100 tokens)
            result_small = await service.assemble_context(
                query="Tell me everything.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
                token_budget=100,
            )
            result_large = await service.assemble_context(
                query="Tell me everything.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
                token_budget=4000,
            )

        # Small budget should produce shorter or equal output than large budget
        assert len(result_small.formatted_context) <= len(
            result_large.formatted_context
        )

    @pytest.mark.asyncio
    async def test_formatted_context_contains_story_content(self) -> None:
        """Formatted context should include actual story content text."""
        intent = _make_query_intent()
        unique_phrase = "unique-memorable-phrase-12345"
        chunks = [_make_chunk_result(content=unique_phrase)]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        service = _make_service(graph_adapter=None)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
        ):
            result = await service.assemble_context(
                query="Tell me something.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
                token_budget=4000,
            )

        assert unique_phrase in result.formatted_context

    @pytest.mark.asyncio
    async def test_formatted_context_with_graph_results_includes_graph_section(
        self,
    ) -> None:
        """When graph results are present, formatted context includes a graph section."""
        intent = _make_query_intent()
        chunks: list[ChunkResult] = []
        graph_results = [_make_graph_result(source_type="FAMILY_OF")]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        graph_adapter = _make_graph_adapter()
        service = _make_service(graph_adapter=graph_adapter)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.graph_context.GraphTraversalService.traverse",
                new=AsyncMock(return_value=graph_results),
            ),
            patch(
                "app.services.graph_context.GraphAccessFilter.filter_story_ids",
                new=AsyncMock(return_value=[(UUID(graph_results[0].story_id), 0.8)]),
            ),
        ):
            result = await service.assemble_context(
                query="Tell me about family connections.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
                token_budget=4000,
            )

        # The formatted context should mention connected stories
        assert (
            "Connected Stories" in result.formatted_context
            or len(result.graph_results) > 0
        )


class TestFormattedContextStructure:
    """Test the structure of the formatted_context output."""

    @pytest.mark.asyncio
    async def test_formatted_context_is_string(self) -> None:
        """formatted_context must always be a string."""
        intent = _make_query_intent()
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        service = _make_service(graph_adapter=None)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=[]),
            ),
        ):
            result = await service.assemble_context(
                query="Hello.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        assert isinstance(result.formatted_context, str)

    @pytest.mark.asyncio
    async def test_metadata_latencies_are_non_negative(self) -> None:
        """All latency values in metadata should be non-negative."""
        intent = _make_query_intent()
        chunks = [_make_chunk_result()]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        service = _make_service(graph_adapter=None)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
        ):
            result = await service.assemble_context(
                query="Hello.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        assert result.metadata.total_latency_ms >= 0.0
        assert result.metadata.graph_latency_ms >= 0.0

    @pytest.mark.asyncio
    async def test_embedding_section_header_present_when_chunks_exist(self) -> None:
        """The embedding section header should appear when chunks are provided."""
        intent = _make_query_intent()
        chunks = [_make_chunk_result(content="A grandmother baking bread.")]
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        service = _make_service(graph_adapter=None)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=chunks),
            ),
        ):
            result = await service.assemble_context(
                query="Baking memories.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
                token_budget=4000,
            )

        assert "## Relevant Stories" in result.formatted_context

    @pytest.mark.asyncio
    async def test_assembled_context_returns_correct_type(self) -> None:
        """assemble_context() must return an AssembledContext instance."""
        intent = _make_query_intent()
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        service = _make_service(graph_adapter=None)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=AsyncMock(return_value=intent),
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=[]),
            ),
        ):
            result = await service.assemble_context(
                query="Hello.",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
            )

        assert isinstance(result, AssembledContext)
        assert isinstance(result.metadata, ContextMetadata)
        assert isinstance(result.embedding_results, list)
        assert isinstance(result.graph_results, list)

    @pytest.mark.asyncio
    async def test_conversation_history_passed_to_intent_analyzer(self) -> None:
        """conversation_history should be forwarded to the intent analyzer."""
        intent = _make_query_intent()
        legacy_id = uuid4()
        user_id = uuid4()
        db = _make_db_session()
        service = _make_service(graph_adapter=None)

        history = [
            {"role": "user", "content": "Tell me about grandma."},
            {"role": "assistant", "content": "She was a wonderful woman."},
        ]
        mock_analyze = AsyncMock(return_value=intent)

        with (
            patch(
                "app.services.graph_context.IntentAnalyzer.analyze",
                new=mock_analyze,
            ),
            patch(
                "app.services.graph_context.retrieve_context",
                new=AsyncMock(return_value=[]),
            ),
        ):
            await service.assemble_context(
                query="What else?",
                legacy_id=legacy_id,
                user_id=user_id,
                persona_type="companion",
                db=db,
                conversation_history=history,
            )

        mock_analyze.assert_called_once()
        call_args = mock_analyze.call_args
        # conversation_history should be passed (positional or keyword)
        called_history = call_args.kwargs.get("conversation_history") or (
            call_args.args[2] if len(call_args.args) > 2 else None
        )
        assert called_history == history

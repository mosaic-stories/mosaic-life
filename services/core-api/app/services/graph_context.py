"""GraphContextService: orchestrator for graph-augmented RAG context assembly.

Combines intent analysis, embedding search, graph traversal, access filtering,
and token-budgeted context formatting into a single ``assemble_context()`` call.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING
from uuid import UUID

from opentelemetry import trace

from ..schemas.retrieval import ChunkResult
from ..services.retrieval import retrieve_context
from .circuit_breaker import CircuitBreaker
from .graph_access_filter import GraphAccessFilter
from .graph_traversal import GraphResult, GraphTraversalService
from .intent_analyzer import IntentAnalyzer, QueryIntent

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from ..adapters.ai import LLMProvider
    from ..adapters.graph_adapter import GraphAdapter
    from ..config.personas import TraversalConfig

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.graph_context")

_FALLBACK_ENTITIES: dict[str, list[str]] = {
    "people": [],
    "places": [],
    "time_periods": [],
    "events": [],
    "objects": [],
}


@dataclass
class ContextMetadata:
    """Telemetry and provenance metadata for an assembled context."""

    intent: str
    """Classified intent of the user query."""

    intent_confidence: float
    """Classifier confidence score in the range 0.0–1.0."""

    embedding_count: int
    """Number of embedding (vector search) results included."""

    graph_count: int
    """Number of graph-traversal results included after access filtering."""

    filtered_count: int
    """Number of graph results that passed access filtering (same as graph_count)."""

    total_latency_ms: float
    """Wall-clock time in milliseconds for the full assemble_context() call."""

    graph_latency_ms: float
    """Wall-clock time in milliseconds for the graph traversal + filtering phase."""

    circuit_breaker_state: str
    """State of the circuit breaker at call time: 'closed'|'open'|'half_open'|'N/A'."""

    sources: list[str] = field(default_factory=list)
    """Which source types contributed results: 'embedding', 'graph', 'cross_legacy'."""


@dataclass
class AssembledContext:
    """Result of a full graph-augmented RAG context assembly."""

    formatted_context: str
    """Ready-for-LLM prompt text, token-budgeted and structured."""

    embedding_results: list[ChunkResult]
    """Raw embedding search results (before formatting)."""

    graph_results: list[GraphResult]
    """Graph traversal results that passed access filtering."""

    metadata: ContextMetadata
    """Telemetry, counts, and provenance information."""


class GraphContextService:
    """Orchestrates the full graph-augmented RAG retrieval pipeline.

    Pipeline:
    1. Intent analysis + embedding retrieval run in parallel.
    2. Graph traversal (gated by circuit breaker) runs sequentially after intent.
    3. Graph results are access-filtered via PostgreSQL permission model.
    4. All results are merged and formatted within a token budget.

    If ``graph_adapter`` is ``None`` (or the circuit breaker is open), the service
    gracefully degrades to embedding-only retrieval without raising exceptions.
    """

    def __init__(
        self,
        graph_adapter: GraphAdapter | None,
        llm_provider: LLMProvider,
        intent_model_id: str,
        circuit_breaker: CircuitBreaker | None = None,
    ) -> None:
        self._graph_adapter = graph_adapter
        self._intent_analyzer = IntentAnalyzer(llm_provider, intent_model_id)
        self._graph_traversal = GraphTraversalService()
        self._access_filter = GraphAccessFilter()
        self._circuit_breaker = circuit_breaker

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def assemble_context(
        self,
        query: str,
        legacy_id: UUID,
        user_id: UUID,
        persona_type: str,
        db: AsyncSession,
        conversation_history: list[dict[str, str]] | None = None,
        linked_story_id: UUID | None = None,
        token_budget: int = 4000,
        legacy_name: str = "",
        person_id: str = "",
    ) -> AssembledContext:
        """Assemble a token-budgeted context blob for the given query.

        Parameters
        ----------
        query:
            The current user message.
        legacy_id:
            UUID of the legacy being browsed.
        user_id:
            UUID of the requesting user.
        persona_type:
            Persona identifier (e.g. ``"companion"``) used to look up traversal
            config.
        db:
            Active async database session.
        conversation_history:
            Optional recent message turns forwarded to the intent analyzer.
        linked_story_id:
            Optional ID of a story currently in focus (reserved for future use).
        token_budget:
            Maximum number of tokens to include in ``formatted_context``.
        legacy_name:
            Human-readable name of the legacy subject, forwarded to the intent
            analyzer.
        person_id:
            Graph node ID of the legacy subject Person node.

        Returns
        -------
        AssembledContext
            Populated with embedding results, graph results, formatted context,
            and metadata.  Never raises — failures degrade gracefully.
        """
        start = time.monotonic()

        with tracer.start_as_current_span("graph_context.assemble_context") as span:
            span.set_attribute("legacy_id", str(legacy_id))
            span.set_attribute("user_id", str(user_id))
            span.set_attribute("persona_type", persona_type)
            span.set_attribute("token_budget", token_budget)

            # 1. Parallel: intent analysis + embedding search
            intent_task = self._analyze_intent(query, legacy_name, conversation_history)
            embedding_task = self._retrieve_embeddings(db, query, legacy_id, user_id)
            intent, embedding_results = await asyncio.gather(
                intent_task, embedding_task
            )

            span.set_attribute("intent", intent.intent)
            span.set_attribute("intent_confidence", intent.confidence)
            span.set_attribute("embedding_count", len(embedding_results))

            # 2. Graph traversal (sequential — depends on intent; gated by circuit breaker)
            graph_results: list[GraphResult] = []
            graph_start = time.monotonic()

            if self._graph_adapter and self._should_attempt_graph():
                try:
                    traversal_config = self._get_traversal_config(persona_type)
                    graph_results = await asyncio.wait_for(
                        self._graph_traversal.traverse(
                            self._graph_adapter,
                            intent,
                            person_id,
                            str(legacy_id),
                            traversal_config,
                        ),
                        timeout=0.3,  # 300 ms graph traversal timeout
                    )

                    # 3. Access filter graph results
                    if graph_results:
                        story_ids_with_sources = [
                            (
                                UUID(gr.story_id),
                                UUID(gr.source_legacy_id),
                                gr.relevance_score,
                            )
                            for gr in graph_results
                        ]
                        filtered = await self._access_filter.filter_story_ids(
                            story_ids_with_sources, user_id, legacy_id, db
                        )
                        # Keep only graph results that passed filtering
                        allowed_ids = {sid for sid, _ in filtered}
                        graph_results = [
                            gr
                            for gr in graph_results
                            if UUID(gr.story_id) in allowed_ids
                        ]

                    if self._circuit_breaker:
                        self._circuit_breaker.record_success()

                except Exception as exc:
                    logger.warning(
                        "graph_context.graph_phase_failed",
                        extra={
                            "legacy_id": str(legacy_id),
                            "persona_type": persona_type,
                            "error": str(exc),
                        },
                    )
                    span.set_attribute("graph_error", str(exc))
                    graph_results = []
                    if self._circuit_breaker:
                        self._circuit_breaker.record_failure()

            graph_latency = (time.monotonic() - graph_start) * 1000

            span.set_attribute("graph_count", len(graph_results))

            # 4. Format context with token budget
            formatted_context = self._format_context(
                embedding_results, graph_results, token_budget
            )

            # 5. Build metadata
            total_latency = (time.monotonic() - start) * 1000
            sources: list[str] = []
            if embedding_results:
                sources.append("embedding")
            if graph_results:
                sources.append("graph")

            metadata = ContextMetadata(
                intent=intent.intent,
                intent_confidence=intent.confidence,
                embedding_count=len(embedding_results),
                graph_count=len(graph_results),
                filtered_count=len(graph_results),  # after filtering
                total_latency_ms=total_latency,
                graph_latency_ms=graph_latency,
                circuit_breaker_state=(
                    self._circuit_breaker.state if self._circuit_breaker else "N/A"
                ),
                sources=sources,
            )

            logger.info(
                "graph_context.assembled",
                extra={
                    "legacy_id": str(legacy_id),
                    "user_id": str(user_id),
                    "intent": intent.intent,
                    "embedding_count": metadata.embedding_count,
                    "graph_count": metadata.graph_count,
                    "total_latency_ms": round(total_latency, 2),
                    "graph_latency_ms": round(graph_latency, 2),
                    "circuit_breaker_state": metadata.circuit_breaker_state,
                },
            )

            span.set_attribute("total_latency_ms", total_latency)
            span.set_attribute("graph_latency_ms", graph_latency)

            return AssembledContext(
                formatted_context=formatted_context,
                embedding_results=embedding_results,
                graph_results=graph_results,
                metadata=metadata,
            )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _should_attempt_graph(self) -> bool:
        """Check circuit breaker before attempting graph operations.

        Returns True if the graph call should proceed, False if the circuit
        breaker is open (and not yet in half-open probe state).
        """
        if not self._circuit_breaker:
            return True
        return self._circuit_breaker.allow_request()

    async def _analyze_intent(
        self,
        query: str,
        legacy_name: str,
        conversation_history: list[dict[str, str]] | None,
    ) -> QueryIntent:
        """Wrapped intent analysis with a 500 ms timeout.

        Falls back to a 'general' intent with zero confidence on any failure.
        """
        try:
            return await asyncio.wait_for(
                self._intent_analyzer.analyze(query, legacy_name, conversation_history),
                timeout=0.5,
            )
        except Exception as exc:
            logger.warning(
                "graph_context.intent_analysis_failed",
                extra={"error": str(exc)},
            )
            return QueryIntent(
                intent="general",
                entities=dict(_FALLBACK_ENTITIES),
                confidence=0.0,
            )

    async def _retrieve_embeddings(
        self,
        db: AsyncSession,
        query: str,
        legacy_id: UUID,
        user_id: UUID,
    ) -> list[ChunkResult]:
        """Wrapped embedding retrieval with a 500 ms timeout.

        Returns an empty list on any failure.
        """
        try:
            return await asyncio.wait_for(
                retrieve_context(db, query, legacy_id, user_id),
                timeout=0.5,
            )
        except Exception as exc:
            logger.warning(
                "graph_context.embedding_retrieval_failed",
                extra={"error": str(exc)},
            )
            return []

    def _get_traversal_config(self, persona_type: str) -> TraversalConfig:
        """Return the traversal config for *persona_type*, or sensible defaults."""
        from ..config.personas import TraversalConfig, get_persona

        persona = get_persona(persona_type)
        if persona:
            return persona.traversal
        return TraversalConfig()

    def _format_context(
        self,
        embedding_results: list[ChunkResult],
        graph_results: list[GraphResult],
        token_budget: int,
    ) -> str:
        """Format results into a ready-for-LLM context string within *token_budget*.

        Budget allocation:
        - Embedding section: 60% of total budget.
        - Graph section:     30% of total budget.
        - (10% headroom for section headers and separators.)

        Token counting uses ``tiktoken`` with the ``cl100k_base`` encoding
        (used by GPT-4 / Claude family models for approximations).
        """
        import tiktoken

        enc = tiktoken.get_encoding("cl100k_base")
        sections: list[str] = []
        remaining_budget = token_budget

        # ---- Embedding results (60 % of budget) ----
        embedding_budget = int(remaining_budget * 0.6)
        if embedding_results:
            embedding_section_parts: list[str] = ["## Relevant Stories"]
            tokens_used = 0
            for i, chunk in enumerate(embedding_results, 1):
                chunk_text = f"\n### Story excerpt {i}\n{chunk.content}\n"
                chunk_tokens = len(enc.encode(chunk_text))
                if tokens_used + chunk_tokens > embedding_budget:
                    break
                embedding_section_parts.append(chunk_text)
                tokens_used += chunk_tokens
            if len(embedding_section_parts) > 1:
                sections.append("\n".join(embedding_section_parts))

        # ---- Graph results (30 % of budget) ----
        # Graph results carry story IDs and metadata; full content lookup is
        # deferred until stories are hydrated from the DB in a future iteration.
        graph_budget = int(remaining_budget * 0.3)
        if graph_results:
            graph_section_parts: list[str] = ["## Connected Stories (from graph)"]
            tokens_used = 0
            for gr in graph_results:
                line = (
                    f"\n- Story {gr.story_id}"
                    f" (via {gr.source_type}, relevance: {gr.relevance_score:.2f})"
                )
                line_tokens = len(enc.encode(line))
                if tokens_used + line_tokens > graph_budget:
                    break
                graph_section_parts.append(line)
                tokens_used += line_tokens
            if len(graph_section_parts) > 1:
                sections.append("\n".join(graph_section_parts))

        return "\n\n".join(sections)

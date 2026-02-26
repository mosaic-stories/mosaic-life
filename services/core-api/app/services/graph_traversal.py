"""Service for graph-augmented traversal of story and entity connections.

Maps QueryIntent values to targeted GraphAdapter calls, scoring and capping
results for downstream RAG retrieval.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from opentelemetry import trace

if TYPE_CHECKING:
    from ..adapters.graph_adapter import GraphAdapter
    from ..config.personas import TraversalConfig
    from .intent_analyzer import QueryIntent

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.graph_traversal")

# Relationship types used for relational (social-network) traversal
_RELATIONAL_REL_TYPES: list[str] = [
    "FAMILY_OF",
    "KNEW",
    "WORKED_WITH",
    "FRIENDS_WITH",
]

# hop_factor controls relevance decay by distance
_HOP_FACTORS: dict[int, float] = {1: 1.0, 2: 0.6}
_DEFAULT_HOP_FACTOR: float = 0.3

# Default relationship weight when the type is not listed in TraversalConfig
_DEFAULT_RELATIONSHIP_WEIGHT: float = 0.5

# Bonus added to relevance score when the result matches a query-extracted entity
_ENTITY_MATCH_BONUS: float = 0.2


@dataclass
class GraphResult:
    """A story discovered via graph traversal."""

    story_id: str
    """The story that was found."""

    source_legacy_id: str
    """Legacy that owns the story."""

    relevance_score: float
    """Computed relevance; higher values rank first."""

    source_type: str
    """Relationship name (or traversal strategy) that led to this discovery."""

    hop_distance: int
    """Number of hops from the origin node to this result."""


def _hop_factor(hop: int) -> float:
    """Return the scoring multiplier for a given hop distance."""
    return _HOP_FACTORS.get(hop, _DEFAULT_HOP_FACTOR)


def _score(
    hop: int,
    rel_type: str,
    relationship_weights: dict[str, float],
    entity_match: bool,
) -> float:
    """Compute relevance_score for a single result.

    Formula::

        relevance_score = hop_factor * relationship_weight + entity_match_bonus
    """
    weight = relationship_weights.get(rel_type, _DEFAULT_RELATIONSHIP_WEIGHT)
    bonus = _ENTITY_MATCH_BONUS if entity_match else 0.0
    return _hop_factor(hop) * weight + bonus


def _names_from_intent(intent: QueryIntent) -> set[str]:
    """Return a flat set of all entity names mentioned in the intent (lowercase)."""
    names: set[str] = set()
    for entity_list in intent.entities.values():
        for name in entity_list:
            names.add(name.lower())
    return names


def _node_matches_entity(node: dict[str, Any], entity_names: set[str]) -> bool:
    """Return True if the node's name (or id) matches any extracted entity name."""
    name_val = node.get("name") or node.get("node_id") or ""
    return str(name_val).lower() in entity_names


def _connection_to_result(
    conn: dict[str, Any],
    relationship_weights: dict[str, float],
    entity_names: set[str],
) -> GraphResult | None:
    """Try to build a GraphResult from a raw connection dict.

    Returns None if the connection does not have enough data to form a result
    (e.g. missing story_id).
    """
    story_id = str(conn.get("story_id", ""))
    if not story_id:
        return None

    legacy_id = str(conn.get("legacy_id", ""))
    rel_type = str(conn.get("relationship", "general"))
    hop = int(conn.get("hop") or 1)
    entity_match = _node_matches_entity(conn, entity_names)

    return GraphResult(
        story_id=story_id,
        source_legacy_id=legacy_id,
        relevance_score=_score(hop, rel_type, relationship_weights, entity_match),
        source_type=rel_type,
        hop_distance=hop,
    )


def _deduplicate_and_cap(
    results: list[GraphResult],
    max_graph_results: int,
) -> list[GraphResult]:
    """Remove duplicates (by story_id), sort by relevance descending, cap."""
    seen: set[str] = set()
    unique: list[GraphResult] = []
    for r in results:
        if r.story_id not in seen:
            seen.add(r.story_id)
            unique.append(r)
    unique.sort(key=lambda r: r.relevance_score, reverse=True)
    return unique[:max_graph_results]


class GraphTraversalService:
    """Maps QueryIntent to graph traversal calls and returns scored GraphResults.

    All graph adapter calls are wrapped in try/except to ensure graceful
    degradation: any adapter failure produces an empty result list rather than
    propagating the exception to callers.
    """

    async def traverse(
        self,
        graph_adapter: GraphAdapter,
        intent: QueryIntent,
        person_id: str,
        legacy_id: str,
        traversal_config: TraversalConfig,
    ) -> list[GraphResult]:
        """Execute the graph traversal strategy matching *intent.intent*.

        Parameters
        ----------
        graph_adapter:
            Adapter providing access to the graph database.
        intent:
            Classified intent and extracted entities for the current query.
        person_id:
            Graph node ID for the legacy subject (Person node).
        legacy_id:
            Graph node ID for the legacy (Legacy node).
        traversal_config:
            Persona-specific traversal settings (hops, weights, caps, etc.).

        Returns
        -------
        list[GraphResult]
            Scored, deduplicated, and capped results sorted by relevance
            descending.  Returns an empty list on any adapter failure.
        """
        with tracer.start_as_current_span("graph_traversal.traverse") as span:
            span.set_attribute("intent", intent.intent)
            span.set_attribute("person_id", person_id)
            span.set_attribute("legacy_id", legacy_id)
            span.set_attribute("max_hops", traversal_config.max_hops)

            strategy = intent.intent

            try:
                if strategy == "relational":
                    results = await self._traverse_relational(
                        graph_adapter, intent, person_id, traversal_config
                    )
                elif strategy == "temporal":
                    results = await self._traverse_temporal(
                        graph_adapter, intent, person_id, traversal_config
                    )
                elif strategy == "spatial":
                    results = await self._traverse_spatial(
                        graph_adapter, intent, person_id, traversal_config
                    )
                elif strategy == "entity_focused":
                    results = await self._traverse_entity_focused(
                        graph_adapter, intent, person_id, traversal_config
                    )
                elif strategy == "cross_legacy":
                    results = await self._traverse_cross_legacy(
                        graph_adapter, intent, legacy_id, traversal_config
                    )
                else:
                    # "general" and any unknown intent fall through to 1-hop
                    results = await self._traverse_general(
                        graph_adapter, intent, person_id, traversal_config
                    )

            except Exception as exc:
                logger.warning(
                    "graph_traversal.failed",
                    extra={
                        "intent": strategy,
                        "person_id": person_id,
                        "legacy_id": legacy_id,
                        "error": str(exc),
                    },
                )
                span.set_attribute("error", str(exc))
                return []

            final = _deduplicate_and_cap(results, traversal_config.max_graph_results)

            span.set_attribute("results_count", len(final))
            logger.info(
                "graph_traversal.completed",
                extra={
                    "intent": strategy,
                    "person_id": person_id,
                    "legacy_id": legacy_id,
                    "results_count": len(final),
                },
            )
            return final

    # ------------------------------------------------------------------
    # Private strategy methods
    # ------------------------------------------------------------------

    async def _traverse_relational(
        self,
        graph_adapter: GraphAdapter,
        intent: QueryIntent,
        person_id: str,
        config: TraversalConfig,
    ) -> list[GraphResult]:
        """Traverse social-network relationships from the person node.

        1. Get all Person connections via social rel_types.
        2. Optionally filter by names mentioned in the intent.
        3. For each connected Person, call get_related_stories and score.
        """
        entity_names = _names_from_intent(intent)
        intent_people = {n.lower() for n in intent.entities.get("people", [])}

        connections = await graph_adapter.get_connections(
            label="Person",
            node_id=person_id,
            rel_types=_RELATIONAL_REL_TYPES,
            depth=config.max_hops,
        )

        results: list[GraphResult] = []

        for conn in connections:
            # If the intent names specific people, filter to matching connections
            conn_name = str(conn.get("name", "")).lower()
            if intent_people and conn_name not in intent_people:
                continue

            rel_type = str(conn.get("relationship", "KNEW"))
            hop_val: Any = conn.get("hop", 1)
            hop = int(hop_val)
            entity_match = conn_name in entity_names if entity_names else False

            # First check if the connection itself carries a story_id
            if conn.get("story_id"):
                result = _connection_to_result(
                    conn, config.relationship_weights, entity_names
                )
                if result:
                    results.append(result)
                continue

            # Otherwise look up related stories for this person node
            connected_node_id = str(conn.get("node_id", ""))
            if not connected_node_id:
                continue

            related = await graph_adapter.get_related_stories(
                story_id=connected_node_id,
            )
            for story in related:
                story_id = str(story.get("story_id", ""))
                if not story_id:
                    continue
                legacy_id = str(story.get("legacy_id", ""))
                score = _score(hop, rel_type, config.relationship_weights, entity_match)
                results.append(
                    GraphResult(
                        story_id=story_id,
                        source_legacy_id=legacy_id,
                        relevance_score=score,
                        source_type=rel_type,
                        hop_distance=hop,
                    )
                )

        return results

    async def _traverse_temporal(
        self,
        graph_adapter: GraphAdapter,
        intent: QueryIntent,
        person_id: str,
        config: TraversalConfig,
    ) -> list[GraphResult]:
        """Traverse connections with temporal metadata matching intent time_periods."""
        entity_names = _names_from_intent(intent)
        time_periods = {t.lower() for t in intent.entities.get("time_periods", [])}

        connections = await graph_adapter.get_connections(
            label="Person",
            node_id=person_id,
            depth=config.max_hops,
        )

        results: list[GraphResult] = []
        for conn in connections:
            # Apply temporal filter when time_periods are specified
            if time_periods:
                period_val = str(conn.get("period", "")).lower()
                # Check the node name too as some implementations store period there
                name_val = str(conn.get("name", "")).lower()
                if not any(tp in period_val or tp in name_val for tp in time_periods):
                    continue

            result = _connection_to_result(
                conn, config.relationship_weights, entity_names
            )
            if result:
                results.append(result)

        return results

    async def _traverse_spatial(
        self,
        graph_adapter: GraphAdapter,
        intent: QueryIntent,
        person_id: str,
        config: TraversalConfig,
    ) -> list[GraphResult]:
        """Traverse Place nodes connected to the person node."""
        entity_names = _names_from_intent(intent)
        intent_places = {p.lower() for p in intent.entities.get("places", [])}

        connections = await graph_adapter.get_connections(
            label="Person",
            node_id=person_id,
            depth=config.max_hops,
        )

        results: list[GraphResult] = []
        for conn in connections:
            label = str(conn.get("label", "")).lower()
            conn_name = str(conn.get("name", "")).lower()

            # Only consider Place nodes
            if label != "place":
                continue

            # If the intent names specific places, filter to matches
            if intent_places and conn_name not in intent_places:
                continue

            result = _connection_to_result(
                conn, config.relationship_weights, entity_names
            )
            if result:
                results.append(result)

        return results

    async def _traverse_entity_focused(
        self,
        graph_adapter: GraphAdapter,
        intent: QueryIntent,
        person_id: str,
        config: TraversalConfig,
    ) -> list[GraphResult]:
        """Traverse connections looking for matching entity nodes."""
        entity_names = _names_from_intent(intent)

        connections = await graph_adapter.get_connections(
            label="Person",
            node_id=person_id,
            depth=config.max_hops,
        )

        results: list[GraphResult] = []
        for conn in connections:
            result = _connection_to_result(
                conn, config.relationship_weights, entity_names
            )
            if result:
                results.append(result)

        return results

    async def _traverse_cross_legacy(
        self,
        graph_adapter: GraphAdapter,
        intent: QueryIntent,
        legacy_id: str,
        config: TraversalConfig,
    ) -> list[GraphResult]:
        """Traverse LINKED_TO relationships from the Legacy node.

        Only executed when ``config.include_cross_legacy`` is True.
        """
        if not config.include_cross_legacy:
            return []

        entity_names = _names_from_intent(intent)

        connections = await graph_adapter.get_connections(
            label="Legacy",
            node_id=legacy_id,
            rel_types=["LINKED_TO"],
            depth=1,
        )

        results: list[GraphResult] = []
        for conn in connections:
            result = _connection_to_result(
                conn, config.relationship_weights, entity_names
            )
            if result:
                results.append(result)

        return results

    async def _traverse_general(
        self,
        graph_adapter: GraphAdapter,
        intent: QueryIntent,
        person_id: str,
        config: TraversalConfig,
    ) -> list[GraphResult]:
        """Simple 1-hop neighborhood query, no filtering."""
        entity_names = _names_from_intent(intent)

        connections = await graph_adapter.get_connections(
            label="Person",
            node_id=person_id,
            depth=1,
        )

        results: list[GraphResult] = []
        for conn in connections:
            result = _connection_to_result(
                conn, config.relationship_weights, entity_names
            )
            if result:
                results.append(result)

        return results

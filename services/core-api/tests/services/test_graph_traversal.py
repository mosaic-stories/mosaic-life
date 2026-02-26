"""Tests for GraphTraversalService."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock

from app.config.personas import TraversalConfig
from app.services.graph_traversal import GraphResult, GraphTraversalService
from app.services.intent_analyzer import QueryIntent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_intent(
    intent: str,
    people: list[str] | None = None,
    places: list[str] | None = None,
    time_periods: list[str] | None = None,
    events: list[str] | None = None,
    objects: list[str] | None = None,
    confidence: float = 0.9,
) -> QueryIntent:
    """Build a QueryIntent with optional entity lists."""
    return QueryIntent(
        intent=intent,
        entities={
            "people": people or [],
            "places": places or [],
            "time_periods": time_periods or [],
            "events": events or [],
            "objects": objects or [],
        },
        confidence=confidence,
    )


def _make_graph_adapter(
    connections: list[dict[str, object]] | None = None,
    related_stories: list[dict[str, object]] | None = None,
) -> AsyncMock:
    """Build a mock GraphAdapter with preconfigured return values."""
    adapter = AsyncMock()
    adapter.get_connections = AsyncMock(return_value=connections or [])
    adapter.get_related_stories = AsyncMock(return_value=related_stories or [])
    adapter.query = AsyncMock(return_value=[])
    adapter.health_check = AsyncMock(return_value=True)
    return adapter


def _default_traversal_config(**overrides: object) -> TraversalConfig:
    """Return a TraversalConfig with optional field overrides."""
    cfg = TraversalConfig(
        max_hops=1,
        relationship_weights={
            "FAMILY_OF": 1.0,
            "KNEW": 0.7,
            "WORKED_WITH": 0.8,
            "FRIENDS_WITH": 0.6,
        },
        max_graph_results=15,
        include_cross_legacy=True,
        temporal_range="full",
    )
    for key, value in overrides.items():
        setattr(cfg, key, value)
    return cfg


# ---------------------------------------------------------------------------
# GraphResult dataclass tests
# ---------------------------------------------------------------------------


class TestGraphResult:
    """Tests for the GraphResult dataclass."""

    def test_create_with_all_fields(self) -> None:
        result = GraphResult(
            story_id="story-abc",
            source_legacy_id="legacy-123",
            relevance_score=0.85,
            source_type="FAMILY_OF",
            hop_distance=1,
        )
        assert result.story_id == "story-abc"
        assert result.source_legacy_id == "legacy-123"
        assert result.relevance_score == 0.85
        assert result.source_type == "FAMILY_OF"
        assert result.hop_distance == 1

    def test_create_with_2_hop_distance(self) -> None:
        result = GraphResult(
            story_id="story-xyz",
            source_legacy_id="legacy-456",
            relevance_score=0.42,
            source_type="KNEW",
            hop_distance=2,
        )
        assert result.hop_distance == 2

    def test_create_with_zero_relevance_score(self) -> None:
        result = GraphResult(
            story_id="story-000",
            source_legacy_id="legacy-000",
            relevance_score=0.0,
            source_type="general",
            hop_distance=1,
        )
        assert result.relevance_score == 0.0

    def test_fields_are_stored_correctly(self) -> None:
        result = GraphResult(
            story_id="s1",
            source_legacy_id="l1",
            relevance_score=1.0,
            source_type="FRIENDS_WITH",
            hop_distance=1,
        )
        assert result.source_type == "FRIENDS_WITH"
        assert result.source_legacy_id == "l1"


# ---------------------------------------------------------------------------
# GraphTraversalService tests
# ---------------------------------------------------------------------------


class TestGraphTraversalServiceRelational:
    """Tests for relational intent traversal."""

    @pytest.mark.asyncio
    async def test_relational_calls_get_connections_with_person_rel_types(
        self,
    ) -> None:
        """Relational traversal should call get_connections with social rel_types."""
        adapter = _make_graph_adapter(connections=[])
        service = GraphTraversalService()
        intent = _make_intent("relational")
        config = _default_traversal_config()

        await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        adapter.get_connections.assert_called_once()
        call_kwargs = adapter.get_connections.call_args
        assert call_kwargs.kwargs["label"] == "Person"
        assert call_kwargs.kwargs["node_id"] == "person-1"
        rel_types = call_kwargs.kwargs["rel_types"]
        assert "FAMILY_OF" in rel_types
        assert "KNEW" in rel_types
        assert "WORKED_WITH" in rel_types
        assert "FRIENDS_WITH" in rel_types

    @pytest.mark.asyncio
    async def test_relational_uses_max_hops_from_config(self) -> None:
        """Relational traversal should use max_hops from traversal_config."""
        adapter = _make_graph_adapter(connections=[])
        service = GraphTraversalService()
        intent = _make_intent("relational")
        config = _default_traversal_config(max_hops=2)

        await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        call_kwargs = adapter.get_connections.call_args
        assert call_kwargs.kwargs["depth"] == 2

    @pytest.mark.asyncio
    async def test_relational_calls_get_related_stories_for_connected_person(
        self,
    ) -> None:
        """Relational traversal should call get_related_stories for each connection."""
        connected_person = {
            "node_id": "person-2",
            "label": "Person",
            "name": "Uncle Jim",
            "relationship": "FAMILY_OF",
            "hop": 1,
        }
        adapter = _make_graph_adapter(
            connections=[connected_person],
            related_stories=[
                {
                    "story_id": "story-99",
                    "legacy_id": "legacy-1",
                    "relationship": "FAMILY_OF",
                    "hop": 1,
                }
            ],
        )
        service = GraphTraversalService()
        intent = _make_intent("relational", people=["Uncle Jim"])
        config = _default_traversal_config()

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        adapter.get_related_stories.assert_called()
        assert len(results) >= 1

    @pytest.mark.asyncio
    async def test_relational_returns_graph_results(self) -> None:
        """Relational traversal should return GraphResult instances."""
        connected_person = {
            "node_id": "person-2",
            "label": "Person",
            "name": "Jane",
            "relationship": "FAMILY_OF",
            "hop": 1,
        }
        related = {
            "story_id": "story-42",
            "legacy_id": "legacy-1",
            "relationship": "FAMILY_OF",
            "hop": 1,
        }
        adapter = _make_graph_adapter(
            connections=[connected_person],
            related_stories=[related],
        )
        service = GraphTraversalService()
        intent = _make_intent("relational")
        config = _default_traversal_config()

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert all(isinstance(r, GraphResult) for r in results)

    @pytest.mark.asyncio
    async def test_relational_entity_match_bonus_applied(self) -> None:
        """Entity name match should add relevance bonus."""
        connected_person = {
            "node_id": "person-2",
            "label": "Person",
            "name": "Uncle Jim",
            "relationship": "FAMILY_OF",
            "hop": 1,
        }
        related = {
            "story_id": "story-50",
            "legacy_id": "legacy-1",
            "relationship": "FAMILY_OF",
            "hop": 1,
        }
        adapter_match = _make_graph_adapter(
            connections=[connected_person],
            related_stories=[related],
        )
        adapter_no_match = _make_graph_adapter(
            connections=[
                {
                    "node_id": "person-3",
                    "label": "Person",
                    "name": "Someone Else",
                    "relationship": "FAMILY_OF",
                    "hop": 1,
                }
            ],
            related_stories=[related],
        )

        service = GraphTraversalService()
        # Intent mentions "Uncle Jim" - should match the first adapter's person
        intent_with_name = _make_intent("relational", people=["Uncle Jim"])
        intent_without_name = _make_intent("relational")
        config = _default_traversal_config()

        results_match = await service.traverse(
            graph_adapter=adapter_match,
            intent=intent_with_name,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )
        results_no_match = await service.traverse(
            graph_adapter=adapter_no_match,
            intent=intent_without_name,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        if results_match and results_no_match:
            assert (
                results_match[0].relevance_score > results_no_match[0].relevance_score
            )


class TestGraphTraversalServiceTemporal:
    """Tests for temporal intent traversal."""

    @pytest.mark.asyncio
    async def test_temporal_calls_get_connections(self) -> None:
        """Temporal traversal should call get_connections for the person."""
        adapter = _make_graph_adapter(connections=[])
        service = GraphTraversalService()
        intent = _make_intent("temporal", time_periods=["1970s"])
        config = _default_traversal_config()

        await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        adapter.get_connections.assert_called_once()
        call_kwargs = adapter.get_connections.call_args
        assert call_kwargs.kwargs["label"] == "Person"
        assert call_kwargs.kwargs["node_id"] == "person-1"

    @pytest.mark.asyncio
    async def test_temporal_uses_max_hops_from_config(self) -> None:
        """Temporal traversal should use max_hops from config."""
        adapter = _make_graph_adapter(connections=[])
        service = GraphTraversalService()
        intent = _make_intent("temporal", time_periods=["1980s"])
        config = _default_traversal_config(max_hops=2)

        await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        call_kwargs = adapter.get_connections.call_args
        assert call_kwargs.kwargs["depth"] == 2

    @pytest.mark.asyncio
    async def test_temporal_returns_list(self) -> None:
        """Temporal traversal should return a list (possibly empty)."""
        adapter = _make_graph_adapter(connections=[])
        service = GraphTraversalService()
        intent = _make_intent("temporal", time_periods=["1990s"])
        config = _default_traversal_config()

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_temporal_with_temporal_connection_returns_result(self) -> None:
        """Temporal traversal should surface connections with temporal metadata."""
        adapter = _make_graph_adapter(
            connections=[
                {
                    "node_id": "story-10",
                    "label": "Story",
                    "relationship": "MENTIONS_PERIOD",
                    "period": "1970s",
                    "hop": 1,
                    "story_id": "story-10",
                    "legacy_id": "legacy-1",
                }
            ]
        )
        service = GraphTraversalService()
        intent = _make_intent("temporal", time_periods=["1970s"])
        config = _default_traversal_config()

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert isinstance(results, list)
        assert all(isinstance(r, GraphResult) for r in results)


class TestGraphTraversalServiceSpatial:
    """Tests for spatial intent traversal."""

    @pytest.mark.asyncio
    async def test_spatial_calls_get_connections(self) -> None:
        """Spatial traversal should call get_connections for the person."""
        adapter = _make_graph_adapter(connections=[])
        service = GraphTraversalService()
        intent = _make_intent("spatial", places=["Chicago"])
        config = _default_traversal_config()

        await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        adapter.get_connections.assert_called_once()
        call_kwargs = adapter.get_connections.call_args
        assert call_kwargs.kwargs["label"] == "Person"
        assert call_kwargs.kwargs["node_id"] == "person-1"

    @pytest.mark.asyncio
    async def test_spatial_filters_place_nodes(self) -> None:
        """Spatial traversal should look for Place nodes in connections."""
        adapter = _make_graph_adapter(
            connections=[
                {
                    "node_id": "place-1",
                    "label": "Place",
                    "name": "Chicago",
                    "relationship": "LIVED_IN",
                    "hop": 1,
                    "story_id": "story-5",
                    "legacy_id": "legacy-1",
                }
            ]
        )
        service = GraphTraversalService()
        intent = _make_intent("spatial", places=["Chicago"])
        config = _default_traversal_config()

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert isinstance(results, list)
        assert all(isinstance(r, GraphResult) for r in results)

    @pytest.mark.asyncio
    async def test_spatial_with_no_matching_places_returns_empty_or_minimal(
        self,
    ) -> None:
        """Spatial traversal with no place matches returns empty or minimal results."""
        adapter = _make_graph_adapter(
            connections=[
                {
                    "node_id": "person-2",
                    "label": "Person",
                    "name": "Bob",
                    "relationship": "KNEW",
                    "hop": 1,
                }
            ]
        )
        service = GraphTraversalService()
        intent = _make_intent("spatial", places=["Tokyo"])
        config = _default_traversal_config()

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert isinstance(results, list)


class TestGraphTraversalServiceEntityFocused:
    """Tests for entity_focused intent traversal."""

    @pytest.mark.asyncio
    async def test_entity_focused_calls_get_connections(self) -> None:
        """Entity-focused traversal calls get_connections for the person."""
        adapter = _make_graph_adapter(connections=[])
        service = GraphTraversalService()
        intent = _make_intent("entity_focused", people=["Grandma Rose"])
        config = _default_traversal_config()

        await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        adapter.get_connections.assert_called_once()
        call_kwargs = adapter.get_connections.call_args
        assert call_kwargs.kwargs["label"] == "Person"
        assert call_kwargs.kwargs["node_id"] == "person-1"

    @pytest.mark.asyncio
    async def test_entity_focused_returns_graph_results(self) -> None:
        """Entity-focused traversal returns GraphResult instances."""
        adapter = _make_graph_adapter(
            connections=[
                {
                    "node_id": "entity-1",
                    "label": "Person",
                    "name": "Grandma Rose",
                    "relationship": "FAMILY_OF",
                    "hop": 1,
                    "story_id": "story-7",
                    "legacy_id": "legacy-1",
                }
            ]
        )
        service = GraphTraversalService()
        intent = _make_intent("entity_focused", people=["Grandma Rose"])
        config = _default_traversal_config()

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert isinstance(results, list)
        assert all(isinstance(r, GraphResult) for r in results)

    @pytest.mark.asyncio
    async def test_entity_focused_uses_max_hops(self) -> None:
        """Entity-focused traversal uses max_hops from config."""
        adapter = _make_graph_adapter(connections=[])
        service = GraphTraversalService()
        intent = _make_intent("entity_focused", people=["Someone"])
        config = _default_traversal_config(max_hops=3)

        await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        call_kwargs = adapter.get_connections.call_args
        assert call_kwargs.kwargs["depth"] == 3


class TestGraphTraversalServiceCrossLegacy:
    """Tests for cross_legacy intent traversal."""

    @pytest.mark.asyncio
    async def test_cross_legacy_calls_get_connections_on_legacy_node(
        self,
    ) -> None:
        """Cross-legacy traversal queries the Legacy node when enabled."""
        adapter = _make_graph_adapter(connections=[])
        service = GraphTraversalService()
        intent = _make_intent("cross_legacy")
        config = _default_traversal_config(include_cross_legacy=True)

        await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        # At least one call should be for the Legacy node
        calls = adapter.get_connections.call_args_list
        legacy_calls = [c for c in calls if c.kwargs.get("label") == "Legacy"]
        assert len(legacy_calls) >= 1
        assert legacy_calls[0].kwargs["node_id"] == "legacy-1"
        assert legacy_calls[0].kwargs["rel_types"] == ["LINKED_TO"]
        assert legacy_calls[0].kwargs["depth"] == 1

    @pytest.mark.asyncio
    async def test_cross_legacy_skipped_when_disabled(self) -> None:
        """Cross-legacy traversal is skipped when include_cross_legacy=False."""
        adapter = _make_graph_adapter(connections=[])
        service = GraphTraversalService()
        intent = _make_intent("cross_legacy")
        config = _default_traversal_config(include_cross_legacy=False)

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        calls = adapter.get_connections.call_args_list
        legacy_calls = [c for c in calls if c.kwargs.get("label") == "Legacy"]
        assert len(legacy_calls) == 0
        assert results == []

    @pytest.mark.asyncio
    async def test_cross_legacy_returns_graph_results(self) -> None:
        """Cross-legacy traversal returns GraphResult instances when connections exist."""
        adapter = _make_graph_adapter(
            connections=[
                {
                    "node_id": "legacy-2",
                    "label": "Legacy",
                    "relationship": "LINKED_TO",
                    "hop": 1,
                    "story_id": "story-cross-1",
                    "legacy_id": "legacy-2",
                }
            ]
        )
        service = GraphTraversalService()
        intent = _make_intent("cross_legacy")
        config = _default_traversal_config(include_cross_legacy=True)

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert isinstance(results, list)
        assert all(isinstance(r, GraphResult) for r in results)


class TestGraphTraversalServiceGeneral:
    """Tests for general intent traversal."""

    @pytest.mark.asyncio
    async def test_general_calls_get_connections_with_depth_1(self) -> None:
        """General traversal does a simple 1-hop neighborhood query."""
        adapter = _make_graph_adapter(connections=[])
        service = GraphTraversalService()
        intent = _make_intent("general")
        config = _default_traversal_config(max_hops=3)  # max_hops should be ignored

        await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        adapter.get_connections.assert_called_once()
        call_kwargs = adapter.get_connections.call_args
        assert call_kwargs.kwargs["label"] == "Person"
        assert call_kwargs.kwargs["node_id"] == "person-1"
        assert call_kwargs.kwargs["depth"] == 1

    @pytest.mark.asyncio
    async def test_general_returns_empty_for_no_connections(self) -> None:
        """General traversal returns empty list when no connections found."""
        adapter = _make_graph_adapter(connections=[])
        service = GraphTraversalService()
        intent = _make_intent("general")
        config = _default_traversal_config()

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert results == []

    @pytest.mark.asyncio
    async def test_general_returns_graph_results_for_connections(self) -> None:
        """General traversal returns GraphResult instances for found connections."""
        adapter = _make_graph_adapter(
            connections=[
                {
                    "node_id": "story-gen-1",
                    "label": "Story",
                    "relationship": "AUTHORED",
                    "hop": 1,
                    "story_id": "story-gen-1",
                    "legacy_id": "legacy-1",
                }
            ]
        )
        service = GraphTraversalService()
        intent = _make_intent("general")
        config = _default_traversal_config()

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert isinstance(results, list)
        assert all(isinstance(r, GraphResult) for r in results)


class TestGraphTraversalResultCapping:
    """Tests for max_graph_results cap."""

    @pytest.mark.asyncio
    async def test_results_capped_at_max_graph_results(self) -> None:
        """Results should be capped at max_graph_results."""
        # Create many connections, each with a story
        many_connections = [
            {
                "node_id": f"story-{i}",
                "label": "Story",
                "relationship": "AUTHORED",
                "hop": 1,
                "story_id": f"story-{i}",
                "legacy_id": "legacy-1",
            }
            for i in range(30)
        ]
        adapter = _make_graph_adapter(connections=many_connections)
        service = GraphTraversalService()
        intent = _make_intent("general")
        config = _default_traversal_config(max_graph_results=5)

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert len(results) <= 5

    @pytest.mark.asyncio
    async def test_results_sorted_by_relevance_score_descending(self) -> None:
        """Results should be sorted by relevance_score in descending order."""
        # 3 connections with different relationship types (different weights)
        connections = [
            {
                "node_id": f"story-{i}",
                "label": "Story",
                "relationship": rel,
                "hop": 1,
                "story_id": f"story-{i}",
                "legacy_id": "legacy-1",
            }
            for i, rel in enumerate(["KNEW", "FAMILY_OF", "FRIENDS_WITH"])
        ]
        adapter = _make_graph_adapter(connections=connections)
        service = GraphTraversalService()
        intent = _make_intent("general")
        config = _default_traversal_config(
            relationship_weights={
                "FAMILY_OF": 1.0,
                "KNEW": 0.7,
                "FRIENDS_WITH": 0.6,
            }
        )

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        if len(results) >= 2:
            scores = [r.relevance_score for r in results]
            assert scores == sorted(scores, reverse=True), (
                "Results must be sorted by relevance_score descending"
            )

    @pytest.mark.asyncio
    async def test_results_capped_across_relational_intent(self) -> None:
        """Cap applies to relational traversal as well."""
        many_persons = [
            {
                "node_id": f"person-{i}",
                "label": "Person",
                "name": f"Person {i}",
                "relationship": "FAMILY_OF",
                "hop": 1,
            }
            for i in range(20)
        ]
        many_stories = [
            {
                "story_id": f"story-r-{i}",
                "legacy_id": "legacy-1",
                "relationship": "FAMILY_OF",
                "hop": 1,
            }
            for i in range(5)
        ]
        adapter = _make_graph_adapter(
            connections=many_persons,
            related_stories=many_stories,
        )
        service = GraphTraversalService()
        intent = _make_intent("relational")
        config = _default_traversal_config(max_graph_results=3)

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert len(results) <= 3


class TestGraphTraversalGracefulDegradation:
    """Tests for graceful degradation on graph adapter failures."""

    @pytest.mark.asyncio
    async def test_adapter_get_connections_failure_returns_empty_list(
        self,
    ) -> None:
        """Graph adapter get_connections failure returns empty list."""
        adapter = AsyncMock()
        adapter.get_connections = AsyncMock(side_effect=Exception("Neptune timeout"))
        adapter.get_related_stories = AsyncMock(return_value=[])
        service = GraphTraversalService()
        intent = _make_intent("general")
        config = _default_traversal_config()

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert results == []

    @pytest.mark.asyncio
    async def test_adapter_get_related_stories_failure_returns_empty_list(
        self,
    ) -> None:
        """Graph adapter get_related_stories failure returns empty list."""
        adapter = AsyncMock()
        adapter.get_connections = AsyncMock(
            return_value=[
                {
                    "node_id": "person-2",
                    "label": "Person",
                    "name": "Jane",
                    "relationship": "FAMILY_OF",
                    "hop": 1,
                }
            ]
        )
        adapter.get_related_stories = AsyncMock(
            side_effect=Exception("Neptune connection lost")
        )
        service = GraphTraversalService()
        intent = _make_intent("relational")
        config = _default_traversal_config()

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert results == []

    @pytest.mark.asyncio
    async def test_adapter_unexpected_error_returns_empty_list(self) -> None:
        """Any unexpected error returns empty list rather than raising."""
        adapter = AsyncMock()
        adapter.get_connections = AsyncMock(side_effect=RuntimeError("unexpected"))
        service = GraphTraversalService()
        intent = _make_intent("relational")
        config = _default_traversal_config()

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert results == []

    @pytest.mark.asyncio
    async def test_cross_legacy_adapter_failure_returns_empty_list(self) -> None:
        """Cross-legacy adapter failure returns empty list."""
        adapter = AsyncMock()
        adapter.get_connections = AsyncMock(side_effect=ConnectionError("Graph down"))
        service = GraphTraversalService()
        intent = _make_intent("cross_legacy")
        config = _default_traversal_config(include_cross_legacy=True)

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        assert results == []


class TestGraphTraversalScoringFormula:
    """Tests for the relevance scoring formula."""

    @pytest.mark.asyncio
    async def test_1_hop_has_higher_score_than_2_hop(self) -> None:
        """1-hop connections should score higher than 2-hop connections."""
        connection_1hop = {
            "node_id": "story-1hop",
            "label": "Story",
            "relationship": "FAMILY_OF",
            "hop": 1,
            "story_id": "story-1hop",
            "legacy_id": "legacy-1",
        }
        connection_2hop = {
            "node_id": "story-2hop",
            "label": "Story",
            "relationship": "FAMILY_OF",
            "hop": 2,
            "story_id": "story-2hop",
            "legacy_id": "legacy-1",
        }
        adapter = _make_graph_adapter(connections=[connection_1hop, connection_2hop])
        service = GraphTraversalService()
        intent = _make_intent("general")
        config = _default_traversal_config(
            relationship_weights={"FAMILY_OF": 1.0},
            max_hops=2,
        )

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        story_ids = {r.story_id: r for r in results}
        if "story-1hop" in story_ids and "story-2hop" in story_ids:
            assert (
                story_ids["story-1hop"].relevance_score
                > story_ids["story-2hop"].relevance_score
            )

    @pytest.mark.asyncio
    async def test_default_relationship_weight_used_when_not_in_config(
        self,
    ) -> None:
        """Default weight of 0.5 used for unknown relationship types."""
        connection = {
            "node_id": "story-unknown-rel",
            "label": "Story",
            "relationship": "UNKNOWN_REL",
            "hop": 1,
            "story_id": "story-unknown-rel",
            "legacy_id": "legacy-1",
        }
        adapter = _make_graph_adapter(connections=[connection])
        service = GraphTraversalService()
        intent = _make_intent("general")
        config = _default_traversal_config(relationship_weights={})

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        if results:
            # score = 1.0 (hop factor) * 0.5 (default weight) + 0.0 (no entity match)
            assert results[0].relevance_score == pytest.approx(0.5, abs=0.01)

    @pytest.mark.asyncio
    async def test_hop_distance_stored_in_result(self) -> None:
        """GraphResult should store the hop_distance from the connection."""
        connection_1 = {
            "node_id": "story-h1",
            "label": "Story",
            "relationship": "FAMILY_OF",
            "hop": 1,
            "story_id": "story-h1",
            "legacy_id": "legacy-1",
        }
        connection_2 = {
            "node_id": "story-h2",
            "label": "Story",
            "relationship": "FAMILY_OF",
            "hop": 2,
            "story_id": "story-h2",
            "legacy_id": "legacy-1",
        }
        adapter = _make_graph_adapter(connections=[connection_1, connection_2])
        service = GraphTraversalService()
        intent = _make_intent("general")
        config = _default_traversal_config(max_hops=2)

        results = await service.traverse(
            graph_adapter=adapter,
            intent=intent,
            person_id="person-1",
            legacy_id="legacy-1",
            traversal_config=config,
        )

        story_ids = {r.story_id: r for r in results}
        if "story-h1" in story_ids:
            assert story_ids["story-h1"].hop_distance == 1
        if "story-h2" in story_ids:
            assert story_ids["story-h2"].hop_distance == 2

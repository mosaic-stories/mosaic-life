"""Tests for graph context REST endpoint."""

from __future__ import annotations

from app.schemas.graph_context import (
    EntityGroup,
    GraphContextResponse,
    RelatedStory,
)


class TestGraphContextSchema:
    """Test the response schema."""

    def test_related_story_schema(self) -> None:
        story = RelatedStory(
            id="abc-123",
            title="A Summer Story",
            snippet="The summer of 1992...",
            relevance=0.85,
        )
        assert story.relevance == 0.85

    def test_entity_group_schema(self) -> None:
        group = EntityGroup(
            people=[{"name": "Uncle Jim", "context": "brother"}],
            places=[{"name": "Chicago", "type": "city"}],
            events=[],
            objects=[],
        )
        assert len(group.people) == 1

    def test_full_response_schema(self) -> None:
        resp = GraphContextResponse(
            related_stories=[
                RelatedStory(id="s1", title="First", snippet="...", relevance=0.9)
            ],
            entities=EntityGroup(
                people=[],
                places=[],
                events=[],
                objects=[],
            ),
        )
        assert len(resp.related_stories) == 1

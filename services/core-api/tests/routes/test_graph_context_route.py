"""Tests for graph context REST endpoint."""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.schemas.graph_context import (
    EntityGroup,
    GraphContextResponse,
    RelatedStory,
)
from app.models.story import Story
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


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


class TestGraphContextRoute:
    """Route-level tests for GET /api/stories/{story_id}/graph-context."""

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient) -> None:
        response = await client.get(f"/api/stories/{uuid4()}/graph-context")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_404_for_missing_story(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.get(
            f"/api/stories/{uuid4()}/graph-context",
            headers=auth_headers,
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "Story not found"

    @pytest.mark.asyncio
    async def test_rejects_unauthorized_story_access(
        self,
        client: AsyncClient,
        test_story: Story,
        test_user_2: User,
    ) -> None:
        other_headers = create_auth_headers_for_user(test_user_2)
        response = await client.get(
            f"/api/stories/{test_story.id}/graph-context",
            headers=other_headers,
        )

        assert response.status_code == 403
        assert response.json()["detail"] == "Not authorized to view this story"

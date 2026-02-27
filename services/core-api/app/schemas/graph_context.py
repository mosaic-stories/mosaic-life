"""Schemas for the graph context REST endpoint."""

from __future__ import annotations

from pydantic import BaseModel


class RelatedStory(BaseModel):
    """A story related to the current one via graph connections."""

    id: str
    title: str
    snippet: str
    relevance: float


class EntityGroup(BaseModel):
    """Entities grouped by type."""

    people: list[dict[str, str]] = []
    places: list[dict[str, str]] = []
    events: list[dict[str, str]] = []
    objects: list[dict[str, str]] = []


class GraphContextResponse(BaseModel):
    """Response for GET /api/stories/{story_id}/graph-context."""

    related_stories: list[RelatedStory] = []
    entities: EntityGroup = EntityGroup()

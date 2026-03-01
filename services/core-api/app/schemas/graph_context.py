"""Schemas for the graph context REST endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field


class RelatedStory(BaseModel):
    """A story related to the current one via graph connections."""

    id: str
    title: str
    snippet: str
    relevance: float


class EntityGroup(BaseModel):
    """Entities grouped by type."""

    people: list[dict[str, str]] = Field(default_factory=list)
    places: list[dict[str, str]] = Field(default_factory=list)
    events: list[dict[str, str]] = Field(default_factory=list)
    objects: list[dict[str, str]] = Field(default_factory=list)


class GraphContextResponse(BaseModel):
    """Response for GET /api/stories/{story_id}/graph-context."""

    related_stories: list[RelatedStory] = Field(default_factory=list)
    entities: EntityGroup = Field(default_factory=EntityGroup)

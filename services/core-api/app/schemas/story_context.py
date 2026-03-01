"""Schemas for the story context REST endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


FactCategory = Literal[
    "person", "place", "date", "event", "emotion", "relationship", "object"
]
FactSource = Literal["story", "conversation"]
FactStatus = Literal["active", "pinned", "dismissed"]


class ContextFactResponse(BaseModel):
    """A single extracted fact."""

    id: UUID
    category: FactCategory
    content: str
    detail: str | None
    source: FactSource
    status: FactStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class StoryContextResponse(BaseModel):
    """Full context for a story: summary + facts."""

    id: UUID
    story_id: UUID
    summary: str | None
    summary_updated_at: datetime | None
    extracting: bool
    facts: list[ContextFactResponse]

    model_config = {"from_attributes": True}


class ExtractRequest(BaseModel):
    """Request to trigger context extraction."""

    force: bool = False


class ExtractResponse(BaseModel):
    """Response from extraction trigger."""

    status: Literal["extracting", "cached"]


class FactStatusUpdate(BaseModel):
    """Request to update a fact's status."""

    status: FactStatus


class PinnedFact(BaseModel):
    """A pinned fact sent to the rewrite endpoint."""

    category: FactCategory
    content: str
    detail: str | None = None

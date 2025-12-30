"""Schemas for knowledge retrieval."""

from uuid import UUID

from pydantic import BaseModel, Field


class ChunkResult(BaseModel):
    """Result from vector similarity search."""

    chunk_id: UUID
    story_id: UUID
    content: str
    similarity: float = Field(..., ge=0.0, le=1.0)


class VisibilityFilter(BaseModel):
    """Filter configuration for visibility-based access."""

    allowed_visibilities: list[str]
    personal_author_id: UUID  # For filtering personal stories to author only

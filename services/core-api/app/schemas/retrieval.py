"""Schemas for knowledge retrieval."""

from uuid import UUID

from pydantic import BaseModel, Field


class ChunkResult(BaseModel):
    """Result from vector similarity search.

    Note: Cosine similarity range is [-1, 1]. Computed as 1 - (cosine distance).
    """

    chunk_id: UUID
    story_id: UUID
    content: str
    similarity: float = Field(..., ge=-1.0, le=1.0)


class VisibilityFilter(BaseModel):
    """Filter configuration for visibility-based access."""

    allowed_visibilities: list[str]
    personal_author_id: UUID  # For filtering personal stories to author only


class LinkedLegacyFilter(BaseModel):
    """Filter describing which chunks from a linked legacy to include.

    - share_mode ``all``: include all public/private chunks from the legacy.
    - share_mode ``selective``: include only the specifically shared story IDs.
    """

    legacy_id: UUID
    share_mode: str  # "all" | "selective"
    story_ids: list[UUID]  # Populated for "selective" mode; ignored for "all"

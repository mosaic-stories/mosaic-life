"""Schemas for the story rewrite endpoint."""

from __future__ import annotations

from pydantic import BaseModel


class RewriteRequest(BaseModel):
    """Request body for POST /api/stories/{story_id}/rewrite."""

    content: str
    conversation_id: str | None = None
    pinned_context_ids: list[str] = []
    writing_style: str | None = None
    length_preference: str | None = None
    persona_id: str = "biographer"

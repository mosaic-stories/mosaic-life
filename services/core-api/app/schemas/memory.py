"""Pydantic schemas for agent memory API."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class FactResponse(BaseModel):
    """Schema for legacy fact response."""

    id: UUID
    legacy_id: UUID
    user_id: UUID
    category: str
    content: str
    visibility: Literal["private", "shared"]
    source_conversation_id: UUID | None
    extracted_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FactVisibilityUpdate(BaseModel):
    """Schema for updating fact visibility."""

    visibility: Literal["private", "shared"] = Field(
        ..., description="New visibility: 'private' or 'shared'"
    )


class SummarizeExtractResponse(BaseModel):
    """Parsed response from the summarize-and-extract LLM call."""

    summary: str
    facts: list[dict[str, str]] = Field(
        default_factory=list,
        description="List of dicts with 'category' and 'content' keys",
    )

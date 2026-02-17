"""Pydantic schemas for story evolution endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator


WritingStyle = Literal["vivid", "emotional", "conversational", "concise", "documentary"]
LengthPreference = Literal["similar", "shorter", "longer"]
EvolutionPhase = Literal[
    "elicitation",
    "summary",
    "style_selection",
    "drafting",
    "review",
    "completed",
    "discarded",
]


class EvolutionSessionCreate(BaseModel):
    """Request to start a new evolution session."""

    persona_id: str


class PhaseAdvanceRequest(BaseModel):
    """Request to advance the workflow phase."""

    phase: EvolutionPhase
    summary_text: str | None = None
    writing_style: WritingStyle | None = None
    length_preference: LengthPreference | None = None

    @field_validator("writing_style")
    @classmethod
    def validate_style_with_phase(cls, v: str | None, info: object) -> str | None:
        return v

    @field_validator("length_preference")
    @classmethod
    def validate_length_with_phase(cls, v: str | None, info: object) -> str | None:
        return v


class GenerateRequest(BaseModel):
    """Request to trigger draft generation (empty body, triggers from style_selection)."""

    pass


class RevisionRequest(BaseModel):
    """Request to revise the current draft."""

    instructions: str

    @field_validator("instructions")
    @classmethod
    def instructions_not_empty(cls, v: str) -> str:
        if not v.strip():
            msg = "Revision instructions cannot be empty"
            raise ValueError(msg)
        return v


class EvolutionSessionResponse(BaseModel):
    """Response containing full session state."""

    id: uuid.UUID
    story_id: uuid.UUID
    base_version_number: int
    conversation_id: uuid.UUID
    draft_version_id: uuid.UUID | None
    phase: EvolutionPhase
    summary_text: str | None
    writing_style: WritingStyle | None
    length_preference: LengthPreference | None
    revision_count: int
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EvolutionSSEChunkEvent(BaseModel):
    """SSE chunk event for draft streaming."""

    type: Literal["chunk"] = "chunk"
    text: str


class EvolutionSSEDoneEvent(BaseModel):
    """SSE done event when draft generation completes."""

    type: Literal["done"] = "done"
    version_id: uuid.UUID
    version_number: int

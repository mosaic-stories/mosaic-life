"""Pydantic schemas for AI chat API."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


# ============================================================================
# Persona Schemas
# ============================================================================


class PersonaResponse(BaseModel):
    """Schema for persona information."""

    id: str = Field(..., description="Persona identifier (e.g., 'biographer')")
    name: str = Field(..., description="Display name")
    icon: str = Field(..., description="Icon name for UI")
    description: str = Field(..., description="Short description of persona's role")


# ============================================================================
# Conversation Schemas
# ============================================================================


class ConversationCreate(BaseModel):
    """Schema for creating a new conversation."""

    legacy_id: UUID = Field(..., description="Legacy this conversation is about")
    persona_id: str = Field(..., description="Persona to chat with")


class ConversationResponse(BaseModel):
    """Schema for conversation response."""

    id: UUID
    user_id: UUID
    legacy_id: UUID
    persona_id: str
    title: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationSummary(BaseModel):
    """Schema for conversation list item."""

    id: UUID
    legacy_id: UUID
    persona_id: str
    title: str | None
    message_count: int = Field(default=0)
    last_message_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ============================================================================
# Message Schemas
# ============================================================================


class MessageCreate(BaseModel):
    """Schema for sending a new message."""

    content: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Message content",
    )


class MessageResponse(BaseModel):
    """Schema for message response."""

    id: UUID
    conversation_id: UUID
    role: Literal["user", "assistant"]
    content: str
    token_count: int | None
    created_at: datetime
    blocked: bool = Field(
        default=False,
        description="Whether message was blocked by guardrail",
    )

    model_config = {"from_attributes": True}


class MessageListResponse(BaseModel):
    """Schema for paginated message list."""

    messages: list[MessageResponse]
    total: int
    has_more: bool


# ============================================================================
# SSE Event Schemas
# ============================================================================


class SSEChunkEvent(BaseModel):
    """SSE event for streaming content chunk."""

    type: Literal["chunk"] = "chunk"
    content: str


class SSEDoneEvent(BaseModel):
    """SSE event for stream completion."""

    type: Literal["done"] = "done"
    message_id: UUID
    token_count: int | None


class SSEErrorEvent(BaseModel):
    """SSE event for stream error."""

    type: Literal["error"] = "error"
    message: str
    retryable: bool = False

"""Pydantic schemas for story prompts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class StoryPromptResponse(BaseModel):
    """Response schema for a story prompt."""

    id: str
    legacy_id: str
    legacy_name: str
    legacy_profile_image_url: str | None = None
    prompt_text: str
    category: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ActOnPromptRequest(BaseModel):
    """Request to act on a prompt."""

    action: Literal["write_story", "discuss"]


class ActOnPromptResponse(BaseModel):
    """Response after acting on a prompt."""

    action: str
    legacy_id: str
    story_id: str | None = None
    conversation_id: str | None = None

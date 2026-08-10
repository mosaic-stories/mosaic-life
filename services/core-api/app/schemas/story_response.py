"""Pydantic schemas for Story Response API."""

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

# Strip HTML tags so a pasted-in `<b>bold</b>` or `<script>` never survives as
# markup — responses are plain text only (line breaks preserved, no rich
# formatting). This mirrors the "reject/strip HTML" requirement from the
# story-responses spec; there is no bleach/nh3 dependency in this codebase, so
# a conservative tag-stripping regex is used instead (matches the stdlib-only
# `html.escape` precedent used elsewhere, e.g. `app/services/email.py`).
_HTML_TAG_RE = re.compile(r"<[^>]*>")

MAX_RESPONSE_BODY_LENGTH = 5000


def _strip_html_tags(value: str) -> str:
    """Remove HTML-tag-like sequences while preserving text and line breaks."""
    return _HTML_TAG_RE.sub("", value)


class StoryResponseBody(BaseModel):
    """Shared body validation for create/update requests."""

    body: str = Field(
        ...,
        min_length=1,
        max_length=MAX_RESPONSE_BODY_LENGTH,
        description="Plain-text response body. Line breaks are preserved; "
        "HTML tags are stripped.",
    )

    @field_validator("body")
    @classmethod
    def _sanitize_body(cls, v: str) -> str:
        stripped = _strip_html_tags(v).strip()
        if not stripped:
            raise ValueError("Response body cannot be empty")
        return stripped


class StoryResponseCreate(StoryResponseBody):
    """Schema for creating a new story response."""


class StoryResponseUpdate(StoryResponseBody):
    """Schema for editing an existing story response."""


class ConvertedStorySummary(BaseModel):
    """Summary of the story a response was converted into."""

    id: UUID
    title: str
    legacy_id: UUID | None = None

    model_config = {"from_attributes": True}


class StoryResponseItem(BaseModel):
    """A single response returned by the API."""

    id: UUID
    story_id: UUID
    user_id: UUID
    user_name: str
    user_username: str
    user_avatar_url: str | None = None
    body: str
    created_at: datetime
    edited_at: datetime | None = Field(
        default=None,
        description="Non-null when the response has been edited since creation",
    )
    converted_story_id: UUID | None = Field(
        default=None,
        description="Non-null when this response was converted into a standalone "
        "story; the response renders as a non-editable note linking to it",
    )
    converted_story: ConvertedStorySummary | None = Field(
        default=None,
        description="Summary of the converted story, when converted_story_id is set",
    )
    offer_dismissed_at: datetime | None = Field(
        default=None,
        description="Non-null once the response's author has dismissed the "
        "'make this a story' offer for this response",
    )
    hidden: bool = Field(
        default=False,
        description="True when the story author has hidden this converted note "
        "from other viewers. List endpoints filter hidden notes out for everyone "
        "except the note's author; mutation responses may also return this flag "
        "to the story author who hid the note.",
    )

    model_config = {"from_attributes": True}


class StoryResponseListResponse(BaseModel):
    """Cursor-paginated list of a story's responses (oldest first)."""

    items: list[StoryResponseItem]
    next_cursor: str | None = Field(
        default=None, description="ISO timestamp cursor for next page"
    )
    has_more: bool = False

"""Schemas for user statistics."""

from datetime import datetime

from pydantic import BaseModel


class UserStatsResponse(BaseModel):
    """Response containing user statistics."""

    member_since: datetime
    legacies_count: int
    stories_count: int
    media_count: int
    storage_used_bytes: int
    chat_sessions_count: int
    legacy_views_total: int
    collaborators_count: int

"""Schemas for the Connections Hub endpoints."""

from uuid import UUID

from pydantic import BaseModel


class ConnectionsStatsResponse(BaseModel):
    """Stats for the Connections Hub header."""

    conversations_count: int
    people_count: int
    shared_legacies_count: int
    personas_used_count: int


class TopConnectionResponse(BaseModel):
    """A person the user shares legacies with."""

    user_id: UUID
    display_name: str
    username: str
    avatar_url: str | None
    shared_legacy_count: int


class FavoritePersonaResponse(BaseModel):
    """A persona ranked by conversation count."""

    persona_id: str
    persona_name: str
    persona_icon: str
    conversation_count: int


class SharedLegacySummary(BaseModel):
    """A legacy shared between two users."""

    legacy_id: UUID
    legacy_name: str
    user_role: str
    connection_role: str


class PersonConnectionResponse(BaseModel):
    """A human connection with shared legacy details."""

    user_id: UUID
    display_name: str
    username: str
    avatar_url: str | None
    shared_legacy_count: int
    shared_legacies: list[SharedLegacySummary]
    highest_shared_role: str


class PeopleCounts(BaseModel):
    """Filter counts for the People tab."""

    all: int
    co_creators: int
    collaborators: int


class PeopleResponse(BaseModel):
    """Response for the People tab endpoint."""

    items: list[PersonConnectionResponse]
    counts: PeopleCounts

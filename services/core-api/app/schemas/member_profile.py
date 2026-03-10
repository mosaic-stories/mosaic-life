"""Pydantic schemas for member relationship profiles."""

from enum import Enum

from pydantic import BaseModel, Field


class RelationshipType(str, Enum):
    """Supported relationship types."""

    parent = "parent"
    child = "child"
    spouse = "spouse"
    sibling = "sibling"
    grandparent = "grandparent"
    grandchild = "grandchild"
    aunt = "aunt"
    uncle = "uncle"
    cousin = "cousin"
    niece = "niece"
    nephew = "nephew"
    in_law = "in_law"
    friend = "friend"
    colleague = "colleague"
    mentor = "mentor"
    mentee = "mentee"
    caregiver = "caregiver"
    neighbor = "neighbor"
    other = "other"


class GenderType(str, Enum):
    """Supported gender options."""

    male = "male"
    female = "female"
    non_binary = "non_binary"
    prefer_not_to_say = "prefer_not_to_say"


class MemberProfileUpdate(BaseModel):
    """Request to create or update a member's relationship profile."""

    relationship_type: RelationshipType | None = None
    nickname: str | None = Field(None, max_length=100)
    legacy_to_viewer: str | None = Field(None, max_length=1000)
    viewer_to_legacy: str | None = Field(None, max_length=1000)
    character_traits: list[str] | None = None


class MemberProfileResponse(BaseModel):
    """Response containing a member's relationship profile."""

    relationship_type: RelationshipType | None = None
    nickname: str | None = None
    legacy_to_viewer: str | None = None
    viewer_to_legacy: str | None = None
    character_traits: list[str] | None = None

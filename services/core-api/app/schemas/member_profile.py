"""Pydantic schemas for member relationship profiles."""

from enum import Enum

from pydantic import BaseModel, Field, field_validator


class GenderType(str, Enum):
    """Supported gender options."""

    male = "male"
    female = "female"
    non_binary = "non_binary"
    prefer_not_to_say = "prefer_not_to_say"


# Predefined relationship types (not enforced server-side; used for frontend suggestions)
PREDEFINED_RELATIONSHIP_TYPES: list[str] = [
    "parent",
    "child",
    "spouse",
    "sibling",
    "grandparent",
    "grandchild",
    "aunt",
    "uncle",
    "cousin",
    "niece",
    "nephew",
    "in_law",
    "friend",
    "colleague",
    "mentor",
    "mentee",
    "caregiver",
    "neighbor",
    "other",
]


class MemberProfileUpdate(BaseModel):
    """Request to create or update a member's relationship profile."""

    relationship_type: str | None = Field(None, max_length=50)
    nicknames: list[str] | None = None
    legacy_to_viewer: str | None = Field(None, max_length=1000)
    viewer_to_legacy: str | None = Field(None, max_length=1000)
    character_traits: list[str] | None = None

    @field_validator("nicknames")
    @classmethod
    def validate_nicknames(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            if len(v) > 10:
                msg = "Maximum 10 nicknames allowed"
                raise ValueError(msg)
            for name in v:
                if len(name) > 100:
                    msg = "Each nickname must be 100 characters or less"
                    raise ValueError(msg)
        return v

    @field_validator("character_traits")
    @classmethod
    def validate_character_traits(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        if len(v) > 20:
            msg = "Maximum 20 character traits allowed"
            raise ValueError(msg)
        for trait in v:
            if not trait.strip():
                msg = "Character traits must not be empty"
                raise ValueError(msg)
            if len(trait) > 100:
                msg = "Each character trait must be 100 characters or less"
                raise ValueError(msg)
        return v


class MemberProfileResponse(BaseModel):
    """Response containing a member's relationship profile."""

    relationship_type: str | None = None
    nicknames: list[str] | None = None
    legacy_to_viewer: str | None = None
    viewer_to_legacy: str | None = None
    character_traits: list[str] | None = None

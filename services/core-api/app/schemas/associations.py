# services/core-api/app/schemas/associations.py
"""Pydantic schemas for legacy associations."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class LegacyAssociationCreate(BaseModel):
    """Schema for creating a legacy association."""

    legacy_id: UUID = Field(..., description="Legacy ID to associate")
    role: Literal["primary", "secondary"] = Field(
        default="primary",
        description="Role of this legacy in the content",
    )
    position: int = Field(
        default=0,
        ge=0,
        description="Display order position",
    )


class LegacyAssociationResponse(BaseModel):
    """Schema for legacy association in responses."""

    legacy_id: UUID
    legacy_name: str
    role: str
    position: int

    model_config = {"from_attributes": True}


class LegacyAssociationUpdate(BaseModel):
    """Schema for updating legacy associations."""

    legacy_id: UUID
    role: Literal["primary", "secondary"] | None = None
    position: int | None = Field(None, ge=0)

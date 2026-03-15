"""Profile settings model for user visibility controls."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .user import User


class VisibilityTier(str, Enum):
    """Audience tiers for profile content visibility."""

    NOBODY = "nobody"
    CONNECTIONS = "connections"
    AUTHENTICATED = "authenticated"
    PUBLIC = "public"


class ProfileSettings(Base):
    """User profile visibility settings."""

    __tablename__ = "profile_settings"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    discoverable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    visibility_legacies: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=VisibilityTier.NOBODY.value,
        server_default=VisibilityTier.NOBODY.value,
    )
    visibility_stories: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=VisibilityTier.NOBODY.value,
        server_default=VisibilityTier.NOBODY.value,
    )
    visibility_media: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=VisibilityTier.NOBODY.value,
        server_default=VisibilityTier.NOBODY.value,
    )
    visibility_connections: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=VisibilityTier.NOBODY.value,
        server_default=VisibilityTier.NOBODY.value,
    )
    visibility_bio: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=VisibilityTier.CONNECTIONS.value,
        server_default=VisibilityTier.CONNECTIONS.value,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<ProfileSettings(user_id={self.user_id}, discoverable={self.discoverable})>"
